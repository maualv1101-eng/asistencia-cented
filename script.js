
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzT48LmgGy4ydUz5aYKqKpKg7tkXm6APmpc_qeQg1G3K9ZXIHcUBrYBQWIH8UEJINKJ/exec";


const CENTED_LAT = 13.716795758900204;
const CENTED_LNG = -89.1001956388224;
const RADIO_KM = 1.0;


var qrScanner = null;
var qrActivo = false;
var firmaTab = "qr";
var geoActiva = true;
var geoOK = false;
var geoRevisada = false;
var tokenSesion = null;      
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
  s = s.replace(/[\x00-\x1F\x7F]/g, "");   
  s = s.replace(/^[=+\-@\t\r]+/, "");      
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

  // Cadena canónica: acción + nonce + ts + campos ordenados alfabéticamente
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
    actualizarGeoUI("disabled", "🔓 Validación de ubicación desactivada por el docente (clases virtuales)");
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


function registrarAsistencia(event) {
  event.preventDefault();

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
    return;
  }
  if (!firmaInput) {
    alertBox.textContent = firmaTab === "qr"
      ? "❌ Escanea el QR del docente primero, o cambia a la pestaña 'Escribir'."
      : "❌ Ingresa la Firma del Docente.";
    alertBox.className = "alert-box error";
    alertBox.style.display = "block";
    return;
  }

  if (geoActiva && !geoRevisada) {
    alertBox.textContent = "⏳ Esperando verificación de ubicación. Espera un momento.";
    alertBox.className = "alert-box warning";
    alertBox.style.display = "block";
    return;
  }
  if (geoActiva && !geoOK) {
    alertBox.textContent = "❌ Debes estar dentro del CENTED (máx 1 km) para registrar asistencia. Si estás en clase virtual, el docente puede desactivar la verificación.";
    alertBox.className = "alert-box error";
    alertBox.style.display = "block";
    return;
  }

  alertBox.style.display = "none";
  btn.disabled = true;
  btn.innerHTML = "⚡ ENVIANDO REGISTRO...";

  var fields = {
    clave:   claveInput,
    docente: docenteInput,
    grupo:   grupoInput,
    firma:   firmaInput
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
        alertBox.textContent = "✓ ¡ASISTENCIA PROCESADA CON ÉXITO! Bienvenido/a, " + (data.nombre || "") + ".";
        alertBox.className = "alert-box success";
        alertBox.style.display = "block";
        showToast("✓ Asistencia registrada exitosamente!", "success");
        document.getElementById("form-register").reset();
        document.getElementById("firma-valor").value = "";
        setQrStatus("waiting", "📷 Toca 'Iniciar Cámara' para escanear el QR del docente");
        setTimeout(function() { salirDeRegistro(); }, 2500);
      } else if (data.result === "duplicated") {
        alertBox.textContent = data.message || "⚠️ Ya registraste hoy.";
        alertBox.className = "alert-box warning";
        alertBox.style.display = "block";
        showToast("⚠️ " + (data.message || "Ya registraste hoy."), "warning");
      } else {
        alertBox.textContent = data.message || "❌ Ocurrió un error inesperado.";
        alertBox.className = "alert-box error";
        alertBox.style.display = "block";
        showToast("❌ " + (data.message || "Fallo al procesar."), "warning");
      }
    })
    .catch(function() {
      alertBox.textContent = "❌ ERROR DE RED O SEGURIDAD. Verifica tu internet e intenta de nuevo.";
      alertBox.className = "alert-box error";
      alertBox.style.display = "block";
      showToast("❌ Error de red.", "warning");
    })
    .finally(function() {
      btn.disabled = false;
      btn.innerHTML = "✓ Enviar Asistencia";
    });
}


function generarClave(event) {
  event.preventDefault();

  var nombreInput = document.getElementById("gen-name").value;
  var docenteInput = document.getElementById("gen-teacher").value;
  var alertBox = document.getElementById("alertGenerarClave");
  var btn = document.getElementById("btnGenerar");
  var containerClave = document.getElementById("claveGeneradaContainer");

  if (!validarNombre(nombreInput)) {
    alertBox.textContent = "❌ Escribe tu nombre completo (nombre y al menos un apellido).";
    alertBox.className = "alert-box error";
    alertBox.style.display = "block";
    showToast("❌ Nombre inválido.", "warning");
    return;
  }

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
        crearNuevaClave(nombre, docenteInput, alertBox, btn, containerClave);
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

function crearNuevaClave(nombre, docente, alertBox, btn, containerClave) {
  btn.innerHTML = "⚡ CREANDO CREDENCIAL...";
  var claveNueva = "";
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (var i = 0; i < 4; i++) {
    claveNueva += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  firmarPayload("guardar_clave", { nombre: nombre, clave: claveNueva, docente: sanitizarInput(docente) }, null)
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


function unlockTeacherPanel(event) {
  if (event) event.preventDefault();

  var passwordInput = document.getElementById("teacher-password");
  var alertBox = document.getElementById("alertVerRegistros");
  var btn = document.getElementById("btnAccederRegistros");
  var ahora = Date.now();


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
      <label>Registros de Asistencia (Todos):</label>
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
  `;

  dashboardSection.classList.add("visible");

 
  document.getElementById("geo-toggle-input").addEventListener("change", toggleGeolocalizacion);
  document.getElementById("btn-clear-all").addEventListener("click", function() { triggerClearAll(); });
  document.getElementById("btn-lock-return").addEventListener("click", lockAndReturn);


  obtenerEstadoGeoGlobal().then(function(activa) {
    var input = document.getElementById("geo-toggle-input");
    if (input) input.checked = activa;
    actualizarDescGeo();
  });


  var params = new URLSearchParams();
  params.append("action", "obtener_registros");
  params.append("token", tokenSesion || "");

  fetch(SCRIPT_URL, { method: "POST", body: params })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.error === "unauthorized") {
        showToast("❌ Sesión inválida o expirada", "warning");
        lockAndReturn();
        return;
      }

      var tablaCuerpo = document.getElementById("tabla-api-cuerpo");
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

      showToast("🔓 Panel Docente Activo", "success");
    })
    .catch(function() {
      showToast("❌ Error al cargar datos", "warning");
      lockAndReturn();
    });
}

function lockAndReturn() {
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
  params.append("token", tokenSesion || "");

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


document.addEventListener("DOMContentLoaded", function() {

  document.getElementById("btn-menu-register").addEventListener("click", function() { switchView("view-register"); });
  document.getElementById("btn-menu-keygen").addEventListener("click", function() { switchView("view-keygen"); });
  document.getElementById("btn-menu-teacher").addEventListener("click", function() { switchView("view-teacher"); });


  document.getElementById("form-register").addEventListener("submit", registrarAsistencia);
  document.getElementById("btn-back-register").addEventListener("click", salirDeRegistro);
  document.getElementById("tab-qr").addEventListener("click", function() { setFirmaTab("qr"); });
  document.getElementById("tab-manual").addEventListener("click", function() { setFirmaTab("manual"); });
  document.getElementById("btn-start-qr").addEventListener("click", iniciarQR);
  document.getElementById("btn-stop-qr").addEventListener("click", detenerQR);

  
  document.getElementById("form-keygen").addEventListener("submit", generarClave);
  document.getElementById("btn-back-keygen").addEventListener("click", function() { switchView("view-menu"); });


  document.getElementById("teacher-auth").addEventListener("submit", unlockTeacherPanel);
  document.getElementById("btn-back-teacher").addEventListener("click", function() { switchView("view-menu"); });

  
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
