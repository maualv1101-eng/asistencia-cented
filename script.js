// ============================================================
// FRONTEND — Sistema de Asistencia CENTED v3.2
// CAMBIO: Geolocalizacion global via Sheets (no localStorage)
// ============================================================

const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwou6vXy_kzM6aonLVCEWV_UrozTQ2OGzoGTtkOBV6b1Bd0ksiurgUjMoJiYA-ebIsQ/exec";

// -- COORDENADAS DEL CENTED ----------------------------------
const CENTED_LAT  = 13.716795758900204;
const CENTED_LNG  = -89.1001956388224;
const RADIO_KM    = 1.0; // 1 km de radio permitido

// -- ESTADO GLOBAL -------------------------------------------
var qrScanner      = null;   // instancia de Html5Qrcode
var qrActivo       = false;
var firmaTab       = "qr";   // "qr" | "manual"
var geoActiva      = true;   // controlado globalmente desde Sheets
var geoOK          = false;  // true cuando la ubicacion es valida
var geoRevisada    = false;  // true cuando ya se verifico (exito o fallo)

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
// NAVEGACION
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

// Salir de registro: detiene camara si estaba activa
function salirDeRegistro() {
  detenerQR();
  switchView("view-menu");
}

// ============================================================
// GEOLOCALIZACION GLOBAL -- lee estado desde Sheets
// ============================================================
function obtenerEstadoGeoGlobal() {
  return fetch(SCRIPT_URL + "?action=obtener_geo_estado")
    .then(function(res) { return res.json(); })
    .then(function(data) {
      geoActiva = data.geo_activa !== false;
      return geoActiva;
    })
    .catch(function() {
      // Si falla, asumir activado por defecto
      geoActiva = true;
      return true;
    });
}

function actualizarGeoUI(estado, texto) {
  var box  = document.getElementById("geo-status-box");
  var span = document.getElementById("geo-status-text");
  if (!box || !span) return;
  box.className  = "geo-status-box " + estado;
  span.textContent = texto;
  var iconos = { checking:"\ud83d\udccd", ok:"\u2705", fail:"\u274c", disabled:"\ud83d\udd13" };
  box.querySelector(".geo-dot").textContent = iconos[estado] || "\ud83d\udccd";
}

function verificarGeolocalizacion() {
  if (!geoActiva) {
    geoOK       = true;
    geoRevisada = true;
    actualizarGeoUI("disabled", "\ud83d\udd13 Validacion de ubicacion desactivada por el docente (clases virtuales)");
    return;
  }

  if (!navigator.geolocation) {
    geoOK       = false;
    geoRevisada = true;
    actualizarGeoUI("fail", "\u274c Tu dispositivo no soporta geolocalizacion");
    return;
  }

  actualizarGeoUI("checking", "\u23f3 Verificando tu ubicacion...");

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
        actualizarGeoUI("ok", "\u2705 Ubicacion confirmada -- estas en el CENTED (" + distM + " m)");
      } else {
        geoOK = false;
        actualizarGeoUI("fail", "\u274c Fuera del rango permitido -- estas a " + distM + " m del CENTED (max 1 km)");
      }
    },
    function(err) {
      geoRevisada = true;
      geoOK = false;
      var msgs = {
        1: "Permiso de ubicacion denegado. Activalo en ajustes del navegador.",
        2: "No se pudo obtener la ubicacion. Verifica tu GPS.",
        3: "Tiempo de espera agotado. Intenta de nuevo."
      };
      actualizarGeoUI("fail", "\u274c " + (msgs[err.code] || "Error de geolocalizacion"));
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

// -- Haversine: distancia en km entre dos puntos GPS --
function haversineKm(lat1, lng1, lat2, lng2) {
  var R = 6371;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
          Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Disparar verificacion cuando se navega a view-register
var _origSwitchView = switchView;
switchView = function(viewId) {
  _origSwitchView(viewId);
  if (viewId === "view-register") {
    geoOK       = false;
    geoRevisada = false;
    // Resetear QR y firma
    document.getElementById("firma-valor").value = "";
    setQrStatus("waiting", "\ud83d\udcf7 Toca 'Iniciar Camara' para escanear el QR del docente");
    // Primero obtener estado global de geo, luego verificar
    obtenerEstadoGeoGlobal().then(function() {
      verificarGeolocalizacion();
    });
  }
};

// ============================================================
// TOGGLE GEOLOCALIZACION (Panel Docente) -- guarda en Sheets
// ============================================================
function toggleGeolocalizacion() {
  var input = document.getElementById("geo-toggle-input");
  var activa = input.checked;

  var params = new URLSearchParams();
  params.append("action", "guardar_geo_estado");
  params.append("estado", activa ? "1" : "0");

  fetch(SCRIPT_URL, { method: "POST", body: params })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.result === "success") {
        geoActiva = activa;
        actualizarDescGeo();
        showToast(
          activa
            ? "\ud83d\udccd Validacion de ubicacion ACTIVADA globalmente"
            : "\ud83d\udd13 Validacion de ubicacion DESACTIVADA globalmente (clases virtuales)",
          activa ? "success" : "info"
        );
      } else {
        // Revertir toggle si fallo
        input.checked = !activa;
        showToast("\u274c Error al guardar estado. Intenta de nuevo.", "warning");
      }
    })
    .catch(function() {
      input.checked = !activa;
      showToast("\u274c Error de red al guardar estado.", "warning");
    });
}

function actualizarDescGeo() {
  var desc = document.getElementById("geo-toggle-desc");
  if (!desc) return;
  desc.textContent = geoActiva
    ? "Activada -- los alumnos deben estar dentro de 1 km"
    : "Desactivada -- valido para clases virtuales";
}

// ============================================================
// QR SCANNER -- html5-qrcode
// ============================================================
function setFirmaTab(tab) {
  firmaTab = tab;
  document.getElementById("tab-qr").classList.toggle("active",    tab === "qr");
  document.getElementById("tab-manual").classList.toggle("active", tab === "manual");
  document.getElementById("firma-panel-qr").style.display     = tab === "qr"     ? "block" : "none";
  document.getElementById("firma-panel-manual").style.display = tab === "manual" ? "block" : "none";

  if (tab === "manual") {
    detenerQR(); // libera camara al cambiar a manual
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

  // Verificar que html5-qrcode este cargado
  if (typeof Html5Qrcode === "undefined") {
    setQrStatus("error", "\u274c Libreria QR no disponible. Recarga la pagina.");
    return;
  }

  document.getElementById("btn-start-qr").style.display = "none";
  document.getElementById("btn-stop-qr").style.display  = "inline-block";
  setQrStatus("scanning", "\ud83d\udd0d Camara activa -- apunta al QR del docente...");

  qrScanner = new Html5Qrcode("qr-reader");
  var config = {
    fps: 10,
    qrbox: { width: 250, height: 250 },
    aspectRatio: 1.0,
    disableFlip: false
  };

  qrScanner.start(
    { facingMode: "environment" }, // camara trasera
    config,
    function(decodedText) {
      // QR leido exitosamente
      var firma = decodedText.trim();

      // Validar que parezca una clave de 6 digitos
      if(/^\d{6}$/.test(firma)) {
        document.getElementById("firma-valor").value = firma;
        setQrStatus("found", "\u2705 QR leido -- Firma: " + firma.slice(0,3) + "***");
        showToast("\u2705 Firma capturada del QR. Puedes enviar.", "success");
        detenerQR(); // liberar camara al detectar
      } else {
        setQrStatus("error", "\u274c QR no reconocido. Asegurate de escanear el QR del docente.");
      }
    },
    function() {
      // Frame sin QR -- normal, no hacer nada
    }
  ).then(function() {
    qrActivo = true;
  }).catch(function(err) {
    qrActivo = false;
    document.getElementById("btn-start-qr").style.display  = "inline-block";
    document.getElementById("btn-stop-qr").style.display   = "none";
    if (err.toString().includes("Permission")) {
      setQrStatus("error", "\u274c Permiso de camara denegado. Activalo en los ajustes del navegador.");
    } else {
      setQrStatus("error", "\u274c Error al iniciar camara: " + err.toString().slice(0,60));
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

  // Solo reset del status si no se capturo nada
  var firmaActual = document.getElementById("firma-valor");
  if (firmaActual && !firmaActual.value) {
    setQrStatus("waiting", "\ud83d\udcf7 Toca 'Iniciar Camara' para escanear el QR del docente");
  }
}

// ============================================================
// VALIDACION NOMBRE
// ============================================================
function validarNombreEstricto(n) {
  var regex = /^[A-Z\u00c1\u00c9\u00cd\u00d3\u00da\u00d1][a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1]+(\s[A-Z\u00c1\u00c9\u00cd\u00d3\u00da\u00d1][a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1]+){1,4}$/;
  return regex.test(n.trim());
}

// ============================================================
// ACCION 1: REGISTRAR ASISTENCIA
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

  // -- Validaciones UX basicas --
  if (!claveInput || claveInput.length < 4) {
    alertBox.textContent = "\u274c Ingresa tu Clave Unica de 4 caracteres.";
    alertBox.className = "alert-box error";
    alertBox.style.display = "block";
    return;
  }
  if (!firmaInput) {
    if (firmaTab === "qr") {
      alertBox.textContent = "\u274c Escanea el QR del docente primero, o cambia a la pestana 'Escribir'.";
    } else {
      alertBox.textContent = "\u274c Ingresa la Firma del Docente.";
    }
    alertBox.className = "alert-box error";
    alertBox.style.display = "block";
    return;
  }

  // -- Validacion de geolocalizacion --
  if (geoActiva && !geoRevisada) {
    alertBox.textContent = "\u23f3 Esperando verificacion de ubicacion. Espera un momento.";
    alertBox.className = "alert-box warning";
    alertBox.style.display = "block";
    return;
  }
  if (geoActiva && !geoOK) {
    alertBox.textContent = "\u274c Debes estar dentro del CENTED (max 1 km) para registrar asistencia. Si estas en clase virtual, el docente puede desactivar la verificacion.";
    alertBox.className = "alert-box error";
    alertBox.style.display = "block";
    return;
  }

  // -- Enviar al backend --
  alertBox.style.display = "none";
  btn.disabled  = true;
  btn.innerHTML = "\u26a1 ENVIANDO REGISTRO...";

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
        alertBox.textContent   = "\u2713 Asistencia PROCESADA CON EXITO! Bienvenido/a, " + (data.nombre || "") + ".";
        alertBox.className     = "alert-box success";
        alertBox.style.display = "block";
        showToast("\u2713 Asistencia registrada!", "success");
        document.getElementById("form-register").reset();
        document.getElementById("firma-valor").value = "";
        setQrStatus("waiting", "\ud83d\udcf7 Toca 'Iniciar Camara' para escanear el QR del docente");
        setTimeout(function() { salirDeRegistro(); }, 2500);
      } else if (data.result === "duplicated") {
        alertBox.textContent   = data.message || "\u26a0 Ya registraste hoy.";
        alertBox.className     = "alert-box warning";
        alertBox.style.display = "block";
        showToast("\u26a0 " + (data.message || "Ya registraste hoy."), "warning");
      } else {
        alertBox.textContent   = data.message || "\u274c Ocurrio un error.";
        alertBox.className     = "alert-box error";
        alertBox.style.display = "block";
        showToast("\u274c " + (data.message || "Error al procesar."), "warning");
      }
    })
    .catch(function() {
      alertBox.textContent   = "\u274c ERROR DE RED. Verifica tu conexion e intenta de nuevo.";
      alertBox.className     = "alert-box error";
      alertBox.style.display = "block";
      showToast("\u274c Error de red.", "warning");
    })
    .finally(function() {
      btn.disabled  = false;
      btn.innerHTML = "\u2713 Enviar Asistencia";
    });
}

// ============================================================
// ACCION 2: GENERAR O RECUPERAR CLAVE
// ============================================================
function generarClave(event) {
  event.preventDefault();
  var nombreInput    = document.getElementById("gen-name").value.trim();
  var docenteInput   = document.getElementById("gen-teacher").value;
  var alertBox       = document.getElementById("alertGenerarClave");
  var btn            = document.getElementById("btnGenerar");
  var containerClave = document.getElementById("claveGeneradaContainer");

  if (!validarNombreEstricto(nombreInput)) {
    alertBox.textContent   = "\u274c FORMATO ERRONEO. Usa Mayuscula Inicial en cada palabra (Ej: Carlos David Ramos).";
    alertBox.className     = "alert-box error";
    alertBox.style.display = "block";
    showToast("\u274c Nombre invalido.", "warning");
    return;
  }

  btn.disabled              = true;
  btn.innerHTML             = "\u26a1 CONSULTANDO BASE DE DATOS...";
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
        showToast("\ud83d\udd0d Clave recuperada.", "info");
        document.getElementById("form-keygen").reset();
        btn.disabled  = false;
        btn.innerHTML = "\ud83d\udd12 Generar Mi Clave Permanente";
      } else {
        crearNuevaClave(nombreInput, docenteInput, alertBox, btn, containerClave);
      }
    })
    .catch(function() {
      alertBox.textContent   = "\u274c ERROR AL CONSULTAR EL SERVIDOR. Intenta nuevamente.";
      alertBox.className     = "alert-box error";
      alertBox.style.display = "block";
      btn.disabled  = false;
      btn.innerHTML = "\ud83d\udd12 Generar Mi Clave Permanente";
    });
}

function crearNuevaClave(nombreInput, docenteInput, alertBox, btn, containerClave) {
  btn.innerHTML = "\u26a1 CREANDO CREDENCIAL...";
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
        showToast("\ud83c\udf89 Clave permanente creada!", "success");
        document.getElementById("form-keygen").reset();
      } else {
        alertBox.textContent   = dataPost.message || "\u274c No se pudo guardar.";
        alertBox.className     = "alert-box error";
        alertBox.style.display = "block";
        showToast("\u26a0 " + (dataPost.message || "Error."), "warning");
      }
    })
    .catch(function() {
      alertBox.textContent   = "\u274c NO SE PUDO GUARDAR. Verifica tu conexion.";
      alertBox.className     = "alert-box error";
      alertBox.style.display = "block";
    })
    .finally(function() {
      btn.disabled  = false;
      btn.innerHTML = "\ud83d\udd12 Generar Mi Clave Permanente";
    });
}

// ============================================================
// ACCION 3: PANEL DOCENTE
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
  btnAcceder.innerHTML   = "\u26a1 VERIFICANDO CREDENCIALES...";

  var firma = passwordInput.value.trim();

  fetch(SCRIPT_URL + "?action=validar_firma&firma=" + encodeURIComponent(firma))
    .then(function(res) { return res.json(); })
    .then(function(validacion) {
      if (!validacion.valido) {
        alertBox.textContent   = "\u274c CREDENCIAL DE ACCESO DENEGADA.";
        alertBox.className     = "alert-box error";
        alertBox.style.display = "block";
        showToast("\u274c Acceso incorrecto.", "warning");
        passwordInput.focus();
        btnAcceder.disabled  = false;
        btnAcceder.innerHTML = "\ud83d\udd13 Entrar";
        passwordInput.value  = "";
        return;
      }

      btnAcceder.innerHTML = "\u26a1 CARGANDO PANEL...";

      return fetch(SCRIPT_URL + "?action=obtener_registros")
        .then(function(res) { return res.json(); })
        .then(function(data) {
          authSection.style.display = "none";
          dashboardSection.classList.add("visible");
          showToast("\ud83d\udd13 Modo Administrador Activo", "success");

          // Sincronizar toggle con estado global desde Sheets
          obtenerEstadoGeoGlobal().then(function(activa) {
            var input = document.getElementById("geo-toggle-input");
            if (input) input.checked = activa;
            actualizarDescGeo();
          });

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
                '<td style="padding:0.6rem; border-right:1px solid var(--text-color); font-weight:700;">' + (r.nombre||"\u2014") + "</td>" +
                '<td style="padding:0.6rem; border-right:1px solid var(--text-color); font-variant-numeric:tabular-nums;">' + (r.clave||"\u2014") + "</td>" +
                '<td style="padding:0.6rem; border-right:1px solid var(--text-color);">' + (r.grupo||"\u2014") + "</td>" +
                '<td style="padding:0.6rem; border-right:1px solid var(--text-color);">' + (r.docente||"\u2014") + "</td>" +
                '<td style="padding:0.6rem; font-variant-numeric:tabular-nums; opacity:0.8;">' + (r.hora||"\u2014") + "</td>";
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

          document.getElementById("count-morning").textContent   = filtrados.filter(function(r){ return r.grupo === "Ma\u00f1ana"; }).length;
          document.getElementById("count-afternoon").textContent = filtrados.filter(function(r){ return r.grupo === "Tarde";  }).length;

          var contenedor = document.getElementById("listaRegistros");
          contenedor.innerHTML = "";
          if (filtrados.length === 0) {
            contenedor.innerHTML = '<div class="registro-item" style="text-align:center; opacity:0.5;">No hay asistencias hoy.</div>';
          } else {
            filtrados.forEach(function(r) {
              var item = document.createElement("div");
              item.className = "registro-item";
              item.innerHTML = "<strong>" + r.nombre + "</strong> \u2014 " + r.grupo + "<br>" +
                '<small style="opacity:0.7;">Clave: ' + r.clave + " | Docente: " + r.docente + " | Hora: " + r.hora + "</small>";
              contenedor.appendChild(item);
            });
          }
        });
    })
    .catch(function() {
      alertBox.textContent   = "\u274c ERROR AL VALIDAR CREDENCIALES. Intenta de nuevo.";
      alertBox.className     = "alert-box error";
      alertBox.style.display = "block";
    })
    .finally(function() {
      btnAcceder.disabled  = false;
      btnAcceder.innerHTML = "\ud83d\udd13 Entrar";
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
// ACCION 4: LIMPIAR Y ARCHIVAR
// ============================================================
function triggerClearAll() {
  if (!confirm("\ud83d\udea8 Estas completamente seguro de que deseas limpiar y archivar todos los registros del dia?"))
    return;
  showToast("\u26a1 Procesando solicitud...", "info");
  var params = new URLSearchParams();
  params.append("action", "limpiar_asistencias");
  fetch(SCRIPT_URL, { method: "POST", body: params })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.result === "success") {
        showToast("\ud83d\uddd1 Registros archivados.", "success");
        alert("Registros guardados en Historial y limpiados correctamente.");
        lockAndReturn();
      } else {
        showToast("\u274c " + (data.message || "Error al limpiar."), "warning");
      }
    })
    .catch(function() {
      showToast("\u274c Error al reiniciar. Intenta de nuevo.", "warning");
    });
}
