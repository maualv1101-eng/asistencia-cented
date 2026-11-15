// FRONTEND — Portal Aula Digital & Asistencia CENTED

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycby5whpgO3AnwENYrV_Ov-oyGo5cpaH8EXVnsnoiKwJeT-UgQ7qPkH145H5VHR-W1N-P/exec";
window.SCRIPT_URL = SCRIPT_URL;

const ZONA_HORARIA_SV = "America/El_Salvador";

let geoActivaGlobal = true;
let coordsActuales = null;
let estudianteSeleccionadoClave = "";

// ── UTILIDADES DE UI Y SANITIZACIÓN DOM ─────────────────────────────

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

function escaparHtmlMisterio(str) {
  return String(str || "")
    .replace(/&/g, "\u0026amp;")
    .replace(/</g, "\u0026lt;")
    .replace(/>/g, "\u0026gt;")
    .replace(/"/g, "\u0026quot;")
    .replace(/'/g, "\u0026#39;");
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

// Implementación SHA-256 pura de respaldo por si crypto.subtle no está disponible
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

async function postBackend(payload) {
  const body = new URLSearchParams(payload);
  const resp = await fetch(SCRIPT_URL, {
    method: "POST",
    body
  });
  if (!resp.ok) {
    throw new Error("Error HTTP " + resp.status);
  }
  return resp.json();
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
    const resp = await fetch(SCRIPT_URL + "?action=obtener_geo_estado", { cache: "no-store" });
    const data = await resp.json();
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

async function cargarListaAlumnos() {
  const select = document.getElementById("reg-student-select");
  const status = document.getElementById("reg-student-list-status");
  const btnReload = document.getElementById("btn-reload-students");
  if (!select) return;

  if (status) status.textContent = "Cargando lista de estudiantes...";
  if (btnReload) btnReload.style.display = "none";

  try {
    const resp = await fetch(SCRIPT_URL + "?action=obtener_lista_alumnos", { cache: "no-store" });
    const data = await resp.json();
    const alumnos = Array.isArray(data.alumnos) ? data.alumnos : [];

    select.innerHTML = '<option value="" selected>-- Selecciona tu Nombre para recordar clave --</option>';
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
  const pass = input ? input.value.trim() : "";

  if (!estudianteSeleccionadoClave) return;
  if (!pass) {
    mostrarAlerta("alertAuthClave", "error", "❌ Ingresa la clave de seguridad del docente.");
    return;
  }

  if (btn) btn.disabled = true;
  limpiarAlerta("alertAuthClave");

  try {
    const payload = await firmarPayload("consultar_clave_olvidada", {
      nombre: estudianteSeleccionadoClave,
      clave_admin: pass
    });
    const res = await postBackend(payload);

    if (res.result === "success" && res.clave) {
      const regKey = document.getElementById("reg-key");
      const regTeacher = document.getElementById("reg-teacher");
      if (regKey) regKey.value = res.clave;
      if (regTeacher && res.docente) regTeacher.value = res.docente;

      mostrarAlerta(
        "alertRegistro",
        "success",
        "🔑 Clave de " + res.nombre + ": " + res.clave + " (ya fue colocada en el campo de clave)."
      );
      mostrarToast("Clave Única recuperada correctamente.", "success");
      cerrarModalAuthClave();
    } else {
      mostrarAlerta("alertAuthClave", "error", res.message || "❌ No se pudo consultar la clave.");
    }
  } catch (_) {
    mostrarAlerta("alertAuthClave", "error", "❌ Error de conexión con el servidor.");
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── FORMULARIO 01: REGISTRAR ASISTENCIA ─────────────────────────────

async function manejarRegistroAsistencia(e) {
  e.preventDefault();
  limpiarAlerta("alertRegistro");

  const hp = (document.getElementById("reg-website")?.value || "").trim();
  if (hp !== "") return;

  const clave = (document.getElementById("reg-key")?.value || "").trim().toUpperCase();
  const grupo = (document.getElementById("reg-group")?.value || "").trim();
  const docente = (document.getElementById("reg-teacher")?.value || "").trim();
  const firma = (document.getElementById("firma-valor")?.value || "").trim();

  if (clave.length !== 4) {
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
    const res = await postBackend(payload);

    if (res.result === "success") {
      mostrarAlerta(
        "alertRegistro",
        "success",
        "✅ ¡Asistencia registrada! Bienvenido/a, " + res.nombre + "."
      );
      mostrarToast("Asistencia registrada para " + res.nombre, "success");
      document.getElementById("form-register")?.reset();
    } else if (res.result === "duplicated") {
      mostrarAlerta("alertRegistro", "warning", res.message || "⚠️ Ya registraste asistencia hoy.");
    } else {
      mostrarAlerta("alertRegistro", "error", res.message || "❌ No se pudo registrar asistencia.");
    }
  } catch (_) {
    mostrarAlerta("alertRegistro", "error", "❌ Error de red al conectar con el backend.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "✓ Enviar Asistencia";
    }
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
  e.preventDefault();
  limpiarAlerta("alertGenerarClave");

  const hp = (document.getElementById("gen-website")?.value || "").trim();
  if (hp !== "") return;

  const nombre = (document.getElementById("gen-name")?.value || "").trim().replace(/\s+/g, " ");
  const docente = (document.getElementById("gen-teacher")?.value || "").trim();
  const telefono = (document.getElementById("gen-phone")?.value || "").trim();
  const correo = (document.getElementById("gen-email")?.value || "").trim();
  const cumple = (document.getElementById("gen-birthday")?.value || "").trim();
  const codigo = (document.getElementById("gen-override")?.value || "").trim();

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

  try {
    // El cliente NO genera ni valida secretos; envía los datos al backend para generar la clave
    const payload = await firmarPayload("guardar_clave", {
      nombre,
      docente,
      telefono,
      correo,
      cumple,
      codigo,
      hp
    });
    const res = await postBackend(payload);

    if (res.result === "success" && res.clave) {
      const box = document.getElementById("claveGeneradaContainer");
      const codEl = document.getElementById("codGenerado");
      if (codEl) codEl.textContent = res.clave;
      if (box) box.style.display = "block";
      mostrarAlerta("alertGenerarClave", "success", "✅ ¡Clave Única generada y guardada con éxito!");
      mostrarToast("Clave Única generada: " + res.clave, "success");
    } else if (res.result === "duplicated") {
      mostrarAlerta("alertGenerarClave", "warning", res.message || "⚠️ Ya tienes una clave registrada.");
    } else {
      mostrarAlerta("alertGenerarClave", "error", res.message || "❌ No se pudo generar la clave.");
    }
  } catch (_) {
    mostrarAlerta("alertGenerarClave", "error", "❌ Error de red al conectar con el backend.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "🔒 Generar Mi Clave Permanente";
    }
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
      "padding:.75rem 1rem;border-radius:12px 12px 2px 12px;font-size:.88rem;line-height:1.45;word-break:break-word;";
    burbuja.innerHTML =
      '<div style="font-size:.7rem;opacity:.8;font-weight:700;margin-bottom:.25rem;">🕵️ Anónimo (Tú)</div>' +
      escaparHtmlMisterio(texto).replace(/\n/g, "<br>");
  } else {
    burbuja.style.cssText =
      "align-self:flex-start;max-width:85%;background:var(--fg);color:var(--bg);" +
      "padding:.75rem 1rem;border-radius:12px 12px 12px 2px;font-size:.88rem;line-height:1.45;";
    burbuja.innerHTML = escaparHtmlMisterio(texto);
  }

  feed.appendChild(burbuja);
  feed.scrollTop = feed.scrollHeight;
}

async function enviarMensajeMisterio(e) {
  e.preventDefault();
  limpiarAlerta("alertMystery");

  const hp = (document.getElementById("mys-website")?.value || "").trim();
  if (hp !== "") return;

  const textarea = document.getElementById("mys-message");
  const mensajeRaw = (textarea?.value || "").trim();
  const mensajeLimpio = mensajeRaw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  if (mensajeLimpio.length < 3) {
    mostrarAlerta("alertMystery", "error", "❌ Escribe un mensaje de al menos 3 caracteres.");
    return;
  }

  const btn = document.getElementById("btnEnviarMisterio");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ Enviando anónimamente...";
  }

  try {
    // Envío estrictamente anónimo: sin clave, sin nombre y sin coordenadas GPS
    const payload = await firmarPayload("caja_misterio", {
      mensaje: mensajeLimpio.slice(0, 800),
      hp
    });
    const res = await postBackend(payload);

    if (res.result === "success") {
      agregarBurbujaMisterio(mensajeLimpio, true);
      agregarBurbujaMisterio("✅ Mensaje enviado al correo del docente de forma 100% anónima.", false);
      if (textarea) textarea.value = "";
      const counter = document.getElementById("mys-char-count");
      if (counter) counter.textContent = "0 / 800 caracteres · 100% anónimo y privado";
      mostrarToast("Mensaje anónimo enviado.", "success");
    } else {
      mostrarAlerta("alertMystery", "error", res.message || "❌ No se pudo enviar el mensaje.");
    }
  } catch (_) {
    mostrarAlerta("alertMystery", "error", "❌ Error de conexión con el servidor.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "✉️ Enviar Mensaje Anónimo";
    }
  }
}

// ── INICIALIZACIÓN GENERAL ──────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  actualizarReloj();
  setInterval(actualizarReloj, 1000);
  inicializarTema();

  // Navegación del menú principal
  document.getElementById("btn-menu-register")?.addEventListener("click", () => {
    limpiarAlerta("alertRegistro");
    cambiarVista("view-register");
    verificarEstadoGeoYUbicacion();
    cargarListaAlumnos();
  });

  document.getElementById("btn-menu-keygen")?.addEventListener("click", () => {
    limpiarAlerta("alertGenerarClave");
    cambiarVista("view-keygen");
  });

  document.getElementById("btn-menu-mystery")?.addEventListener("click", () => {
    limpiarAlerta("alertMystery");
    cambiarVista("view-mystery");
  });

  // Botones volver
  document.getElementById("btn-back-register")?.addEventListener("click", () => cambiarVista("view-menu"));
  document.getElementById("btn-back-keygen")?.addEventListener("click", () => cambiarVista("view-menu"));
  document.getElementById("btn-back-mystery")?.addEventListener("click", () => cambiarVista("view-menu"));

  // Recuperar clave olvidada
  document.getElementById("reg-student-select")?.addEventListener("change", (e) => {
    const nombre = e.target.value;
    if (nombre) abrirModalAuthClave(nombre);
  });
  document.getElementById("btn-reload-students")?.addEventListener("click", cargarListaAlumnos);
  document.getElementById("btn-confirm-auth-clave")?.addEventListener("click", confirmarAuthClave);
  document.getElementById("btn-cancel-auth-clave")?.addEventListener("click", cerrarModalAuthClave);

  // Formularios y formatos
  document.getElementById("form-register")?.addEventListener("submit", manejarRegistroAsistencia);
  document.getElementById("form-keygen")?.addEventListener("submit", manejarGenerarClave);
  document.getElementById("gen-phone")?.addEventListener("input", formatearTelefonoInput);
  document.getElementById("gen-birthday")?.addEventListener("input", formatearCumpleInput);
  document.getElementById("btn-guardar-clave-captura")?.addEventListener("click", descargarCapturaClave);

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
