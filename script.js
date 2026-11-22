// FRONTEND — Portal Aula Digital & Asistencia CENTED

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycby5whpgO3AnwENYrV_Ov-oyGo5cpaH8EXVnsnoiKwJeT-UgQ7qPkH145H5VHR-W1N-P/exec";
window.SCRIPT_URL = SCRIPT_URL;

const GOOGLE_CLIENT_ID = "512310432623-bd9rb3vpefk70i9gblg8ol25qhqrio8f.apps.googleusercontent.com";

const ZONA_HORARIA_SV = "America/El_Salvador";
const STORAGE_KEY_BORRADOR = "cented_borrador_clave";
const STORAGE_KEY_CLAVE_UNICA = "cented_clave_unica";
const COOKIE_BORRADOR = "cented_borrador_clave";
const COOKIE_CLAVE_UNICA = "cented_clave_unica";
const SESSION_KEY_ALUMNOS = "cented_lista_alumnos_v1";
const ALUMNOS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
const COOLDOWN_ERROR_MS = 2500;

let geoActivaGlobal = true;
let coordsActuales = null;
let estudianteSeleccionadoClave = "";
let googleButtonRenderizado = false;
let ultimaAccionFallida = null;

// ── SANITIZACIÓN, ESTADO DE RED Y UTILIDADES DE UI ──────────────────

function sanitizarTexto(str, maxLen = 150) {
  return String(str || "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/^[=+\-@\t\r]+/, "")
    .trim()
    .slice(0, maxLen);
}

function actualizarIndicadorRed(estado) {
  const dot = document.getElementById("live-status-dot");
  const pill = document.getElementById("live-status-pill");
  if (!dot) return;

  dot.classList.remove("slow", "offline");
  if (!navigator.onLine || estado === "offline") {
    dot.classList.add("offline");
    if (pill) pill.title = "Sin conexión a internet o servidor no disponible";
  } else if (estado === "slow") {
    dot.classList.add("slow");
    if (pill) pill.title = "Conectando con el servidor...";
  } else {
    if (pill) pill.title = "Conectado y en línea";
  }
}

function mostrarAlerta(idElemento, tipo, mensaje) {
  const box = document.getElementById(idElemento);
  if (!box) return;
  box.className = "alert-box " + tipo;
  box.textContent = mensaje;
  box.style.display = "block";
}

function limpiarAlerta(idElemento) {
  const box = document.getElementById(idElemento);
  if (!box) return;
  box.className = "alert-box";
  box.textContent = "";
  box.style.display = "none";
}

function mostrarToast(mensaje, tipo = "info") {
  const container = document.getElementById("toast-box-container");
  if (!container) return;
  const card = document.createElement("div");
  card.className = "toast-card " + tipo;
  card.textContent = mensaje;
  container.appendChild(card);

  setTimeout(() => {
    card.style.animation = "toastOut 0.3s ease forwards";
    setTimeout(() => card.remove(), 320);
  }, 3600);
}

function cambiarVista(idVista) {
  document.querySelectorAll(".card-view").forEach((vista) => {
    vista.classList.remove("active");
  });
  const destino = document.getElementById(idVista);
  if (destino) {
    destino.classList.add("active");
  }
}

function habilitarConCooldown(btn, textoOriginal, huboError) {
  if (!btn) return;
  if (!huboError) {
    btn.disabled = false;
    btn.textContent = textoOriginal;
    return;
  }
  btn.disabled = true;
  btn.textContent = "⏳ Espera un momento...";
  setTimeout(() => {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }, COOLDOWN_ERROR_MS);
}

// ── COOKIES Y ALMACENAMIENTO LOCAL (RECORDAR DATOS DEL ALUMNO) ──────

function guardarCookie(nombre, valor, dias = 180) {
  try {
    const exp = new Date(Date.now() + dias * 86400000).toUTCString();
    const secureFlag = location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      encodeURIComponent(nombre) +
      "=" +
      encodeURIComponent(valor) +
      "; expires=" +
      exp +
      "; path=/; SameSite=Lax" +
      secureFlag;
  } catch (_) {}
}

function leerCookie(nombre) {
  try {
    const prefijo = encodeURIComponent(nombre) + "=";
    const partes = document.cookie.split(";");
    for (let i = 0; i < partes.length; i++) {
      const c = partes[i].trim();
      if (c.indexOf(prefijo) === 0) {
        return decodeURIComponent(c.substring(prefijo.length));
      }
    }
  } catch (_) {}
  return "";
}

function guardarBorradorClave() {
  const datos = {
    nombre: sanitizarTexto(document.getElementById("gen-name")?.value, 120),
    docente: sanitizarTexto(document.getElementById("gen-teacher")?.value, 80),
    telefono: sanitizarTexto(document.getElementById("gen-phone")?.value, 15),
    correo: sanitizarTexto(document.getElementById("gen-email")?.value, 120),
    cumple: sanitizarTexto(document.getElementById("gen-birthday")?.value, 10)
  };
  const json = JSON.stringify(datos);
  try {
    localStorage.setItem(STORAGE_KEY_BORRADOR, json);
  } catch (_) {}
  guardarCookie(COOKIE_BORRADOR, json, 180);
}

function cargarBorradorClave() {
  let raw = "";
  try {
    raw = localStorage.getItem(STORAGE_KEY_BORRADOR) || "";
  } catch (_) {}
  if (!raw) raw = leerCookie(COOKIE_BORRADOR);
  if (!raw) return;

  try {
    const datos = JSON.parse(raw);
    if (!datos || typeof datos !== "object") return;
    const setIfEmpty = (id, val, maxLen) => {
      const el = document.getElementById(id);
      if (el && typeof val === "string" && val.trim() && !String(el.value || "").trim()) {
        el.value = sanitizarTexto(val, maxLen);
      }
    };
    setIfEmpty("gen-name", datos.nombre, 120);
    setIfEmpty("gen-teacher", datos.docente, 80);
    setIfEmpty("gen-phone", datos.telefono, 15);
    setIfEmpty("gen-email", datos.correo, 120);
    setIfEmpty("gen-birthday", datos.cumple, 10);
  } catch (_) {}
}

function guardarClaveLocal(clave) {
  if (!clave) return;
  const limpia = sanitizarTexto(clave, 4).toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(limpia)) return;
  try {
    localStorage.setItem(STORAGE_KEY_CLAVE_UNICA, limpia);
  } catch (_) {}
  guardarCookie(COOKIE_CLAVE_UNICA, limpia, 365);
}

function limpiarClaveLocal() {
  try {
    localStorage.removeItem(STORAGE_KEY_CLAVE_UNICA);
  } catch (_) {}
  guardarCookie(COOKIE_CLAVE_UNICA, "", -1);
  const regKey = document.getElementById("reg-key");
  const btnClear = document.getElementById("btn-clear-saved-key");
  if (regKey) regKey.value = "";
  if (btnClear) btnClear.style.display = "none";
  mostrarToast("Clave guardada eliminada de este dispositivo.", "info");
}

function cargarClaveLocalEnRegistro() {
  const regKey = document.getElementById("reg-key");
  const btnClear = document.getElementById("btn-clear-saved-key");
  if (!regKey) return;

  let guardada = "";
  try {
    guardada = localStorage.getItem(STORAGE_KEY_CLAVE_UNICA) || "";
  } catch (_) {}
  if (!guardada) guardada = leerCookie(COOKIE_CLAVE_UNICA);

  const limpia = sanitizarTexto(guardada, 4).toUpperCase();
  if (/^[A-Z0-9]{4}$/.test(limpia)) {
    if (!regKey.value.trim()) regKey.value = limpia;
    if (btnClear) btnClear.style.display = "inline-block";
  } else if (btnClear) {
    btnClear.style.display = "none";
  }
}

// ── GOOGLE SIGN-IN (RELLENAR NOMBRE + GMAIL EN 1 CLIC) ───────────────

function decodificarJwtPayload(token) {
  const base64Url = token.split(".")[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function capitalizarNombre(texto) {
  return sanitizarTexto(texto, 120)
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((p) => p.charAt(0).toLocaleUpperCase("es") + p.slice(1).toLocaleLowerCase("es"))
    .join(" ");
}

function manejarRespuestaGoogle(response) {
  try {
    const data = decodificarJwtPayload(response.credential);
    const inputName = document.getElementById("gen-name");
    const inputEmail = document.getElementById("gen-email");

    if (inputName && typeof data.name === "string" && data.name.trim()) {
      inputName.value = capitalizarNombre(data.name);
    }
    if (inputEmail && typeof data.email === "string") {
      const correoLimpio = sanitizarTexto(data.email, 120).toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoLimpio)) {
        inputEmail.value = correoLimpio;
      }
    }

    guardarBorradorClave();
    mostrarToast("Nombre y Gmail rellenados desde Google.", "success");
  } catch (_) {
    mostrarToast("No se pudieron leer los datos de Google.", "warning");
  }
}

function inicializarGoogleAutoFill() {
  if (googleButtonRenderizado) return;
  const contenedor = document.getElementById("google-autofill-btn");
  if (!contenedor || !window.google?.accounts?.id) return;
  if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.indexOf("TU_CLIENT_ID") === 0) return;

  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: manejarRespuestaGoogle
  });

  window.google.accounts.id.renderButton(contenedor, {
    theme: "outline",
    size: "large",
    text: "continue_with",
    locale: "es"
  });
  googleButtonRenderizado = true;
}

// ── RELOJ EN VIVO (EL SALVADOR) Y TEMA OSCURO ───────────────────────

function actualizarReloj() {
  const clockEl = document.getElementById("live-clock");
  if (!clockEl) return;
  try {
    const ahora = new Date();
    const horaStr = new Intl.DateTimeFormat("en-US", {
      timeZone: ZONA_HORARIA_SV,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    }).format(ahora);
    clockEl.textContent = horaStr;
  } catch (_) {
    clockEl.textContent = new Date().toLocaleTimeString();
  }
}

function inicializarTema() {
  const toggle = document.getElementById("theme-toggle-input");
  const icon = document.getElementById("theme-icon");
  const guardado = localStorage.getItem("cented_theme");

  if (guardado === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    if (toggle) toggle.checked = true;
    if (icon) icon.textContent = "☀️";
  }

  if (toggle) {
    toggle.addEventListener("change", () => {
      const oscuro = toggle.checked;
      if (oscuro) {
        document.documentElement.setAttribute("data-theme", "dark");
        localStorage.setItem("cented_theme", "dark");
        if (icon) icon.textContent = "☀️";
      } else {
        document.documentElement.removeAttribute("data-theme");
        localStorage.setItem("cented_theme", "light");
        if (icon) icon.textContent = "🌙";
      }
    });
  }
}

// ── FIRMA DE INTEGRIDAD DE PETICIÓN (HMAC-SHA256) ───────────────────

function obtenerFechaClaveSv() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA_SV,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function generarNonce() {
  const arr = new Uint8Array(16);
  if (window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function sha256FallbackBytes(ascii) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let result = [];
  const words = [];
  const asciiBitLength = ascii.length * 8;
  const hash = [];
  const k = [];
  let primeCounter = 0;
  const isComposite = {};

  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  ascii += "\x80";
  while ((ascii.length % 64) - 56) ascii += "\x00";
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (let j = 0; j < words.length;) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const a = hash[0];
      const e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash.unshift((temp1 + temp2) | 0);
      hash[4] = (hash[4] + temp1) | 0;
      hash.pop();
    }
    for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
  }

  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      result.push((hash[i] >> (j * 8)) & 255);
    }
  }
  return result;
}

function hmacSha256FallbackHex(keyStr, msgStr) {
  const enc = new TextEncoder();
  let keyBytes = Array.from(enc.encode(keyStr));
  const msgBytes = Array.from(enc.encode(msgStr));
  if (keyBytes.length > 64) {
    const keyAscii = keyBytes.map((b) => String.fromCharCode(b)).join("");
    keyBytes = sha256FallbackBytes(keyAscii);
  }
  while (keyBytes.length < 64) keyBytes.push(0);

  const oKeyPad = keyBytes.map((b) => String.fromCharCode(b ^ 0x5c)).join("");
  const iKeyPad = keyBytes.map((b) => String.fromCharCode(b ^ 0x36)).join("");
  const msgAscii = msgBytes.map((b) => String.fromCharCode(b)).join("");

  const innerHash = sha256FallbackBytes(iKeyPad + msgAscii)
    .map((b) => String.fromCharCode(b))
    .join("");
  const outerHash = sha256FallbackBytes(oKeyPad + innerHash);
  return outerHash.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(keyStr, msgStr) {
  if (window.crypto && window.crypto.subtle) {
    const enc = new TextEncoder();
    const cryptoKey = await window.crypto.subtle.importKey(
      "raw",
      enc.encode(keyStr),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await window.crypto.subtle.sign("HMAC", cryptoKey, enc.encode(msgStr));
    return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return hmacSha256FallbackHex(keyStr, msgStr);
}

async function firmarPayload(action, camposFijosObj, camposOpcionalesObj = {}) {
  const nonce = generarNonce();
  const ts = String(Math.floor(Date.now() / 1000));
  const clave = obtenerFechaClaveSv();

  const partes = [];
  const payload = { action, _nonce: nonce, _ts: ts };

  Object.keys(camposFijosObj).forEach((k) => {
    const v = camposFijosObj[k] !== undefined && camposFijosObj[k] !== null ? String(camposFijosObj[k]) : "";
    payload[k] = v;
    partes.push(k + "=" + v);
  });

  Object.keys(camposOpcionalesObj).forEach((k) => {
    const v = camposOpcionalesObj[k];
    if (v !== undefined && v !== null && String(v) !== "") {
      const sv = String(v);
      payload[k] = sv;
      partes.push(k + "=" + sv);
    }
  });

  const camposOrdenados = partes.sort().join("|");
  const mensaje = action + "|" + nonce + "|" + ts + "|" + camposOrdenados;
  payload._hmac = await hmacSha256Hex(clave, mensaje);

  return payload;
}

// ── COMUNICACIÓN RESILIENTE CON BACKEND GAS (TIMEOUT + 503 + WARM-UP) ──

function mostrarError503(detalleTecnico, callbackReintento) {
  const modal = document.getElementById("eva-error-503");
  const detalleEl = document.getElementById("eva-503-detalle");
  const btnReintentar = document.getElementById("eva-503-reintentar");
  if (!modal || !detalleEl || !btnReintentar) return;

  detalleEl.textContent = "Detalle: " + (detalleTecnico || "El backend de Google Apps Script no respondió.");
  ultimaAccionFallida = typeof callbackReintento === "function" ? callbackReintento : null;
  btnReintentar.style.display = ultimaAccionFallida ? "inline-block" : "none";
  btnReintentar.disabled = false;
  btnReintentar.textContent = "Reintentar ahora";

  modal.classList.add("activo");
}

function ocultarError503() {
  document.getElementById("eva-error-503")?.classList.remove("activo");
}

async function fetchBackendGAS(opciones = {}) {
  const method = (opciones.method || "GET").toUpperCase();
  const timeoutMs = opciones.timeoutMs || 12000;
  const maxReintentos = method === "GET" ? 1 : 0; // Solo reintenta lecturas GET para proteger nonces HMAC en POST
  const silencioso = Boolean(opciones.silencioso);

  let url = SCRIPT_URL;
  const fetchConfig = { method, cache: "no-store" };

  if (method === "GET" && opciones.params) {
    const qs = new URLSearchParams(opciones.params).toString();
    if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  } else if (method === "POST" && opciones.params) {
    fetchConfig.body = opciones.params instanceof URLSearchParams
      ? opciones.params
      : new URLSearchParams(opciones.params);
  }

  actualizarIndicadorRed("slow");

  for (let intento = 0; intento <= maxReintentos; intento++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    fetchConfig.signal = controller.signal;

    try {
      if (!navigator.onLine) {
        throw { code: 503, motivo: "Sin conexión a internet en el dispositivo." };
      }

      const respuesta = await fetch(url, fetchConfig);
      clearTimeout(timer);

      if (respuesta.status >= 500 || respuesta.status === 429) {
        throw { code: 503, motivo: "Servidor temporalmente saturado (HTTP " + respuesta.status + ")." };
      }
      if (!respuesta.ok) {
        throw { code: respuesta.status, motivo: "Error HTTP " + respuesta.status };
      }

      const textoCrudo = await respuesta.text();
      let data;
      try {
        data = JSON.parse(textoCrudo);
      } catch (_) {
        throw { code: 503, motivo: "El backend devolvió una respuesta inválida o está en mantenimiento." };
      }

      if (data && (data.code === 503 || data.status === "503 Service Unavailable")) {
        throw { code: 503, motivo: data.message || "Servicio ocupado, intenta de nuevo." };
      }

      actualizarIndicadorRed("online");
      return data;
    } catch (err) {
      clearTimeout(timer);

      if (intento < maxReintentos) {
        await new Promise((r) => setTimeout(r, 1200));
        continue;
      }

      actualizarIndicadorRed("offline");
      const motivoFinal = err.name === "AbortError"
        ? "Tiempo de espera agotado (" + (timeoutMs / 1000) + "s sin respuesta del backend)."
        : (err.motivo || "No se pudo establecer conexión con el servidor de Google.");

      if (!silencioso) {
        mostrarError503(motivoFinal, opciones.onRetry);
      }
      throw { code: 503, status: "503 Service Unavailable", message: motivoFinal };
    }
  }
}

async function postBackend(payload, onRetry) {
  return fetchBackendGAS({
    method: "POST",
    params: payload,
    timeoutMs: 12000,
    onRetry
  });
}

function precalentarBackend() {
  if (!navigator.onLine) {
    actualizarIndicadorRed("offline");
    return;
  }
  fetchBackendGAS({
    method: "GET",
    params: { action: "version" },
    timeoutMs: 8000,
    silencioso: true
  }).catch(() => {
    // Silencioso al inicio; solo despierta Apps Script en segundo plano
  });
}

// ── GEOLOCALIZACIÓN Y ESTADO DEL BACKEND ────────────────────────────

async function verificarEstadoGeoYUbicacion() {
  const box = document.getElementById("geo-status-box");
  const text = document.getElementById("geo-status-text");
  const btn = document.getElementById("btnRegistrar");

  if (box) box.className = "geo-status-box checking";
  if (text) text.textContent = "Verificando configuración de ubicación...";
  if (btn) btn.disabled = true;

  try {
    const data = await fetchBackendGAS({
      method: "GET",
      params: { action: "obtener_geo_estado" },
      timeoutMs: 10000,
      onRetry: verificarEstadoGeoYUbicacion
    });
    geoActivaGlobal = Boolean(data.geo_activa);
  } catch (_) {
    if (box) box.className = "geo-status-box fail";
    if (text) text.textContent = "❌ No se pudo conectar con el servidor de asistencia.";
    if (btn) btn.disabled = false;
    return;
  }

  if (!geoActivaGlobal) {
    coordsActuales = null;
    if (box) box.className = "geo-status-box disabled";
    if (text) text.textContent = "🔓 Verificación GPS desactivada por el docente.";
    if (btn) btn.disabled = false;
    return;
  }

  if (!("geolocation" in navigator)) {
    if (box) box.className = "geo-status-box fail";
    if (text) text.textContent = "❌ Tu navegador no soporta geolocalización.";
    if (btn) btn.disabled = true;
    return;
  }

  if (text) text.textContent = "📍 Obteniendo coordenadas GPS...";

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      coordsActuales = {
        lat: pos.coords.latitude.toFixed(7),
        lng: pos.coords.longitude.toFixed(7)
      };
      if (box) box.className = "geo-status-box ok";
      if (text) text.textContent = "✅ Ubicación GPS lista. El servidor validará el radio del CENTED.";
      if (btn) btn.disabled = false;
    },
    () => {
      coordsActuales = null;
      if (box) box.className = "geo-status-box fail";
      if (text) text.textContent = "❌ Activa el permiso de ubicación (GPS) para registrar asistencia.";
      if (btn) btn.disabled = true;
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }
  );
}

// ── LISTA DE ESTUDIANTES Y RECUPERACIÓN CON AUTORIZACIÓN DOCENTE ────

function poblarSelectAlumnos(alumnos) {
  const select = document.getElementById("reg-student-select");
  const status = document.getElementById("reg-student-list-status");
  if (!select) return;

  select.textContent = "";
  const optDefault = document.createElement("option");
  optDefault.value = "";
  optDefault.selected = true;
  optDefault.textContent = "-- Selecciona tu Nombre para recordar clave --";
  select.appendChild(optDefault);

  alumnos.forEach((nombre) => {
    const opt = document.createElement("option");
    opt.value = nombre;
    opt.textContent = nombre;
    select.appendChild(opt);
  });

  if (status) {
    status.textContent = alumnos.length
      ? alumnos.length + " estudiantes disponibles. Selecciona tu nombre y pide autorización al docente."
      : "No hay estudiantes registrados todavía.";
  }
}

async function cargarListaAlumnos(forzarRecarga = false) {
  const select = document.getElementById("reg-student-select");
  const status = document.getElementById("reg-student-list-status");
  const btnReload = document.getElementById("btn-reload-students");
  if (!select) return;

  if (!forzarRecarga) {
    try {
      const rawCache = sessionStorage.getItem(SESSION_KEY_ALUMNOS);
      if (rawCache) {
        const parsed = JSON.parse(rawCache);
        if (parsed && Array.isArray(parsed.alumnos) && (Date.now() - parsed.ts) < ALUMNOS_CACHE_TTL_MS) {
          poblarSelectAlumnos(parsed.alumnos);
          if (btnReload) btnReload.style.display = "none";
          return;
        }
      }
    } catch (_) {}
  }

  if (status) status.textContent = "Cargando lista de estudiantes...";
  if (btnReload) btnReload.style.display = "none";

  try {
    const data = await fetchBackendGAS({
      method: "GET",
      params: { action: "obtener_lista_alumnos" },
      timeoutMs: 10000,
      onRetry: () => cargarListaAlumnos(true)
    });
    const alumnos = Array.isArray(data.alumnos) ? data.alumnos : [];
    poblarSelectAlumnos(alumnos);
    try {
      sessionStorage.setItem(SESSION_KEY_ALUMNOS, JSON.stringify({ alumnos, ts: Date.now() }));
    } catch (_) {}
  } catch (_) {
    if (status) status.textContent = "❌ Error al cargar la lista de estudiantes.";
    if (btnReload) btnReload.style.display = "block";
  }
}

function abrirModalAuthClave(nombreEstudiante) {
  estudianteSeleccionadoClave = nombreEstudiante;
  const modal = document.getElementById("modal-auth-clave");
  const label = document.getElementById("modal-auth-student-name");
  const input = document.getElementById("auth-admin-pass");
  limpiarAlerta("alertAuthClave");

  if (label) {
    label.textContent = "Ingresa la clave del docente para mostrar la Clave Única de: " + nombreEstudiante;
  }
  if (input) input.value = "";
  if (modal) modal.style.display = "flex";
  if (input) input.focus();
}

function cerrarModalAuthClave() {
  const modal = document.getElementById("modal-auth-clave");
  const select = document.getElementById("reg-student-select");
  if (modal) modal.style.display = "none";
  if (select) select.value = "";
  estudianteSeleccionadoClave = "";
}

async function confirmarAuthClave() {
  const input = document.getElementById("auth-admin-pass");
  const btn = document.getElementById("btn-confirm-auth-clave");
  const pass = sanitizarTexto(input?.value, 60);

  if (!estudianteSeleccionadoClave) return;
  if (!pass) {
    mostrarAlerta("alertAuthClave", "error", "❌ Ingresa la clave de seguridad del docente.");
    return;
  }

  if (btn) btn.disabled = true;
  limpiarAlerta("alertAuthClave");
  let huboError = false;

  try {
    const payload = await firmarPayload("consultar_clave_olvidada", {
      nombre: estudianteSeleccionadoClave,
      clave_admin: pass
    });
    const res = await postBackend(payload, confirmarAuthClave);

    if (res.result === "success" && res.clave) {
      const regKey = document.getElementById("reg-key");
      const regTeacher = document.getElementById("reg-teacher");
      if (regKey) regKey.value = res.clave;
      if (regTeacher && res.docente) regTeacher.value = res.docente;
      guardarClaveLocal(res.clave);
      cargarClaveLocalEnRegistro();

      mostrarAlerta(
        "alertRegistro",
        "success",
        "🔑 Clave de " + res.nombre + ": " + res.clave + " (ya fue colocada en el campo de clave)."
      );
      mostrarToast("Clave Única recuperada correctamente.", "success");
      cerrarModalAuthClave();
    } else {
      huboError = true;
      mostrarAlerta("alertAuthClave", "error", res.message || "❌ No se pudo consultar la clave.");
    }
  } catch (_) {
    huboError = true;
    mostrarAlerta("alertAuthClave", "error", "❌ Error de conexión con el servidor.");
  } finally {
    habilitarConCooldown(btn, "✓ Confirmar", huboError);
  }
}

// ── FORMULARIO 01: REGISTRAR ASISTENCIA ─────────────────────────────

async function manejarRegistroAsistencia(e) {
  if (e && typeof e.preventDefault === "function") e.preventDefault();
  limpiarAlerta("alertRegistro");

  if (!navigator.onLine) {
    mostrarAlerta("alertRegistro", "error", "❌ Sin conexión a internet. Reconecta para registrar.");
    actualizarIndicadorRed("offline");
    return;
  }

  const hp = (document.getElementById("reg-website")?.value || "").trim();
  if (hp !== "") return;

  const clave = sanitizarTexto(document.getElementById("reg-key")?.value, 4).toUpperCase();
  const grupo = sanitizarTexto(document.getElementById("reg-group")?.value, 30);
  const docente = sanitizarTexto(document.getElementById("reg-teacher")?.value, 80);
  const firma = sanitizarTexto(document.getElementById("firma-valor")?.value, 80);

  if (!/^[A-Z0-9]{4}$/.test(clave)) {
    mostrarAlerta("alertRegistro", "error", "❌ Ingresa tu Clave Única de 4 caracteres.");
    return;
  }
  if (!grupo) {
    mostrarAlerta("alertRegistro", "error", "❌ Selecciona tu grupo (Mañana o Tarde).");
    return;
  }
  if (geoActivaGlobal && !coordsActuales) {
    mostrarAlerta("alertRegistro", "error", "❌ Esperando coordenadas GPS válidas. Activa la ubicación.");
    return;
  }

  const btn = document.getElementById("btnRegistrar");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ Registrando...";
  }
  let huboError = false;

  try {
    const opcionales = {};
    if (geoActivaGlobal && coordsActuales) {
      opcionales.lat = coordsActuales.lat;
      opcionales.lng = coordsActuales.lng;
    }

    const payload = await firmarPayload(
      "asistencia",
      { clave, docente, grupo, firma, hp },
      opcionales
    );
    const res = await postBackend(payload, () => manejarRegistroAsistencia());

    if (res.result === "success") {
      guardarClaveLocal(clave);
      mostrarAlerta(
        "alertRegistro",
        "success",
        "✅ ¡Asistencia registrada! Bienvenido/a, " + res.nombre + "."
      );
      mostrarToast("Asistencia registrada para " + res.nombre, "success");
      document.getElementById("form-register")?.reset();
      cargarClaveLocalEnRegistro();
    } else if (res.result === "duplicated") {
      mostrarAlerta("alertRegistro", "warning", res.message || "⚠️ Ya registraste asistencia hoy.");
    } else {
      huboError = true;
      mostrarAlerta("alertRegistro", "error", res.message || "❌ No se pudo registrar asistencia.");
    }
  } catch (_) {
    huboError = true;
    mostrarAlerta("alertRegistro", "error", "❌ Error de red al conectar con el backend.");
  } finally {
    habilitarConCooldown(btn, "✓ Enviar Asistencia", huboError);
  }
}

// ── FORMULARIO 02: GENERAR CLAVE ÚNICA (100% EN EL BACKEND) ─────────

function formatearTelefonoInput(e) {
  let digits = e.target.value.replace(/\D/g, "").slice(0, 8);
  if (digits.length > 4) {
    e.target.value = digits.slice(0, 4) + "-" + digits.slice(4);
  } else {
    e.target.value = digits;
  }
}

function formatearCumpleInput(e) {
  let digits = e.target.value.replace(/\D/g, "").slice(0, 4);
  if (digits.length > 2) {
    e.target.value = digits.slice(0, 2) + "/" + digits.slice(2);
  } else {
    e.target.value = digits;
  }
}

async function manejarGenerarClave(e) {
  if (e && typeof e.preventDefault === "function") e.preventDefault();
  limpiarAlerta("alertGenerarClave");

  if (!navigator.onLine) {
    mostrarAlerta("alertGenerarClave", "error", "❌ Sin conexión a internet. Reconecta para generar tu clave.");
    actualizarIndicadorRed("offline");
    return;
  }

  const hp = (document.getElementById("gen-website")?.value || "").trim();
  if (hp !== "") return;

  const nombre = sanitizarTexto(document.getElementById("gen-name")?.value, 120).replace(/\s+/g, " ");
  const docente = sanitizarTexto(document.getElementById("gen-teacher")?.value, 80);
  const telefono = sanitizarTexto(document.getElementById("gen-phone")?.value, 15);
  const correo = sanitizarTexto(document.getElementById("gen-email")?.value, 120).toLowerCase();
  const cumple = sanitizarTexto(document.getElementById("gen-birthday")?.value, 10);
  const codigo = sanitizarTexto(document.getElementById("gen-override")?.value, 60);

  if (nombre.split(" ").filter(Boolean).length < 2) {
    mostrarAlerta("alertGenerarClave", "error", "❌ Ingresa tu nombre y al menos un apellido.");
    return;
  }
  if (!docente) {
    mostrarAlerta("alertGenerarClave", "error", "❌ Selecciona tu docente principal.");
    return;
  }

  const btn = document.getElementById("btnGenerar");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ Generando en servidor...";
  }
  let huboError = false;

  try {
    const payload = await firmarPayload("guardar_clave", {
      nombre,
      docente,
      telefono,
      correo,
      cumple,
      codigo,
      hp
    });
    const res = await postBackend(payload, () => manejarGenerarClave());

    if (res.result === "success" && res.clave) {
      guardarBorradorClave();
      guardarClaveLocal(res.clave);
      try { sessionStorage.removeItem(SESSION_KEY_ALUMNOS); } catch (_) {}

      const box = document.getElementById("claveGeneradaContainer");
      const codEl = document.getElementById("codGenerado");
      if (codEl) codEl.textContent = res.clave;
      if (box) box.style.display = "block";
      mostrarAlerta("alertGenerarClave", "success", "✅ ¡Clave Única generada y guardada con éxito!");
      mostrarToast("Clave Única generada: " + res.clave, "success");
    } else if (res.result === "duplicated") {
      mostrarAlerta("alertGenerarClave", "warning", res.message || "⚠️ Ya tienes una clave registrada.");
    } else {
      huboError = true;
      mostrarAlerta("alertGenerarClave", "error", res.message || "❌ No se pudo generar la clave.");
    }
  } catch (_) {
    huboError = true;
    mostrarAlerta("alertGenerarClave", "error", "❌ Error de red al conectar con el backend.");
  } finally {
    habilitarConCooldown(btn, "🔒 Generar Mi Clave Permanente", huboError);
  }
}

async function descargarCapturaClave() {
  const area = document.getElementById("claveCapturaArea");
  const claveTxt = (document.getElementById("codGenerado")?.textContent || "CLAVE").trim();
  if (!area || typeof window.html2canvas !== "function") {
    mostrarToast("Toma una captura de pantalla para guardar tu clave.", "info");
    return;
  }

  try {
    const canvas = await window.html2canvas(area, { scale: 2, backgroundColor: "#ffffff" });
    const enlace = document.createElement("a");
    enlace.download = "Clave_CENTED_" + claveTxt + ".png";
    enlace.href = canvas.toDataURL("image/png");
    enlace.click();
    mostrarToast("Imagen de tu clave descargada.", "success");
  } catch (_) {
    mostrarToast("No se pudo generar la imagen automática. Toma una captura.", "warning");
  }
}

// ── FORMULARIO 04: CAJA DEL MISTERIO (BUZÓN ANÓNIMO) ────────────────

function agregarBurbujaMisterio(texto, esUsuario) {
  const feed = document.getElementById("mystery-chat-feed");
  if (!feed) return;

  const burbuja = document.createElement("div");
  if (esUsuario) {
    burbuja.style.cssText =
      "align-self:flex-end;max-width:85%;background:var(--accent);color:#ffffff;" +
      "padding:.75rem 1rem;border-radius:12px 12px 2px 12px;font-size:.88rem;line-height:1.45;word-break:break-word;white-space:pre-line;";

    const titulo = document.createElement("div");
    titulo.style.cssText = "font-size:.7rem;opacity:.8;font-weight:700;margin-bottom:.25rem;";
    titulo.textContent = "🕵️ Anónimo (Tú)";

    const cuerpo = document.createElement("div");
    cuerpo.textContent = texto;

    burbuja.appendChild(titulo);
    burbuja.appendChild(cuerpo);
  } else {
    burbuja.style.cssText =
      "align-self:flex-start;max-width:85%;background:var(--fg);color:var(--bg);" +
      "padding:.75rem 1rem;border-radius:12px 12px 12px 2px;font-size:.88rem;line-height:1.45;white-space:pre-line;";
    burbuja.textContent = texto;
  }

  feed.appendChild(burbuja);
  feed.scrollTop = feed.scrollHeight;
}

async function enviarMensajeMisterio(e) {
  if (e && typeof e.preventDefault === "function") e.preventDefault();
  limpiarAlerta("alertMystery");

  if (!navigator.onLine) {
    mostrarAlerta("alertMystery", "error", "❌ Sin conexión a internet. Reconecta para enviar.");
    actualizarIndicadorRed("offline");
    return;
  }

  const hp = (document.getElementById("mys-website")?.value || "").trim();
  if (hp !== "") return;

  const textarea = document.getElementById("mys-message");
  const mensajeRaw = (textarea?.value || "").trim();
  const mensajeLimpio = mensajeRaw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/^[=+\-@\t\r]+/, "");

  if (mensajeLimpio.length < 3) {
    mostrarAlerta("alertMystery", "error", "❌ Escribe un mensaje de al menos 3 caracteres.");
    return;
  }

  const btn = document.getElementById("btnEnviarMisterio");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ Enviando anónimamente...";
  }
  let huboError = false;

  try {
    const payload = await firmarPayload("caja_misterio", {
      mensaje: mensajeLimpio.slice(0, 800),
      hp
    });
    const res = await postBackend(payload, () => enviarMensajeMisterio());

    if (res.result === "success") {
      agregarBurbujaMisterio(mensajeLimpio, true);
      agregarBurbujaMisterio("✅ Mensaje enviado al correo del docente de forma 100% anónima.", false);
      if (textarea) textarea.value = "";
      const counter = document.getElementById("mys-char-count");
      if (counter) counter.textContent = "0 / 800 caracteres · 100% anónimo y privado";
      mostrarToast("Mensaje anónimo enviado.", "success");
    } else {
      huboError = true;
      mostrarAlerta("alertMystery", "error", res.message || "❌ No se pudo enviar el mensaje.");
    }
  } catch (_) {
    huboError = true;
    mostrarAlerta("alertMystery", "error", "❌ Error de conexión con el servidor.");
  } finally {
    habilitarConCooldown(btn, "✉️ Enviar Mensaje Anónimo", huboError);
  }
}

// ── INICIALIZACIÓN GENERAL ──────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  actualizarReloj();
  setInterval(actualizarReloj, 1000);
  inicializarTema();
  cargarBorradorClave();
  inicializarGoogleAutoFill();
  actualizarIndicadorRed(navigator.onLine ? "online" : "offline");
  precalentarBackend();

  window.addEventListener("online", () => {
    actualizarIndicadorRed("online");
    mostrarToast("Conexión restablecida.", "success");
  });
  window.addEventListener("offline", () => {
    actualizarIndicadorRed("offline");
    mostrarToast("Sin conexión a internet.", "warning");
  });

  // Modal 503
  document.getElementById("eva-503-cerrar")?.addEventListener("click", ocultarError503);
  document.getElementById("eva-503-reintentar")?.addEventListener("click", async function () {
    if (!ultimaAccionFallida) return;
    this.disabled = true;
    this.textContent = "Reconectando...";
    ocultarError503();
    await ultimaAccionFallida();
  });

  // Navegación del menú principal
  document.getElementById("btn-menu-register")?.addEventListener("click", () => {
    limpiarAlerta("alertRegistro");
    cambiarVista("view-register");
    cargarClaveLocalEnRegistro();
    verificarEstadoGeoYUbicacion();
    cargarListaAlumnos(false);
  });

  document.getElementById("btn-menu-keygen")?.addEventListener("click", () => {
    limpiarAlerta("alertGenerarClave");
    cambiarVista("view-keygen");
    cargarBorradorClave();
    inicializarGoogleAutoFill();
  });

  document.getElementById("btn-menu-mystery")?.addEventListener("click", () => {
    limpiarAlerta("alertMystery");
    cambiarVista("view-mystery");
  });

  // Botones volver, logo hacia menú y limpiar clave local
  document.getElementById("btn-back-register")?.addEventListener("click", () => cambiarVista("view-menu"));
  document.getElementById("btn-back-keygen")?.addEventListener("click", () => cambiarVista("view-menu"));
  document.getElementById("btn-back-mystery")?.addEventListener("click", () => cambiarVista("view-menu"));
  document.getElementById("btn-clear-saved-key")?.addEventListener("click", limpiarClaveLocal);

  const brandLogo = document.getElementById("brand-logo-img");
  if (brandLogo) {
    brandLogo.style.cursor = "pointer";
    brandLogo.title = "Volver al menú principal";
    brandLogo.setAttribute("role", "button");
    brandLogo.setAttribute("tabindex", "0");
    brandLogo.addEventListener("click", () => cambiarVista("view-menu"));
    brandLogo.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        cambiarVista("view-menu");
      }
    });
  }

  // Recuperar clave olvidada
  document.getElementById("reg-student-select")?.addEventListener("change", (e) => {
    const nombre = e.target.value;
    if (nombre) abrirModalAuthClave(nombre);
  });
  document.getElementById("btn-reload-students")?.addEventListener("click", () => cargarListaAlumnos(true));
  document.getElementById("btn-confirm-auth-clave")?.addEventListener("click", confirmarAuthClave);
  document.getElementById("btn-cancel-auth-clave")?.addEventListener("click", cerrarModalAuthClave);

  // Formularios y formatos
  document.getElementById("form-register")?.addEventListener("submit", manejarRegistroAsistencia);
  document.getElementById("form-keygen")?.addEventListener("submit", manejarGenerarClave);
  document.getElementById("gen-phone")?.addEventListener("input", formatearTelefonoInput);
  document.getElementById("gen-birthday")?.addEventListener("input", formatearCumpleInput);
  document.getElementById("btn-guardar-clave-captura")?.addEventListener("click", descargarCapturaClave);

  // Guardar borrador automático mientras escribe en Generar Clave
  ["gen-name", "gen-teacher", "gen-phone", "gen-email", "gen-birthday"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", guardarBorradorClave);
    el.addEventListener("change", guardarBorradorClave);
  });

  // Caja del Misterio
  document.getElementById("form-mystery")?.addEventListener("submit", enviarMensajeMisterio);
  document.getElementById("mys-message")?.addEventListener("input", (e) => {
    const len = e.target.value.length;
    const counter = document.getElementById("mys-char-count");
    if (counter) {
      counter.textContent = len + " / 800 caracteres · 100% anónimo y privado";
    }
  });
});

window.addEventListener("load", inicializarGoogleAutoFill);
