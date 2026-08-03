// FRONTEND — Sistema de Asistencia CENTED v5.0

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxYsWjB3qqR-ud0wx8LSPy-Cw0xis1BGXVoCvUY-jnP4w6SCekO_AvsJybqPP1On6jC/exec";

// -- COORDENADAS DEL CENTED ----------------------------------
const CENTED_LAT = 13.716795758900204;
const CENTED_LNG = -89.1001956388224;
const RADIO_KM = 1.0;

// -- ESTADO GLOBAL -------------------------------------------
var qrScanner = null;
var qrActivo = false;
var firmaTab = "qr";
var geoActiva = true;
var geoOK = false;
var geoRevisada = false;
var tokenSesion = null;      
var panelAutoRefreshInterval = null;
var intentosFallidos = 0;
var bloqueoHasta = 0;
const MAX_INTENTOS = 5;
const TIEMPO_BLOQUEO = 300000; 

var geoCoords = null;


async function sha256Hex(str) {
  var enc = new TextEncoder().encode(str);
  var buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map(function (b) { return b.toString(16).padStart(2, "0"); })
    .join("");
}


function sanitizarInput(str) {
  if (typeof str !== "string") return "";
  var s = str.trim().slice(0, 300);
  s = s.replace(/[\x00-\x1F\x7F]/g, "");   // control chars
  s = s.replace(/^[=+\-@\t\r]+/, "");       // formula injection
  return s;
}




function generarNonce() {
  var arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(function(b) { return b.toString(16).padStart(2, "0"); }).join("");
}


async function hmacSha256Hex(key, message) {
  var enc = new TextEncoder();
  var cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  var sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map(function(b) { return b.toString(16).padStart(2, "0"); }).join("");
}


function clavePublicaHoy() {
  var ahora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/El_Salvador" }));
  return ahora.getFullYear() + "-" +
    String(ahora.getMonth() + 1).padStart(2, "0") + "-" +
    String(ahora.getDate()).padStart(2, "0");
}

/**
 * Firma un objeto de parámetros y devuelve una Promise con los
 * parámetros originales + _nonce, _ts, _hmac añadidos.
 *
 * @param {string} action   - Nombre de la acción
 * @param {Object} fields   - {campo: valor} que se enviarán
 * @param {string|null} key - Clave HMAC (null = usar fecha del día)
 */
async function firmarPayload(action, fields, key) {
  var nonce = generarNonce();
  var ts    = String(Math.floor(Date.now() / 1000));
  var clave = key || clavePublicaHoy();


  var camposOrdenados = Object.keys(fields).sort().map(function(k) {
    return k + "=" + (fields[k] !== undefined && fields[k] !== null ? fields[k] : "");
  }).join("|");
  var mensaje = action + "|" + nonce + "|" + ts + "|" + camposOrdenados;

  var hmac = await hmacSha256Hex(clave, mensaje);

  var params = new URLSearchParams();
  params.append("action", action);
  Object.keys(fields).forEach(function(k) {
    if (fields[k] !== undefined && fields[k] !== null && fields[k] !== "") {
      params.append(k, fields[k]);
    }
  });
  params.append("_nonce", nonce);
  params.append("_ts",    ts);
  params.append("_hmac",  hmac);
  return params;
}


function vibrar(tipo) {
  if (!("vibrate" in navigator)) return;
  try {
    if (tipo === "exito") navigator.vibrate(50);
    else if (tipo === "error") navigator.vibrate([80, 60, 80, 60, 80]);
    else if (tipo === "aviso") navigator.vibrate([40, 40, 40]);
  } catch (e) { /* algunos navegadores lanzan si no hay gesto de usuario previo */ }
}


function showToast(message, type) {
  type = type || "success";
  var container = document.getElementById("toast-box-container");
  if (!container) return;
  var toast = document.createElement("div");
  toast.className = "toast-card " + type;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(function() {
    toast.style.animation = "toast-fade-out 0.4s cubic-bezier(0.19,1,0.22,1) forwards";
    toast.addEventListener("animationend", function() { toast.remove(); });
  }, 4000);
}

// ============================================================
// RELOJ
// ============================================================
function updateClock() {
  var el = document.getElementById("live-clock");
  if (!el) return;
  var now = new Date();
  var h = now.getHours();
  var m = String(now.getMinutes()).padStart(2, "0");
  var s = String(now.getSeconds()).padStart(2, "0");
  var ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  el.textContent = String(h).padStart(2, "0") + ":" + m + ":" + s + " " + ampm;
}
setInterval(updateClock, 1000);
updateClock();


function switchView(viewId) {
  var current = document.querySelector(".card-view.active");
  var target = document.getElementById(viewId);
  if (!target || current === target) return;
  document.querySelectorAll(".alert-box").forEach(function(el) {
    el.className = "alert-box";
    el.style.display = "none";
  });
  if (current) current.classList.remove("active");
  target.classList.add("active");
}

function salirDeRegistro() {
  detenerQR();
  switchView("view-menu");
}


function obtenerEstadoGeoGlobal() {
  return fetch(SCRIPT_URL + "?action=obtener_geo_estado")
    .then(function(res) { return res.json(); })
    .then(function(data) {
      geoActiva = data.geo_activa !== false;
      return geoActiva;
    })
    .catch(function() {
      geoActiva = true;
      return true;
    });
}

function actualizarGeoUI(estado, texto) {
  var box = document.getElementById("geo-status-box");
  var span = document.getElementById("geo-status-text");
  if (!box || !span) return;
  box.className = "geo-status-box " + estado;
  span.textContent = texto;
  var iconos = { checking: "📍", ok: "✅", fail: "❌", disabled: "🔓" };
  box.querySelector(".geo-dot").textContent = iconos[estado] || "📍";
}

function verificarGeolocalizacion() {
  if (!geoActiva) {
    geoOK = true;
    geoRevisada = true;
    actualizarGeoUI("disabled", "🔓 Validación de ubicación desactivada por el docente");
    return;
  }

  if (!navigator.geolocation) {
    geoOK = false;
    geoRevisada = true;
    actualizarGeoUI("fail", "❌ Tu dispositivo no soporta geolocalización");
    return;
  }

  actualizarGeoUI("checking", "⏳ Verificando tu ubicación...");

  navigator.geolocation.getCurrentPosition(
    function(pos) {
      var dist = haversineKm(pos.coords.latitude, pos.coords.longitude, CENTED_LAT, CENTED_LNG);
      var distM = Math.round(dist * 1000);
      geoRevisada = true;
      geoCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (dist <= RADIO_KM) {
        geoOK = true;
        actualizarGeoUI("ok", "✅ Ubicación confirmada — estás en el CENTED (" + distM + " m)");
      } else {
        geoOK = false;
        actualizarGeoUI("fail", "❌ Fuera del rango permitido — estás a " + distM + " m del CENTED (máx 1 km)");
      }
    },
    function(err) {
      geoRevisada = true;
      geoOK = false;
      var msgs = {
        1: "Permiso de ubicación denegado. Actívalo en ajustes del navegador.",
        2: "No se pudo obtener la ubicación. Verifica tu GPS.",
        3: "Tiempo de espera agotado. Intenta de nuevo."
      };
      actualizarGeoUI("fail", "❌ " + (msgs[err.code] || "Error de geolocalización"));
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function haversineKm(lat1, lng1, lat2, lng2) {
  var R = 6371;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ============================================================
// QR SCANNER
// ============================================================
function setFirmaTab(tab) {
  firmaTab = tab;
  document.getElementById("tab-qr").classList.toggle("active", tab === "qr");
  document.getElementById("tab-manual").classList.toggle("active", tab === "manual");
  document.getElementById("firma-panel-qr").style.display = tab === "qr" ? "block" : "none";
  document.getElementById("firma-panel-manual").style.display = tab === "manual" ? "block" : "none";
  if (tab === "manual") detenerQR();
}

function setQrStatus(clase, texto) {
  var el = document.getElementById("qr-status");
  if (!el) return;
  el.className = "qr-status " + clase;
  el.textContent = texto;
}

function iniciarQR() {
  if (qrActivo) return;
  if (typeof Html5Qrcode === "undefined") {
    setQrStatus("error", "❌ Librería QR no disponible. Recarga la página.");
    return;
  }
  document.getElementById("btn-start-qr").style.display = "none";
  document.getElementById("btn-stop-qr").style.display = "inline-block";
  setQrStatus("scanning", "🔍 Cámara activa — apunta al QR del docente...");

  qrScanner = new Html5Qrcode("qr-reader");
  var config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0, disableFlip: false };

  qrScanner.start(
    { facingMode: "environment" },
    config,
    function(decodedText) {
      var firma = decodedText.trim();
      if (/^\d{6}$/.test(firma)) {
        document.getElementById("firma-valor").value = firma;
        setQrStatus("found", "✅ QR leído — Firma: " + firma.slice(0, 3) + "***");
        showToast("✅ Firma capturada del QR. Puedes enviar.", "success");
        detenerQR();
      } else {
        setQrStatus("error", "❌ QR no reconocido. Asegúrate de escanear el QR del docente.");
      }
    },
    function() {}
  ).then(function() {
    qrActivo = true;
  }).catch(function(err) {
    qrActivo = false;
    document.getElementById("btn-start-qr").style.display = "inline-block";
    document.getElementById("btn-stop-qr").style.display = "none";
    if (err.toString().includes("Permission")) {
      setQrStatus("error", "❌ Permiso de cámara denegado. Actívalo en los ajustes del navegador.");
    } else {
      setQrStatus("error", "❌ Error al iniciar cámara: " + err.toString().slice(0, 60));
    }
  });
}

function detenerQR() {
  if (qrScanner && qrActivo) {
    qrScanner.stop().catch(function() {}).finally(function() {
      qrScanner = null;
      qrActivo = false;
    });
  } else {
    qrScanner = null;
    qrActivo = false;
  }
  var btnStart = document.getElementById("btn-start-qr");
  var btnStop = document.getElementById("btn-stop-qr");
  if (btnStart) btnStart.style.display = "inline-block";
  if (btnStop) btnStop.style.display = "none";
  var firmaActual = document.getElementById("firma-valor");
  if (firmaActual && !firmaActual.value) {
    setQrStatus("waiting", "📷 Toca 'Iniciar Cámara' para escanear el QR del docente");
  }
}


function normalizarNombre(n) {
  return n.trim().toLowerCase().replace(/\b\w/g, function(l) { return l.toUpperCase(); });
}

function validarNombre(n) {
  var norm = normalizarNombre(n);
  var palabras = norm.split(/\s+/).filter(Boolean);
  return palabras.length >= 2 && palabras.length <= 5 && /^[A-Za-zÁÉÍÓÚÑáéíóúñ\s]+$/.test(norm);
}

// Teléfono salvadoreño: 8 dígitos, empieza con 2 (fijo), 6 o 7 (móvil)
function limpiarTelefono(t) {
  return (t || "").replace(/[^\d]/g, "");
}
function validarTelefono(t) {
  return /^[267]\d{7}$/.test(limpiarTelefono(t));
}


function irAlInicioDePagina() {
  window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
}

function registrarAsistencia(event) {
  event.preventDefault();

  // Honeypot anti-bot: campo invisible para humanos, si viene lleno es un bot.
  var hpReg = (document.getElementById("reg-website") || {}).value || "";
  if (hpReg.trim() !== "") {
    var alertBoxHp = document.getElementById("alertRegistro");
    alertBoxHp.textContent = "❌ No se pudo procesar tu solicitud.";
    alertBoxHp.className = "alert-box error";
    alertBoxHp.style.display = "block";
    irAlInicioDePagina();
    return;
  }

  var claveInput   = sanitizarInput(document.getElementById("reg-key").value).toUpperCase();
  var docenteInput = sanitizarInput(document.getElementById("reg-teacher").value);
  var grupoInput   = sanitizarInput(document.getElementById("reg-group").value);
  var alertBox     = document.getElementById("alertRegistro");
  var btn          = document.getElementById("btnRegistrar");

  var firmaInput = "";
  if (firmaTab === "qr") {
    firmaInput = sanitizarInput(document.getElementById("firma-valor").value);
  } else {
    firmaInput = sanitizarInput(document.getElementById("reg-token").value);
  }

  if (!claveInput || claveInput.length !== 4) {
    alertBox.textContent = "❌ Ingresa tu Clave Única de 4 caracteres.";
    alertBox.className = "alert-box error";
    alertBox.style.display = "block";
    irAlInicioDePagina();
    return;
  }
  if (!firmaInput) {
    alertBox.textContent = firmaTab === "qr"
      ? "❌ Escanea el QR del docente primero, o cambia a la pestaña 'Escribir'."
      : "❌ Ingresa la Firma del Docente.";
    alertBox.className = "alert-box error";
    alertBox.style.display = "block";
    irAlInicioDePagina();
    return;
  }

  if (geoActiva && !geoRevisada) {
    alertBox.textContent = "⏳ Esperando verificación de ubicación. Espera un momento.";
    alertBox.className = "alert-box warning";
    alertBox.style.display = "block";
    irAlInicioDePagina();
    return;
  }
  if (geoActiva && !geoOK) {
    alertBox.textContent = "❌ Debes estar dentro del CENTED (máx 1 km) para registrar asistencia. Si estás en clase virtual, el docente puede desactivar la verificación.";
    alertBox.className = "alert-box error";
    alertBox.style.display = "block";
    irAlInicioDePagina();
    return;
  }

  alertBox.style.display = "none";
  btn.disabled = true;
  btn.innerHTML = "⚡ ENVIANDO REGISTRO...";

  var fields = {
    clave:   claveInput,
    docente: docenteInput,
    grupo:   grupoInput,
    firma:   firmaInput,
    hp:      hpReg
  };
  if (geoActiva && geoCoords) {
    fields.lat = geoCoords.lat;
    fields.lng = geoCoords.lng;
  }


  firmarPayload("asistencia", fields, null)
    .then(function(params) {
      return fetch(SCRIPT_URL, { method: "POST", body: params });
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.result === "success") {
        vibrar("exito");
        alertBox.textContent = "✓ ¡ASISTENCIA PROCESADA CON ÉXITO! Bienvenido/a, " + (data.nombre || "") + ".";
        alertBox.className = "alert-box success";
        alertBox.style.display = "block";
        irAlInicioDePagina();
        showToast("✓ Asistencia registrada exitosamente!", "success");
        document.getElementById("form-register").reset();
        document.getElementById("firma-valor").value = "";
        setQrStatus("waiting", "📷 Toca 'Iniciar Cámara' para escanear el QR del docente");
        setTimeout(function() { salirDeRegistro(); }, 2500);
      } else if (data.result === "duplicated") {
        vibrar("aviso");
        alertBox.textContent = data.message || "⚠️ Ya registraste hoy.";
        alertBox.className = "alert-box warning";
        alertBox.style.display = "block";
        irAlInicioDePagina();
        showToast("⚠️ " + (data.message || "Ya registraste hoy."), "warning");
      } else {
        vibrar("error");
        alertBox.textContent = data.message || "❌ Ocurrió un error inesperado.";
        alertBox.className = "alert-box error";
        alertBox.style.display = "block";
        irAlInicioDePagina();
        showToast("❌ " + (data.message || "Fallo al procesar."), "warning");
      }
    })
    .catch(function() {
      vibrar("error");
      alertBox.textContent = "❌ ERROR DE RED O SEGURIDAD. Verifica tu internet e intenta de nuevo.";
      alertBox.className = "alert-box error";
      alertBox.style.display = "block";
      irAlInicioDePagina();
      showToast("❌ Error de red.", "warning");
    })
    .finally(function() {
      btn.disabled = false;
      btn.innerHTML = "✓ Enviar Asistencia";
    });
}


function generarClave(event) {
  event.preventDefault();

  
  var hpGen = (document.getElementById("gen-website") || {}).value || "";
  var nombreInput = document.getElementById("gen-name").value;
  var docenteInput = document.getElementById("gen-teacher").value;
  var telefonoInput = document.getElementById("gen-phone").value;
  var alertBox = document.getElementById("alertGenerarClave");
  var btn = document.getElementById("btnGenerar");
  var containerClave = document.getElementById("claveGeneradaContainer");

  if (hpGen.trim() !== "") {
    alertBox.textContent = "❌ No se pudo procesar tu solicitud.";
    alertBox.className = "alert-box error";
    alertBox.style.display = "block";
    return;
  }

  if (!validarNombre(nombreInput)) {
    alertBox.textContent = "❌ Escribe tu nombre completo (nombre y al menos un apellido).";
    alertBox.className = "alert-box error";
    alertBox.style.display = "block";
    showToast("❌ Nombre inválido.", "warning");
    return;
  }

  if (!validarTelefono(telefonoInput)) {
    alertBox.textContent = "❌ Ingresa un número de teléfono válido de 8 dígitos (Ej: 71234567).";
    alertBox.className = "alert-box error";
    alertBox.style.display = "block";
    showToast("❌ Teléfono inválido.", "warning");
    return;
  }

  var telefono = limpiarTelefono(telefonoInput);
  var nombre = normalizarNombre(nombreInput);
  btn.disabled = true;
  btn.innerHTML = "⚡ CONSULTANDO BASE DE DATOS...";
  containerClave.style.display = "none";
  alertBox.style.display = "none";

  firmarPayload("buscar_alumno", { nombre: nombre }, null)
    .then(function(params) {
      if (tokenSesion) params.append("token", tokenSesion);
      return fetch(SCRIPT_URL, { method: "POST", body: params });
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.clave) {
        document.getElementById("codGenerado").textContent = data.clave;
        containerClave.style.display = "block";
        showToast("🔍 Clave recuperada con éxito.", "info");
        document.getElementById("form-keygen").reset();
        btn.disabled = false;
        btn.innerHTML = "🔒 Generar Mi Clave Permanente";
      } else {
        crearNuevaClave(nombre, docenteInput, telefono, hpGen, alertBox, btn, containerClave);
      }
    })
    .catch(function() {
      alertBox.textContent = "❌ ERROR AL CONSULTAR EL SERVIDOR. Intenta nuevamente.";
      alertBox.className = "alert-box error";
      alertBox.style.display = "block";
      btn.disabled = false;
      btn.innerHTML = "🔒 Generar Mi Clave Permanente";
    });
}

function crearNuevaClave(nombre, docente, telefono, hp, alertBox, btn, containerClave) {
  btn.innerHTML = "⚡ CREANDO CREDENCIAL...";
  var claveNueva = "";
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (var i = 0; i < 4; i++) {
    claveNueva += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  firmarPayload("guardar_clave", { nombre: nombre, clave: claveNueva, docente: sanitizarInput(docente), telefono: telefono, hp: hp || "" }, null)
    .then(function(params) {
      return fetch(SCRIPT_URL, { method: "POST", body: params });
    })
    .then(function(res) { return res.json(); })
    .then(function(dataPost) {
      if (dataPost.result === "success") {
        document.getElementById("codGenerado").textContent = claveNueva;
        containerClave.style.display = "block";
        showToast("🎉 ¡Nueva clave permanente creada!", "success");
        document.getElementById("form-keygen").reset();
      } else {
        alertBox.textContent = dataPost.message || "❌ No se pudo guardar la clave.";
        alertBox.className = "alert-box error";
        alertBox.style.display = "block";
        showToast("⚠️ " + (dataPost.message || "Error al registrar."), "warning");
      }
    })
    .catch(function() {
      alertBox.textContent = "❌ NO SE PUDO GUARDAR EN LA BASE DE DATOS. Verifica tu conexión.";
      alertBox.className = "alert-box error";
      alertBox.style.display = "block";
    })
    .finally(function() {
      btn.disabled = false;
      btn.innerHTML = "🔒 Generar Mi Clave Permanente";
    });
}


function capturarClave() {
  var el = document.getElementById("claveCapturaArea");
  var boton = document.getElementById("btn-guardar-clave-captura");
  if (!el || typeof html2canvas === "undefined") {
    showToast("❌ No se pudo generar la captura. Recarga la página.", "warning");
    return;
  }
  var textoOriginal = boton ? boton.innerHTML : "";
  if (boton) { boton.disabled = true; boton.innerHTML = "⚡ GENERANDO..."; }

  html2canvas(el, { backgroundColor: "#ffffff", scale: 2 }).then(function(canvas) {
    var codigo = (document.getElementById("codGenerado") || {}).textContent || "clave";
    var link = document.createElement("a");
    link.download = "clave-cented-" + codigo + ".png";
    link.href = canvas.toDataURL("image/png");
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast("📸 Captura guardada en tus descargas.", "success");
  }).catch(function() {
    showToast("❌ Error al generar la captura.", "warning");
  }).finally(function() {
    if (boton) { boton.disabled = false; boton.innerHTML = textoOriginal; }
  });
}


function unlockTeacherPanel(event) {
  if (event) event.preventDefault();

  var hpTeacher = (document.getElementById("teacher-website") || {}).value || "";
  var passwordInput = document.getElementById("teacher-password");
  var alertBox = document.getElementById("alertVerRegistros");
  var btn = document.getElementById("btnAccederRegistros");
  var ahora = Date.now();

  if (hpTeacher.trim() !== "") {
    alertBox.textContent = "❌ CREDENCIAL DENEGADA.";
    alertBox.className = "alert-box error";
    alertBox.style.display = "block";
    return;
  }

 
  if (ahora < bloqueoHasta) {
    var segundos = Math.ceil((bloqueoHasta - ahora) / 1000);
    alertBox.textContent = "🚫 BLOQUEADO. Espera " + segundos + " segundos.";
    alertBox.className = "alert-box error";
    alertBox.style.display = "block";
    return;
  }

  if (intentosFallidos >= MAX_INTENTOS) {
    bloqueoHasta = ahora + TIEMPO_BLOQUEO;
    alertBox.textContent = "🚫 DEMASIADOS INTENTOS. Bloqueado 5 minutos.";
    alertBox.className = "alert-box error";
    alertBox.style.display = "block";
    return;
  }

  alertBox.style.display = "none";
  btn.disabled = true;
  btn.innerHTML = "⚡ VERIFICANDO CREDENCIALES...";

  var firma = passwordInput.value.trim();

  sha256Hex(firma).then(function (firmaHash) {
    // POST en lugar de GET — la contraseña no queda en URL/logs
    var params = new URLSearchParams();
    params.append("action", "validar_firma");
    params.append("firma_hash", firmaHash);
    params.append("hp", hpTeacher);

    return fetch(SCRIPT_URL, { method: "POST", body: params });
  })
    .then(function(res) { return res.json(); })
    .then(function(validacion) {
      if (!validacion.valido) {
        intentosFallidos++;
        var restantes = MAX_INTENTOS - intentosFallidos;
        alertBox.textContent = "❌ CREDENCIAL DENEGADA. Intentos restantes: " + restantes;
        alertBox.className = "alert-box error";
        alertBox.style.display = "block";
        showToast("❌ Acceso incorrecto.", "warning");
        passwordInput.focus();
        btn.disabled = false;
        btn.innerHTML = "🔓 Entrar";
        passwordInput.value = "";
        return;
      }

   
      intentosFallidos = 0;
      bloqueoHasta = 0;
      tokenSesion = validacion.token; // Token temporal del backend
      btn.innerHTML = "⚡ CARGANDO PANEL...";
      renderizarPanelDocente();
    })
    .catch(function() {
      alertBox.textContent = "❌ ERROR AL VALIDAR CREDENCIALES. Intenta de nuevo.";
      alertBox.className = "alert-box error";
      alertBox.style.display = "block";
      btn.disabled = false;
      btn.innerHTML = "🔓 Entrar";
    });
}

function renderizarPanelDocente() {
  var authSection = document.getElementById("teacher-auth");
  var dashboardSection = document.getElementById("teacher-dashboard");

  authSection.style.display = "none";

 
  dashboardSection.innerHTML = `
    <div class="geo-toggle-row">
      <div class="geo-toggle-label">
        📍 Validación de Ubicación GPS
        <span id="geo-toggle-desc">Activada — los alumnos deben estar dentro de 1 km</span>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" id="geo-toggle-input" checked />
        <span class="toggle-slider"></span>
      </label>
    </div>

    <div class="input-group">
      <label>Registros de Asistencia (Todos): <small id="auto-refresh-indicator" style="font-weight:400; opacity:0.6; text-transform:none;">🔄 Auto-actualiza cada 30s</small></label>
      <div class="excel-embed-container" style="padding:0.5rem">
        <table id="tabla-api-privada" style="width:100%; border-collapse:collapse; font-size:0.85rem; text-align:left;">
          <thead>
            <tr style="background:var(--text-color); color:var(--bg-color); text-transform:uppercase; font-family:var(--font-heading);">
              <th style="padding:0.6rem; border:1px solid var(--text-color);">Nombre</th>
              <th style="padding:0.6rem; border:1px solid var(--text-color);">Clave</th>
              <th style="padding:0.6rem; border:1px solid var(--text-color);">Grupo</th>
              <th style="padding:0.6rem; border:1px solid var(--text-color);">Docente</th>
              <th style="padding:0.6rem; border:1px solid var(--text-color);">Hora</th>
            </tr>
          </thead>
          <tbody id="tabla-api-cuerpo">
            <tr><td colspan="5" style="text-align:center; padding:2rem; opacity:0.5;">Cargando datos...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="stats-counter-grid">
      <div class="stat-box">
        <span class="stat-num" id="count-morning">0</span>
        <span class="stat-label">☀️ Mañana</span>
      </div>
      <div class="stat-box">
        <span class="stat-num" id="count-afternoon">0</span>
        <span class="stat-label">🌙 Tarde</span>
      </div>
    </div>

    <div class="input-group">
      <label>Asistencias de Hoy:</label>
      <div class="registros-container" id="listaRegistros"></div>
    </div>

    <div class="form-actions row-layout">
      <button type="button" class="btn-danger" id="btn-clear-all">🗑 Limpiar y Archivar</button>
      <button type="button" class="btn-back" id="btn-lock-return">← Cerrar Panel</button>
    </div>

    <div class="input-group" style="margin-top:0.5rem;">
      <label>⏰ Limpieza Automática Semanal</label>
      <small class="helper-text" style="margin-bottom:0.8rem; display:block;">
        Elige el día y la hora en que el sistema debe limpiar y archivar
        la asistencia automáticamente, sin que nadie tenga que entrar al panel.
      </small>

      <div class="geo-toggle-row" style="margin-bottom:1rem;">
        <div class="geo-toggle-label">
          Activar limpieza automática
          <span id="auto-clean-desc">Cargando configuración...</span>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="auto-clean-toggle" />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="input-group">
        <label for="auto-clean-day">Día de la semana</label>
        <select id="auto-clean-day">
          <option value="0">Domingo</option>
          <option value="1">Lunes</option>
          <option value="2">Martes</option>
          <option value="3">Miércoles</option>
          <option value="4">Jueves</option>
          <option value="5">Viernes</option>
          <option value="6" selected>Sábado</option>
        </select>
      </div>

      <div class="input-group">
        <label for="auto-clean-time">Hora (24h, hora El Salvador)</label>
        <input type="text" id="auto-clean-time" value="17:00" placeholder="Ej: 17:00" maxlength="5" />
        <small class="helper-text">Formato HH:MM, 24 horas. Ej: 17:00 = 5:00 PM.</small>
      </div>

      <button type="button" class="btn-secondary" id="btn-save-auto-clean" style="margin-top:0.5rem;">
        💾 Guardar Configuración de Limpieza
      </button>
    </div>
  `;

  dashboardSection.classList.add("visible");

  // Adjuntar event listeners a los nuevos botones
  document.getElementById("geo-toggle-input").addEventListener("change", toggleGeolocalizacion);
  document.getElementById("btn-clear-all").addEventListener("click", function() { triggerClearAll(); });
  document.getElementById("btn-lock-return").addEventListener("click", lockAndReturn);
  document.getElementById("btn-save-auto-clean").addEventListener("click", guardarConfigLimpiezaAutomatica);

  // Sincronizar toggle con estado global
  obtenerEstadoGeoGlobal().then(function(activa) {
    var input = document.getElementById("geo-toggle-input");
    if (input) input.checked = activa;
    actualizarDescGeo();
  });

  // Cargar configuración actual de limpieza automática
  cargarConfigLimpiezaAutomatica();

  // Carga inicial (con toast de bienvenida) + arrancar auto-refresh cada 30s
  cargarDatosPanel(false);
  detenerAutoRefreshPanel();
  panelAutoRefreshInterval = setInterval(function() { cargarDatosPanel(true); }, 30000);
}

var DIAS_SEMANA_TEXTO = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function cargarConfigLimpiezaAutomatica() {
  var params = new URLSearchParams();
  params.append("action", "obtener_config_limpieza");
  params.append("token", tokenSesion || "");

  fetch(SCRIPT_URL, { method: "POST", body: params })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      var desc = document.getElementById("auto-clean-desc");
      var toggle = document.getElementById("auto-clean-toggle");
      var daySel = document.getElementById("auto-clean-day");
      var timeInput = document.getElementById("auto-clean-time");
      if (!desc || !toggle || !daySel || !timeInput) return; // el panel ya se cerró

      if (data.result !== "success") {
        desc.textContent = "No se pudo cargar la configuración.";
        return;
      }

      toggle.checked = !!data.activa;
      daySel.value = String(data.dia);
      timeInput.value = data.hora;
      actualizarDescLimpiezaAuto(data.activa, data.dia, data.hora);
    })
    .catch(function() {
      var desc = document.getElementById("auto-clean-desc");
      if (desc) desc.textContent = "⚠️ Error al cargar configuración.";
    });
}

function actualizarDescLimpiezaAuto(activa, dia, hora) {
  var desc = document.getElementById("auto-clean-desc");
  if (!desc) return;
  if (!activa) {
    desc.textContent = "Desactivada — la limpieza solo se hace manualmente";
    return;
  }
  var nombreDia = DIAS_SEMANA_TEXTO[parseInt(dia, 10)] || "Sábado";
  desc.textContent = "Activa — todos los " + nombreDia + " a las " + hora + " (hora ES)";
}

function guardarConfigLimpiezaAutomatica() {
  var btn = document.getElementById("btn-save-auto-clean");
  var toggle = document.getElementById("auto-clean-toggle");
  var daySel = document.getElementById("auto-clean-day");
  var timeInput = document.getElementById("auto-clean-time");
  if (!btn || !toggle || !daySel || !timeInput) return;

  var hora = timeInput.value.trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
    showToast("❌ Hora inválida. Usa formato HH:MM (ej: 17:00).", "warning");
    timeInput.focus();
    return;
  }

  btn.disabled = true;
  btn.textContent = "⚡ Guardando...";

  var params = new URLSearchParams();
  params.append("action", "guardar_config_limpieza");
  params.append("activa", toggle.checked ? "1" : "0");
  params.append("dia", daySel.value);
  params.append("hora", hora);
  params.append("token", tokenSesion || "");

  fetch(SCRIPT_URL, { method: "POST", body: params })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      btn.disabled = false;
      btn.textContent = "💾 Guardar Configuración de Limpieza";
      if (data.result === "success") {
        actualizarDescLimpiezaAuto(toggle.checked, daySel.value, hora);
        showToast("✅ Configuración de limpieza automática guardada.", "success");
      } else if (data.error === "unauthorized") {
        showToast("❌ Sesión inválida. Inicia sesión de nuevo.", "warning");
        lockAndReturn();
      } else {
        showToast("❌ " + (data.message || "Error al guardar configuración."), "warning");
      }
    })
    .catch(function() {
      btn.disabled = false;
      btn.textContent = "💾 Guardar Configuración de Limpieza";
      showToast("❌ Error de red al guardar configuración.", "warning");
    });
}


function detenerAutoRefreshPanel() {
  if (panelAutoRefreshInterval) {
    clearInterval(panelAutoRefreshInterval);
    panelAutoRefreshInterval = null;
  }
}

/**
 * Carga (o recarga) los datos del panel docente.
 * @param {boolean} silencioso - si true, no muestra el toast de éxito
 *                                ni el texto "Cargando..." (evita parpadeo
 *                                en las recargas automáticas de fondo).
 */
function cargarDatosPanel(silencioso) {
  var indicador = document.getElementById("auto-refresh-indicator");
  if (indicador && silencioso) indicador.textContent = "🔄 Actualizando...";

  var params = new URLSearchParams();
  params.append("action", "obtener_registros");
  params.append("token", tokenSesion || "");

  fetch(SCRIPT_URL, { method: "POST", body: params })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.error === "unauthorized") {
        detenerAutoRefreshPanel();
        showToast("❌ Sesión inválida o expirada", "warning");
        lockAndReturn();
        return;
      }

      var tablaCuerpo = document.getElementById("tabla-api-cuerpo");
      if (!tablaCuerpo) return; // el panel ya se cerró
      tablaCuerpo.innerHTML = "";

      if (!Array.isArray(data) || data.length === 0) {
        tablaCuerpo.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2rem; opacity:0.5;">No hay registros globales.</td></tr>';
      } else {
        data.forEach(function(r) {
          var fila = document.createElement("tr");
          fila.style.borderBottom = "1px solid var(--text-color)";
          fila.innerHTML =
            '<td style="padding:0.6rem; border-right:1px solid var(--text-color); font-weight:700;">' + (r.nombre || "—") + '</td>' +
            '<td style="padding:0.6rem; border-right:1px solid var(--text-color); font-variant-numeric:tabular-nums;">' + (r.clave || "—") + '</td>' +
            '<td style="padding:0.6rem; border-right:1px solid var(--text-color);">' + (r.grupo || "—") + '</td>' +
            '<td style="padding:0.6rem; border-right:1px solid var(--text-color);">' + (r.docente || "—") + '</td>' +
            '<td style="padding:0.6rem; font-variant-numeric:tabular-nums; opacity:0.8;">' + (r.hora || "—") + '</td>';
          tablaCuerpo.appendChild(fila);
        });
      }

      var ahora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/El_Salvador" }));
      var hoyStr = String(ahora.getDate()).padStart(2, "0") + "/" + String(ahora.getMonth() + 1).padStart(2, "0") + "/" + ahora.getFullYear();

      var filtrados = (Array.isArray(data) ? data : []).filter(function(r) {
        if (!r.fecha) return false;
        var p = r.fecha.replace(/-/g, "/").split("/");
        return p.length === 3 && (p[0].padStart(2, "0") + "/" + p[1].padStart(2, "0") + "/" + p[2]) === hoyStr;
      });

      document.getElementById("count-morning").textContent = filtrados.filter(function(r) { return r.grupo === "Mañana"; }).length;
      document.getElementById("count-afternoon").textContent = filtrados.filter(function(r) { return r.grupo === "Tarde"; }).length;

      var contenedor = document.getElementById("listaRegistros");
      contenedor.innerHTML = filtrados.length === 0
        ? '<div class="registro-item" style="text-align:center; opacity:0.5;">No hay asistencias hoy.</div>'
        : filtrados.map(function(r) {
            return '<div class="registro-item"><strong>' + r.nombre + '</strong> — ' + r.grupo + '<br><small style="opacity:0.7;">Clave: ' + r.clave + ' | Docente: ' + r.docente + ' | Hora: ' + r.hora + '</small></div>';
          }).join('');

      if (indicador) indicador.textContent = "🔄 Auto-actualiza cada 30s";
      if (!silencioso) showToast("🔓 Panel Docente Activo", "success");
    })
    .catch(function() {
      var indicador2 = document.getElementById("auto-refresh-indicator");
      if (indicador2) indicador2.textContent = "⚠️ Error al actualizar — reintentando en 30s";
      if (!silencioso) {
        showToast("❌ Error al cargar datos", "warning");
        lockAndReturn();
      }
    });
}

function lockAndReturn() {
  detenerAutoRefreshPanel();
  var dashboard = document.getElementById("teacher-dashboard");
  var auth = document.getElementById("teacher-auth");
  if (dashboard) {
    dashboard.classList.remove("visible");
    dashboard.innerHTML = ""; // DESTRUIR contenido al salir
  }
  if (auth) auth.style.display = "block";
  tokenSesion = null; // Invalidar token
  switchView("view-menu");
}

function toggleGeolocalizacion() {
  var input = document.getElementById("geo-toggle-input");
  var activa = input.checked;

  var params = new URLSearchParams();
  params.append("action", "guardar_geo_estado");
  params.append("estado", activa ? "1" : "0");
  params.append("token", tokenSesion || "");

  fetch(SCRIPT_URL, { method: "POST", body: params })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.result === "success") {
        geoActiva = activa;
        actualizarDescGeo();
        showToast(
          activa ? "📍 Validación de ubicación ACTIVADA globalmente" : "🔓 Validación de ubicación DESACTIVADA globalmente",
          activa ? "success" : "info"
        );
      } else {
        input.checked = !activa;
        showToast("❌ Error al guardar estado. Intenta de nuevo.", "warning");
      }
    })
    .catch(function() {
      input.checked = !activa;
      showToast("❌ Error de red al guardar estado.", "warning");
    });
}

function actualizarDescGeo() {
  var desc = document.getElementById("geo-toggle-desc");
  if (!desc) return;
  desc.textContent = geoActiva
    ? "Activada — los alumnos deben estar dentro de 1 km"
    : "Desactivada — válido para clases virtuales";
}

function triggerClearAll() {
  if (!confirm("🚨 ¿Estás completamente seguro de que deseas limpiar y archivar todos los registros del día?"))
    return;
  showToast("⚡ Procesando solicitud...", "info");

  var params = new URLSearchParams();
  params.append("action", "limpiar_asistencias");
  params.append("token", tokenSesion || ""); // Requiere token válido

  fetch(SCRIPT_URL, { method: "POST", body: params })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.result === "success") {
        showToast("🗑 Registros archivados con éxito.", "success");
        alert("Registros guardados en Historial y limpiados correctamente.");
        lockAndReturn();
      } else if (data.error === "unauthorized") {
        showToast("❌ Sesión inválida. Inicia sesión de nuevo.", "warning");
        lockAndReturn();
      } else {
        showToast("❌ " + (data.message || "Error al limpiar."), "warning");
      }
    })
    .catch(function() {
      showToast("❌ Error al reiniciar el día. Intenta de nuevo.", "warning");
    });
}


var THEME_STORAGE_KEY = "cented_theme";

function aplicarTema(tema) {
  var esOscuro = tema === "dark";
  document.documentElement.setAttribute("data-theme", esOscuro ? "dark" : "light");
  var icon = document.getElementById("theme-icon");
  if (icon) icon.textContent = esOscuro ? "☀️" : "🌙";
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", esOscuro ? "#14151a" : "#000000");
}

function inicializarTema() {
  var guardado = null;
  try { guardado = localStorage.getItem(THEME_STORAGE_KEY); } catch (e) { /* localStorage bloqueado */ }
  var prefiereOscuro = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  var tema = guardado || (prefiereOscuro ? "dark" : "light");
  aplicarTema(tema);
  var input = document.getElementById("theme-toggle-input");
  if (input) input.checked = tema === "dark";
}

function toggleTema() {
  var input = document.getElementById("theme-toggle-input");
  var tema = input && input.checked ? "dark" : "light";
  aplicarTema(tema);
  try { localStorage.setItem(THEME_STORAGE_KEY, tema); } catch (e) { /* localStorage bloqueado, no pasa nada */ }
}


document.addEventListener("DOMContentLoaded", function() {
  // Tema (debe ir primero para evitar parpadeo)
  inicializarTema();
  var themeInput = document.getElementById("theme-toggle-input");
  if (themeInput) themeInput.addEventListener("change", toggleTema);

  // Menú
  document.getElementById("btn-menu-register").addEventListener("click", function() { switchView("view-register"); });
  document.getElementById("btn-menu-keygen").addEventListener("click", function() { switchView("view-keygen"); });
  document.getElementById("btn-menu-teacher").addEventListener("click", function() { switchView("view-teacher"); });

  // Registro
  document.getElementById("form-register").addEventListener("submit", registrarAsistencia);
  document.getElementById("btn-back-register").addEventListener("click", salirDeRegistro);
  document.getElementById("tab-qr").addEventListener("click", function() { setFirmaTab("qr"); });
  document.getElementById("tab-manual").addEventListener("click", function() { setFirmaTab("manual"); });
  document.getElementById("btn-start-qr").addEventListener("click", iniciarQR);
  document.getElementById("btn-stop-qr").addEventListener("click", detenerQR);

  // Generar clave
  document.getElementById("form-keygen").addEventListener("submit", generarClave);
  document.getElementById("btn-back-keygen").addEventListener("click", function() { switchView("view-menu"); });
  var btnCaptura = document.getElementById("btn-guardar-clave-captura");
  if (btnCaptura) btnCaptura.addEventListener("click", capturarClave);

  // Panel docente
  document.getElementById("teacher-auth").addEventListener("submit", unlockTeacherPanel);
  document.getElementById("btn-back-teacher").addEventListener("click", function() { switchView("view-menu"); });

  // Disparar verificación de geo al entrar a registro
  var origSwitchView = switchView;
  switchView = function(viewId) {
    origSwitchView(viewId);
    if (viewId === "view-register") {
      geoOK = false;
      geoRevisada = false;
      document.getElementById("firma-valor").value = "";
      setQrStatus("waiting", "📷 Toca 'Iniciar Cámara' para escanear el QR del docente");
      obtenerEstadoGeoGlobal().then(function() {
        verificarGeolocalizacion();
      });
    }
  };
});
