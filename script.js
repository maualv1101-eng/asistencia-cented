// ============================================================
// FRONTEND — Sistema de Asistencia CENTED v3.1
// NUEVAS FEATURES:
//   - Escáner QR con html5-qrcode (rellena firma automáticamente)
//   - Geolocalización (radio 1 km del CENTED, desactivable por docente)
//   - Fallback manual de firma siempre disponible
//   - 100% validación en backend (firma nunca se calcula en frontend)
// ============================================================

const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbw58uNyLTZTHOvnaU1SPMwH9_dx90TalflVO2Us6rJs50Ut0mU_4JISTTDxyGRnGaDH/exec";

// ── COORDENADAS DEL CENTED ──────────────────────────────────
const CENTED_LAT  = 13.716795758900204;
const CENTED_LNG  = -89.1001956388224;
const RADIO_KM    = 1.0; // 1 km de radio permitido

// ── ESTADO GLOBAL ───────────────────────────────────────────
var qrScanner      = null;   // instancia de Html5Qrcode
var qrActivo       = false;
var firmaTab       = "qr";   // "qr" | "manual"
var geoActiva      = true;   // controlado por toggle del docente
var geoOK          = false;  // true cuando la ubicación es válida
var geoRevisada    = false;  // true cuando ya se verificó (éxito o fallo)

// ── CLAVE DE STORAGE PARA GEO TOGGLE ────────────────────────
var GEO_STORAGE_KEY = "cented_geo_activa";

// ============================================================
// TOASTS
// ============================================================
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
  var m = String(now.getMinutes()).padStart(2,"0");
  var s = String(now.getSeconds()).padStart(2,"0");
  var ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  el.textContent = String(h).padStart(2,"0") + ":" + m + ":" + s + " " + ampm;
}
setInterval(updateClock, 1000);
updateClock();

// ============================================================
// NAVEGACIÓN
// ============================================================
function switchView(viewId) {
  var current = document.querySelector(".card-view.active");
  var target  = document.getElementById(viewId);
  if (!target || current === target) return;
  document.querySelectorAll(".alert-box").forEach(function(el) {
    el.className = "alert-box";
    el.style.display = "none";
  });
  if (current) current.classList.remove("active");
  target.classList.add("active");
}

// Salir de registro: detiene cámara si estaba activa
function salirDeRegistro() {
  detenerQR();
  switchView("view-menu");
}

// ============================================================
// GEOLOCALIZACIÓN
// ── Haversine: distancia en km entre dos puntos GPS ──
// ============================================================
function haversineKm(lat1, lng1, lat2, lng2) {
  var R = 6371;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
          Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function actualizarGeoUI(estado, texto) {
  var box  = document.getElementById("geo-status-box");
  var span = document.getElementById("geo-status-text");
  if (!box || !span) return;
  box.className  = "geo-status-box " + estado;
  span.textContent = texto;
  var iconos = { checking:"📍", ok:"✅", fail:"❌", disabled:"🔓" };
  box.querySelector(".geo-dot").textContent = iconos[estado] || "📍";
}

function verificarGeolocalizacion() {
  // Leer estado del toggle desde localStorage
  var stored = localStorage.getItem(GEO_STORAGE_KEY);
  geoActiva = (stored === null) ? true : (stored === "1");

  if (!geoActiva) {
    geoOK       = true;
    geoRevisada = true;
    actualizarGeoUI("disabled", "Validación de ubicación desactivada por el docente");
    return;
  }

  if (!navigator.geolocation) {
    geoOK       = false;
    geoRevisada = true;
    actualizarGeoUI("fail", "❌ Tu dispositivo no soporta geolocalización");
    return;
  }

  actualizarGeoUI("checking", "⏳ Verificando tu ubicación...");

  navigator.geolocation.getCurrentPosition(
    function(pos) {
      var dist = haversineKm(
        pos.coords.latitude, pos.coords.longitude,
        CENTED_LAT, CENTED_LNG
      );
      var distM = Math.round(dist * 1000);
      geoRevisada = true;
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

// Se llama cuando el usuario entra a la vista de registro
document.addEventListener("DOMContentLoaded", function() {
  // Leer geo toggle desde storage al cargar
  var stored = localStorage.getItem(GEO_STORAGE_KEY);
  geoActiva = (stored === null) ? true : (stored === "1");
  // Sincronizar el toggle en el panel docente si ya está cargado
  var input = document.getElementById("geo-toggle-input");
  if (input) input.checked = geoActiva;
  actualizarDescGeo();
});

// Disparar verificación cuando se navega a view-register
var _origSwitchView = switchView;
switchView = function(viewId) {
  _origSwitchView(viewId);
  if (viewId === "view-register") {
    geoOK       = false;
    geoRevisada = false;
    // Resetear QR y firma
    document.getElementById("firma-valor").value = "";
    setQrStatus("waiting", "📷 Toca \"Iniciar Cámara\" para escanear el QR del docente");
    // Iniciar verificación de geo
    verificarGeolocalizacion();
  }
};

// ============================================================
// TOGGLE GEOLOCALIZACIÓN (Panel Docente)
// ============================================================
function toggleGeolocalizacion() {
  var input = document.getElementById("geo-toggle-input");
  geoActiva = input.checked;
  localStorage.setItem(GEO_STORAGE_KEY, geoActiva ? "1" : "0");
  actualizarDescGeo();
  showToast(
    geoActiva
      ? "📍 Validación de ubicación ACTIVADA"
      : "🔓 Validación de ubicación DESACTIVADA (clases virtuales)",
    geoActiva ? "success" : "info"
  );
}

function actualizarDescGeo() {
  var desc = document.getElementById("geo-toggle-desc");
  if (!desc) return;
  var stored = localStorage.getItem(GEO_STORAGE_KEY);
  var activa = (stored === null) ? true : (stored === "1");
  desc.textContent = activa
    ? "Activada — los alumnos deben estar dentro de 1 km"
    : "Desactivada — válido para clases virtuales";
}

// ============================================================
// QR SCANNER — html5-qrcode
// ============================================================
function setFirmaTab(tab) {
  firmaTab = tab;
  document.getElementById("tab-qr").classList.toggle("active",    tab === "qr");
  document.getElementById("tab-manual").classList.toggle("active", tab === "manual");
  document.getElementById("firma-panel-qr").style.display     = tab === "qr"     ? "block" : "none";
  document.getElementById("firma-panel-manual").style.display = tab === "manual" ? "block" : "none";

  if (tab === "manual") {
    detenerQR(); // libera cámara al cambiar a manual
  }
}

function setQrStatus(clase, texto) {
  var el = document.getElementById("qr-status");
  if (!el) return;
  el.className = "qr-status " + clase;
  el.textContent = texto;
}

function iniciarQR() {
  if (qrActivo) return;

  // Verificar que html5-qrcode esté cargado
  if (typeof Html5Qrcode === "undefined") {
    setQrStatus("error", "❌ Librería QR no disponible. Recarga la página.");
    return;
  }

  document.getElementById("btn-start-qr").style.display = "none";
  document.getElementById("btn-stop-qr").style.display  = "inline-block";
  setQrStatus("scanning", "🔍 Cámara activa — apunta al QR del docente...");

  qrScanner = new Html5Qrcode("qr-reader");
  var config = {
    fps: 10,
    qrbox: { width: 250, height: 250 },
    aspectRatio: 1.0,
    disableFlip: false
  };

  qrScanner.start(
    { facingMode: "environment" }, // cámara trasera
    config,
    function(decodedText) {
      // QR leído exitosamente
      var firma = decodedText.trim();

      // Validar que parezca una clave de 6 dígitos
      if (/^\d{6}$/.test(firma)) {
        document.getElementById("firma-valor").value = firma;
        setQrStatus("found", "✅ QR leído — Firma: " + firma.slice(0,3) + "***");
        showToast("✅ Firma capturada del QR. Puedes enviar.", "success");
        detenerQR(); // liberar cámara al detectar
      } else {
        setQrStatus("error", "❌ QR no reconocido. Asegúrate de escanear el QR del docente.");
      }
    },
    function() {
      // Frame sin QR — normal, no hacer nada
    }
  ).then(function() {
    qrActivo = true;
  }).catch(function(err) {
    qrActivo = false;
    document.getElementById("btn-start-qr").style.display  = "inline-block";
    document.getElementById("btn-stop-qr").style.display   = "none";
    if (err.toString().includes("Permission")) {
      setQrStatus("error", "❌ Permiso de cámara denegado. Actívalo en los ajustes del navegador.");
    } else {
      setQrStatus("error", "❌ Error al iniciar cámara: " + err.toString().slice(0,60));
    }
  });
}

function detenerQR() {
  if (qrScanner && qrActivo) {
    qrScanner.stop().catch(function() {}).finally(function() {
      qrScanner = null;
      qrActivo  = false;
    });
  } else {
    qrScanner = null;
    qrActivo  = false;
  }
  var btnStart = document.getElementById("btn-start-qr");
  var btnStop  = document.getElementById("btn-stop-qr");
  if (btnStart) btnStart.style.display = "inline-block";
  if (btnStop)  btnStop.style.display  = "none";

  // Solo reset del status si no se capturó nada
  var firmaActual = document.getElementById("firma-valor");
  if (firmaActual && !firmaActual.value) {
    setQrStatus("waiting", "📷 Toca \"Iniciar Cámara\" para escanear el QR del docente");
  }
}

// ============================================================
// VALIDACIÓN NOMBRE
// ============================================================
function validarNombreEstricto(n) {
  var regex = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(\s[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,4}$/;
  return regex.test(n.trim());
}

// ============================================================
// ACCIÓN 1: REGISTRAR ASISTENCIA
// ============================================================
function registrarAsistencia(event) {
  event.preventDefault();

  var claveInput   = document.getElementById("reg-key").value.trim().toUpperCase();
  var docenteInput = document.getElementById("reg-teacher").value;
  var grupoInput   = document.getElementById("reg-group").value;
  var alertBox     = document.getElementById("alertRegistro");
  var btn          = document.getElementById("btnRegistrar");

  // Obtener firma: del campo oculto (QR) o del input manual
  var firmaInput = "";
  if (firmaTab === "qr") {
    firmaInput = document.getElementById("firma-valor").value.trim();
  } else {
    firmaInput = document.getElementById("reg-token").value.trim();
  }

  // ── Validaciones UX básicas ──
  if (!claveInput || claveInput.length < 4) {
    alertBox.textContent = "❌ Ingresa tu Clave Única de 4 caracteres.";
    alertBox.className = "alert-box error";
    alertBox.style.display = "block";
    return;
  }
  if (!firmaInput) {
    if (firmaTab === "qr") {
      alertBox.textContent = "❌ Escanea el QR del docente primero, o cambia a la pestaña \"Escribir\".";
    } else {
      alertBox.textContent = "❌ Ingresa la Firma del Docente.";
    }
    alertBox.className = "alert-box error";
    alertBox.style.display = "block";
    return;
  }

  // ── Validación de geolocalización ──
  var stored  = localStorage.getItem(GEO_STORAGE_KEY);
  var geoReq  = (stored === null) ? true : (stored === "1");

  if (geoReq && !geoRevisada) {
    alertBox.textContent = "⏳ Esperando verificación de ubicación. Espera un momento.";
    alertBox.className = "alert-box warning";
    alertBox.style.display = "block";
    return;
  }
  if (geoReq && !geoOK) {
    alertBox.textContent = "❌ Debes estar dentro del CENTED (máx 1 km) para registrar asistencia. Si estás en clase virtual, el docente puede desactivar la verificación.";
    alertBox.className = "alert-box error";
    alertBox.style.display = "block";
    return;
  }

  // ── Enviar al backend ──
  alertBox.style.display = "none";
  btn.disabled  = true;
  btn.innerHTML = "⚡ ENVIANDO REGISTRO...";

  var params = new URLSearchParams();
  params.append("action",  "asistencia");
  params.append("clave",   claveInput);
  params.append("docente", docenteInput);
  params.append("grupo",   grupoInput);
  params.append("firma",   firmaInput); // validada 100% en backend

  fetch(SCRIPT_URL, { method: "POST", body: params })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.result === "success") {
        alertBox.textContent   = "✓ ¡ASISTENCIA PROCESADA CON ÉXITO! Bienvenido/a, " + (data.nombre || "") + ".";
        alertBox.className     = "alert-box success";
        alertBox.style.display = "block";
        showToast("✓ ¡Asistencia registrada!", "success");
        document.getElementById("form-register").reset();
        document.getElementById("firma-valor").value = "";
        setQrStatus("waiting", "📷 Toca \"Iniciar Cámara\" para escanear el QR del docente");
        setTimeout(function() { salirDeRegistro(); }, 2500);
      } else if (data.result === "duplicated") {
        alertBox.textContent   = data.message || "⚠️ Ya registraste hoy.";
        alertBox.className     = "alert-box warning";
        alertBox.style.display = "block";
        showToast("⚠️ " + (data.message || "Ya registraste hoy."), "warning");
      } else {
        alertBox.textContent   = data.message || "❌ Ocurrió un error.";
        alertBox.className     = "alert-box error";
        alertBox.style.display = "block";
        showToast("❌ " + (data.message || "Error al procesar."), "warning");
      }
    })
    .catch(function() {
      alertBox.textContent   = "❌ ERROR DE RED. Verifica tu conexión e intenta de nuevo.";
      alertBox.className     = "alert-box error";
      alertBox.style.display = "block";
      showToast("❌ Error de red.", "warning");
    })
    .finally(function() {
      btn.disabled  = false;
      btn.innerHTML = "✓ Enviar Asistencia";
    });
}

// ============================================================
// ACCIÓN 2: GENERAR O RECUPERAR CLAVE
// ============================================================
function generarClave(event) {
  event.preventDefault();
  var nombreInput    = document.getElementById("gen-name").value.trim();
  var docenteInput   = document.getElementById("gen-teacher").value;
  var alertBox       = document.getElementById("alertGenerarClave");
  var btn            = document.getElementById("btnGenerar");
  var containerClave = document.getElementById("claveGeneradaContainer");

  if (!validarNombreEstricto(nombreInput)) {
    alertBox.textContent   = "❌ FORMATO ERRÓNEO. Usa Mayúscula Inicial en cada palabra (Ej: Carlos David Ramos).";
    alertBox.className     = "alert-box error";
    alertBox.style.display = "block";
    showToast("❌ Nombre inválido.", "warning");
    return;
  }

  btn.disabled              = true;
  btn.innerHTML             = "⚡ CONSULTANDO BASE DE DATOS...";
  containerClave.style.display = "none";
  alertBox.style.display    = "none";

  fetch(SCRIPT_URL + "?action=obtener_claves")
    .then(function(res) { return res.json(); })
    .then(function(data) {
      var alumno = Array.isArray(data)
        ? data.find(function(r) {
            return r.nombre && r.nombre.trim().toLowerCase() === nombreInput.toLowerCase();
          })
        : null;

      if (alumno && alumno.clave) {
        document.getElementById("codGenerado").textContent = alumno.clave;
        containerClave.style.display = "block";
        showToast("🔍 Clave recuperada.", "info");
        document.getElementById("form-keygen").reset();
        btn.disabled  = false;
        btn.innerHTML = "🔒 Generar Mi Clave Permanente";
      } else {
        crearNuevaClave(nombreInput, docenteInput, alertBox, btn, containerClave);
      }
    })
    .catch(function() {
      alertBox.textContent   = "❌ ERROR AL CONSULTAR EL SERVIDOR. Intenta nuevamente.";
      alertBox.className     = "alert-box error";
      alertBox.style.display = "block";
      btn.disabled  = false;
      btn.innerHTML = "🔒 Generar Mi Clave Permanente";
    });
}

function crearNuevaClave(nombreInput, docenteInput, alertBox, btn, containerClave) {
  btn.innerHTML = "⚡ CREANDO CREDENCIAL...";
  var claveNueva = "";
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (var i = 0; i < 4; i++) {
    claveNueva += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  var params = new URLSearchParams();
  params.append("action",  "guardar_clave");
  params.append("nombre",  nombreInput);
  params.append("clave",   claveNueva);
  params.append("docente", docenteInput);

  fetch(SCRIPT_URL, { method: "POST", body: params })
    .then(function(res) { return res.json(); })
    .then(function(dataPost) {
      if (dataPost.result === "success") {
        document.getElementById("codGenerado").textContent = claveNueva;
        containerClave.style.display = "block";
        showToast("🎉 ¡Clave permanente creada!", "success");
        document.getElementById("form-keygen").reset();
      } else {
        alertBox.textContent   = dataPost.message || "❌ No se pudo guardar.";
        alertBox.className     = "alert-box error";
        alertBox.style.display = "block";
        showToast("⚠️ " + (dataPost.message || "Error."), "warning");
      }
    })
    .catch(function() {
      alertBox.textContent   = "❌ NO SE PUDO GUARDAR. Verifica tu conexión.";
      alertBox.className     = "alert-box error";
      alertBox.style.display = "block";
    })
    .finally(function() {
      btn.disabled  = false;
      btn.innerHTML = "🔒 Generar Mi Clave Permanente";
    });
}

// ============================================================
// ACCIÓN 3: PANEL DOCENTE
// ============================================================
function unlockTeacherPanel(event) {
  if (event) event.preventDefault();

  var passwordInput    = document.getElementById("teacher-password");
  var authSection      = document.getElementById("teacher-auth");
  var dashboardSection = document.getElementById("teacher-dashboard");
  var alertBox         = document.getElementById("alertVerRegistros");
  var btnAcceder       = document.getElementById("btnAccederRegistros");

  alertBox.style.display = "none";
  btnAcceder.disabled    = true;
  btnAcceder.innerHTML   = "⚡ VERIFICANDO CREDENCIALES...";

  var firma = passwordInput.value.trim();

  fetch(SCRIPT_URL + "?action=validar_firma&firma=" + encodeURIComponent(firma))
    .then(function(res) { return res.json(); })
    .then(function(validacion) {
      if (!validacion.valido) {
        alertBox.textContent   = "❌ CREDENCIAL DE ACCESO DENEGADA.";
        alertBox.className     = "alert-box error";
        alertBox.style.display = "block";
        showToast("❌ Acceso incorrecto.", "warning");
        passwordInput.focus();
        btnAcceder.disabled  = false;
        btnAcceder.innerHTML = "🔓 Entrar";
        passwordInput.value  = "";
        return;
      }

      btnAcceder.innerHTML = "⚡ CARGANDO PANEL...";

      return fetch(SCRIPT_URL + "?action=obtener_registros")
        .then(function(res) { return res.json(); })
        .then(function(data) {
          authSection.style.display = "none";
          dashboardSection.classList.add("visible");
          showToast("🔓 Modo Administrador Activo", "success");

          // Sincronizar toggle con localStorage
          var stored = localStorage.getItem(GEO_STORAGE_KEY);
          var geoActualActiva = (stored === null) ? true : (stored === "1");
          var input = document.getElementById("geo-toggle-input");
          if (input) input.checked = geoActualActiva;
          actualizarDescGeo();

          // Tabla global
          var tablaCuerpo = document.getElementById("tabla-api-cuerpo");
          tablaCuerpo.innerHTML = "";
          if (!Array.isArray(data) || data.length === 0) {
            tablaCuerpo.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2rem; opacity:0.5;">No hay registros en el servidor.</td></tr>';
          } else {
            data.forEach(function(r) {
              var fila = document.createElement("tr");
              fila.style.borderBottom = "1px solid var(--text-color)";
              fila.innerHTML =
                '<td style="padding:0.6rem; border-right:1px solid var(--text-color); font-weight:700;">' + (r.nombre||"—") + "</td>" +
                '<td style="padding:0.6rem; border-right:1px solid var(--text-color); font-variant-numeric:tabular-nums;">' + (r.clave||"—") + "</td>" +
                '<td style="padding:0.6rem; border-right:1px solid var(--text-color);">' + (r.grupo||"—") + "</td>" +
                '<td style="padding:0.6rem; border-right:1px solid var(--text-color);">' + (r.docente||"—") + "</td>" +
                '<td style="padding:0.6rem; font-variant-numeric:tabular-nums; opacity:0.8;">' + (r.hora||"—") + "</td>";
              tablaCuerpo.appendChild(fila);
            });
          }

          // Filtrar hoy
          var ahora   = new Date(new Date().toLocaleString("en-US", { timeZone: "America/El_Salvador" }));
          var diaHoy  = String(ahora.getDate()).padStart(2,"0");
          var mesHoy  = String(ahora.getMonth()+1).padStart(2,"0");
          var anioHoy = ahora.getFullYear();
          var hoyStr  = diaHoy + "/" + mesHoy + "/" + anioHoy;

          var filtrados = (Array.isArray(data) ? data : []).filter(function(r) {
            if (!r.fecha) return false;
            var partes = r.fecha.replace(/-/g,"/").split("/");
            if (partes.length !== 3) return false;
            var norm = partes[0].padStart(2,"0") + "/" + partes[1].padStart(2,"0") + "/" + partes[2];
            return norm === hoyStr;
          });

          document.getElementById("count-morning").textContent   = filtrados.filter(function(r){ return r.grupo === "Mañana"; }).length;
          document.getElementById("count-afternoon").textContent = filtrados.filter(function(r){ return r.grupo === "Tarde";  }).length;

          var contenedor = document.getElementById("listaRegistros");
          contenedor.innerHTML = "";
          if (filtrados.length === 0) {
            contenedor.innerHTML = '<div class="registro-item" style="text-align:center; opacity:0.5;">No hay asistencias hoy.</div>';
          } else {
            filtrados.forEach(function(r) {
              var item = document.createElement("div");
              item.className = "registro-item";
              item.innerHTML = "<strong>" + r.nombre + "</strong> — " + r.grupo + "<br>" +
                '<small style="opacity:0.7;">Clave: ' + r.clave + " | Docente: " + r.docente + " | Hora: " + r.hora + "</small>";
              contenedor.appendChild(item);
            });
          }
        });
    })
    .catch(function() {
      alertBox.textContent   = "❌ ERROR AL VALIDAR CREDENCIALES. Intenta de nuevo.";
      alertBox.className     = "alert-box error";
      alertBox.style.display = "block";
    })
    .finally(function() {
      btnAcceder.disabled  = false;
      btnAcceder.innerHTML = "🔓 Entrar";
      passwordInput.value  = "";
    });
}

function lockAndReturn() {
  var dashboard = document.getElementById("teacher-dashboard");
  var auth      = document.getElementById("teacher-auth");
  if (dashboard) dashboard.classList.remove("visible");
  if (auth)      auth.style.display = "block";
  switchView("view-menu");
}

// ============================================================
// ACCIÓN 4: LIMPIAR Y ARCHIVAR
// ============================================================
function triggerClearAll() {
  if (!confirm("🚨 ¿Estás completamente seguro de que deseas limpiar y archivar todos los registros del día?"))
    return;
  showToast("⚡ Procesando solicitud...", "info");
  var params = new URLSearchParams();
  params.append("action", "limpiar_asistencias");
  fetch(SCRIPT_URL, { method: "POST", body: params })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.result === "success") {
        showToast("🗑 Registros archivados.", "success");
        alert("Registros guardados en Historial y limpiados correctamente.");
        lockAndReturn();
      } else {
        showToast("❌ " + (data.message || "Error al limpiar."), "warning");
      }
    })
    .catch(function() {
      showToast("❌ Error al reiniciar. Intenta de nuevo.", "warning");
    });
}
