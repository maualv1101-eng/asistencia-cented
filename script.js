

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyGnZyl2ruTyTz4knBZi9ydpDxN1ZipBN1jHBUzW2vs8sPqGgNSe2iPyTdn38eQ2B9z/exec";

const CENTED_LAT = 13.716795758900204;
const CENTED_LNG = -89.1001956388224;
const RADIO_KM   = 1.0;

// ── Estado global ─────────────────────────
var qrScanner    = null;
var qrActivo     = false;
var firmaTab     = "qr";
var geoActiva    = true;
var geoOK        = false;
var geoRevisada  = false;
var tokenSesion  = null;
var panelAutoRefreshInterval = null;
var intentosFallidos = 0;
var bloqueoHasta     = 0;
var geoCoords        = null;

const MAX_INTENTOS   = 5;
const TIEMPO_BLOQUEO = 300000; // 5 min
const AVISO_SESSION_KEY = "cented_aviso_visto_v8";
const THEME_STORAGE_KEY = "cented_theme";

// ── Crypto ────────────────────────────────
async function sha256Hex(str) {
  var enc = new TextEncoder().encode(str);
  var buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map(function(b) { return b.toString(16).padStart(2, "0"); }).join("");
}

async function hmacSha256Hex(key, message) {
  var enc = new TextEncoder();
  var ck  = await crypto.subtle.importKey(
    "raw", enc.encode(key),
    { name:"HMAC", hash:"SHA-256" }, false, ["sign"]
  );
  var sig = await crypto.subtle.sign("HMAC", ck, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map(function(b) { return b.toString(16).padStart(2, "0"); }).join("");
}

function generarNonce() {
  var arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(function(b) { return b.toString(16).padStart(2,"0"); }).join("");
}

function clavePublicaHoy() {
  var ahora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/El_Salvador" }));
  return ahora.getFullYear() + "-" +
    String(ahora.getMonth() + 1).padStart(2, "0") + "-" +
    String(ahora.getDate()).padStart(2, "0");
}

async function firmarPayload(action, fields, key) {
  var nonce = generarNonce();
  var ts    = String(Math.floor(Date.now() / 1000));
  var clave = key || clavePublicaHoy();

  // Incluir TODOS los campos en la firma, incluso vacíos, para que
  // coincida con lo que verifica verificarHmac_ en el backend.
  var camposOrdenados = Object.keys(fields).sort().map(function(k) {
    var v = fields[k];
    return k + "=" + (v !== undefined && v !== null ? v : "");
  }).join("|");
  var mensaje = action + "|" + nonce + "|" + ts + "|" + camposOrdenados;
  var hmac = await hmacSha256Hex(clave, mensaje);

  var params = new URLSearchParams();
  params.append("action", action);
  Object.keys(fields).forEach(function(k) {
    // Enviamos SIEMPRE todos los campos (incluso vacíos) para que el
    // backend pueda reconstruir la firma correctamente.
    params.append(k, fields[k] !== undefined && fields[k] !== null ? fields[k] : "");
  });
  params.append("_nonce", nonce);
  params.append("_ts",    ts);
  params.append("_hmac",  hmac);
  return params;
}

// ── Sanitización ──────────────────────────
function sanitizarInput(str) {
  if (typeof str !== "string") return "";
  var s = str.trim().slice(0, 300)
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/^[=+\-@\t\r]+/, "");
  return s;
}

function esUrlHttpsSegura(url) {
  if (!url) return false;
  try { return new URL(url).protocol === "https:"; } catch(e) { return false; }
}

function convertirYoutubeAEmbed(url) {
  if (!esUrlHttpsSegura(url)) return "";
  try {
    var u = new URL(url);
    var id = "";
    if (u.hostname === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    else if (u.hostname === "www.youtube.com" || u.hostname === "youtube.com" || u.hostname === "m.youtube.com") {
      if (u.pathname === "/watch") id = u.searchParams.get("v") || "";
      else if (u.pathname.indexOf("/embed/") === 0 || u.pathname.indexOf("/shorts/") === 0)
        id = u.pathname.split("/")[2] || "";
    }
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return "";
    return "https://www.youtube.com/embed/" + id + "?autoplay=1&mute=1&playsinline=1&rel=0";
  } catch(e) { return ""; }
}

// ── Feedback ──────────────────────────────
function vibrar(tipo) {
  if (!("vibrate" in navigator)) return;
  try {
    if (tipo === "exito") navigator.vibrate(50);
    else if (tipo === "error") navigator.vibrate([80,60,80,60,80]);
    else if (tipo === "aviso") navigator.vibrate([40,40,40]);
  } catch(e) {}
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
    toast.style.animation = "toastOut .4s cubic-bezier(.19,1,.22,1) forwards";
    toast.addEventListener("animationend", function() { toast.remove(); });
  }, 4000);
}

// ── Reloj ─────────────────────────────────
function updateClock() {
  var el = document.getElementById("live-clock");
  if (!el) return;
  var now = new Date();
  var h = now.getHours(); var m = String(now.getMinutes()).padStart(2,"0"); var s = String(now.getSeconds()).padStart(2,"0");
  var ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  el.textContent = String(h).padStart(2,"0") + ":" + m + ":" + s + " " + ampm;
}
setInterval(updateClock, 1000);
updateClock();

// ── Navegación entre vistas ───────────────
function switchView(viewId) {
  var current = document.querySelector(".card-view.active");
  var target  = document.getElementById(viewId);
  if (!target || current === target) return;
  // Limpiar solo alertas de la vista actual
  if (current) {
    current.querySelectorAll(".alert-box").forEach(function(el) {
      el.className = "alert-box"; el.style.display = "none";
    });
    current.classList.remove("active");
  }
  target.classList.add("active");
  // Al entrar a registro, reiniciar geo
  if (viewId === "view-register") {
    geoOK = false; geoRevisada = false;
    document.getElementById("firma-valor").value = "";
    setQrStatus("waiting", "📷 Toca 'Iniciar Cámara' para escanear el QR del docente");
    obtenerEstadoGeoGlobal().then(function() { verificarGeolocalizacion(); });
  }
}

function salirDeRegistro() { detenerQR(); switchView("view-menu"); }
function irAlInicioDePagina() { window.scrollTo({ top:0, left:0, behavior:"smooth" }); }

// ── Geo ───────────────────────────────────
function obtenerEstadoGeoGlobal() {
  return fetch(SCRIPT_URL + "?action=obtener_geo_estado")
    .then(function(res) { return res.json(); })
    .then(function(data) { geoActiva = data.geo_activa !== false; return geoActiva; })
    .catch(function() { geoActiva = true; return true; });
}

function actualizarGeoUI(estado, texto) {
  var box  = document.getElementById("geo-status-box");
  var span = document.getElementById("geo-status-text");
  if (!box || !span) return;
  box.className = "geo-status-box " + estado;
  span.textContent = texto;
  var iconos = { checking:"📍", ok:"✅", fail:"❌", disabled:"🔓" };
  box.querySelector(".geo-dot").textContent = iconos[estado] || "📍";
}

function verificarGeolocalizacion() {
  if (!geoActiva) {
    geoOK = true; geoRevisada = true;
    actualizarGeoUI("disabled", "🔓 Validación de ubicación desactivada por el docente"); return;
  }
  if (!navigator.geolocation) {
    geoOK = false; geoRevisada = true;
    actualizarGeoUI("fail", "❌ Tu dispositivo no soporta geolocalización"); return;
  }
  actualizarGeoUI("checking", "⏳ Verificando tu ubicación...");
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      var dist  = haversineKm(pos.coords.latitude, pos.coords.longitude, CENTED_LAT, CENTED_LNG);
      var distM = Math.round(dist * 1000);
      geoRevisada = true; geoCoords = { lat:pos.coords.latitude, lng:pos.coords.longitude };
      if (dist <= RADIO_KM) {
        geoOK = true; actualizarGeoUI("ok", "✅ Ubicación confirmada — estás en el CENTED (" + distM + " m)");
      } else {
        geoOK = false; actualizarGeoUI("fail", "❌ Fuera del rango — estás a " + distM + " m del CENTED (máx 1 km)");
      }
    },
    function(err) {
      geoRevisada = true; geoOK = false;
      var msgs = { 1:"Permiso de ubicación denegado.", 2:"No se pudo obtener la ubicación. Verifica tu GPS.", 3:"Tiempo agotado. Intenta de nuevo." };
      actualizarGeoUI("fail", "❌ " + (msgs[err.code] || "Error de geolocalización"));
    },
    { enableHighAccuracy:true, timeout:10000, maximumAge:0 }
  );
}

function haversineKm(lat1, lng1, lat2, lng2) {
  var R = 6371; var dLat=(lat2-lat1)*Math.PI/180; var dLng=(lng2-lng1)*Math.PI/180;
  var a = Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

// ── QR ────────────────────────────────────
function setFirmaTab(tab) {
  firmaTab = tab;
  document.getElementById("tab-qr").classList.toggle("active", tab==="qr");
  document.getElementById("tab-manual").classList.toggle("active", tab==="manual");
  document.getElementById("firma-panel-qr").style.display   = tab==="qr"     ? "block" : "none";
  document.getElementById("firma-panel-manual").style.display = tab==="manual" ? "block" : "none";
  if (tab === "manual") detenerQR();
}

function setQrStatus(clase, texto) {
  var el = document.getElementById("qr-status");
  if (!el) return; el.className = "qr-status " + clase; el.textContent = texto;
}

function iniciarQR() {
  if (qrActivo) return;
  if (typeof Html5Qrcode === "undefined") { setQrStatus("error","❌ Librería QR no disponible. Recarga."); return; }
  document.getElementById("btn-start-qr").style.display = "none";
  document.getElementById("btn-stop-qr").style.display  = "inline-block";
  setQrStatus("scanning", "🔍 Cámara activa — apunta al QR del docente...");
  qrScanner = new Html5Qrcode("qr-reader");
  qrScanner.start(
    { facingMode:"environment" },
    { fps:10, qrbox:{width:250,height:250}, aspectRatio:1.0 },
    function(txt) {
      var firma = txt.trim();
      if (/^\d{6}$/.test(firma)) {
        document.getElementById("firma-valor").value = firma;
        setQrStatus("found", "✅ QR leído — Firma: " + firma.slice(0,3) + "***");
        showToast("✅ Firma capturada. Puedes enviar.", "success");
        detenerQR();
      } else {
        setQrStatus("error","❌ QR no reconocido. Escanea el QR del docente.");
      }
    }, function() {}
  ).then(function() { qrActivo = true; })
  .catch(function(err) {
    qrActivo = false;
    document.getElementById("btn-start-qr").style.display = "inline-block";
    document.getElementById("btn-stop-qr").style.display  = "none";
    if (err.toString().includes("Permission")) setQrStatus("error","❌ Permiso de cámara denegado.");
    else setQrStatus("error","❌ Error al iniciar cámara.");
  });
}

function detenerQR() {
  if (qrScanner && qrActivo) {
    qrScanner.stop().catch(function(){}).finally(function(){ qrScanner=null; qrActivo=false; });
  } else { qrScanner=null; qrActivo=false; }
  var s = document.getElementById("btn-start-qr"); if(s) s.style.display="inline-block";
  var p = document.getElementById("btn-stop-qr");  if(p) p.style.display="none";
  var fv = document.getElementById("firma-valor");
  if (fv && !fv.value) setQrStatus("waiting","📷 Toca 'Iniciar Cámara' para escanear el QR del docente");
}

// ── Validaciones ──────────────────────────
function normalizarNombre(n) {
  return n.trim().toLowerCase().replace(/\b\w/g, function(l){ return l.toUpperCase(); });
}
function validarNombre(n) {
  var norm = normalizarNombre(n);
  var palabras = norm.split(/\s+/).filter(Boolean);
  return palabras.length >= 2 && palabras.length <= 5 && /^[A-Za-zÁÉÍÓÚÑáéíóúñ\s]+$/.test(norm);
}
function limpiarTelefono(t) { return (t||"").replace(/[^\d]/g,""); }
function validarTelefono(t) { return /^[267]\d{7}$/.test(limpiarTelefono(t)); }
function validarCorreo(c)   { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((c||"").trim()); }
function validarCumpleanos(f) { return /^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])$/.test((f||"").trim()); }

function formatearCumpleanosInput(ev) {
  var input = ev.target;
  var dig = input.value.replace(/\D/g,"").slice(0,4);
  input.value = dig.length > 2 ? dig.slice(0,2)+"/"+dig.slice(2) : dig;
}

// ── REGISTRAR ASISTENCIA ──────────────────
function registrarAsistencia(event) {
  event.preventDefault();
  var hp = (document.getElementById("reg-website")||{}).value||"";
  var alertBox = document.getElementById("alertRegistro");
  var btn      = document.getElementById("btnRegistrar");

  if (hp.trim() !== "") {
    alertBox.textContent="❌ No se pudo procesar tu solicitud."; alertBox.className="alert-box error"; alertBox.style.display="block"; return;
  }

  var claveInput   = sanitizarInput(document.getElementById("reg-key").value).toUpperCase();
  var docenteInput = sanitizarInput(document.getElementById("reg-teacher").value);
  var grupoInput   = sanitizarInput(document.getElementById("reg-group").value);
  var firmaInput   = firmaTab==="qr"
    ? sanitizarInput(document.getElementById("firma-valor").value)
    : sanitizarInput(document.getElementById("reg-token").value);

  if (!claveInput || claveInput.length !== 4) {
    alertBox.textContent="❌ Ingresa tu Clave Única de 4 caracteres."; alertBox.className="alert-box error"; alertBox.style.display="block"; irAlInicioDePagina(); return;
  }
  if (!firmaInput) {
    alertBox.textContent=firmaTab==="qr"?"❌ Escanea el QR del docente primero.":"❌ Ingresa la Firma del Docente.";
    alertBox.className="alert-box error"; alertBox.style.display="block"; irAlInicioDePagina(); return;
  }
  if (geoActiva && !geoRevisada) {
    alertBox.textContent="⏳ Esperando verificación de ubicación."; alertBox.className="alert-box warning"; alertBox.style.display="block"; irAlInicioDePagina(); return;
  }
  if (geoActiva && !geoOK) {
    alertBox.textContent="❌ Debes estar dentro del CENTED (máx 1 km). El docente puede desactivar la verificación para clases virtuales.";
    alertBox.className="alert-box error"; alertBox.style.display="block"; irAlInicioDePagina(); return;
  }

  alertBox.style.display="none"; btn.disabled=true; btn.innerHTML="⚡ ENVIANDO REGISTRO...";

  var fields = { clave:claveInput, docente:docenteInput, grupo:grupoInput, firma:firmaInput, hp:hp };
  if (geoActiva && geoCoords) { fields.lat=geoCoords.lat; fields.lng=geoCoords.lng; }

  firmarPayload("asistencia", fields, null)
    .then(function(params) { return fetch(SCRIPT_URL,{method:"POST",body:params}); })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.result === "success") {
        vibrar("exito");
        alertBox.textContent="✓ ¡ASISTENCIA REGISTRADA! Bienvenido/a, " + (data.nombre||"") + ".";
        alertBox.className="alert-box success"; alertBox.style.display="block"; irAlInicioDePagina();
        showToast("✓ Asistencia registrada.", "success");
        document.getElementById("form-register").reset();
        document.getElementById("firma-valor").value="";
        setQrStatus("waiting","📷 Toca 'Iniciar Cámara' para escanear el QR del docente");
        setTimeout(function(){ salirDeRegistro(); }, 2500);
      } else if (data.result === "duplicated") {
        vibrar("aviso");
        alertBox.textContent=data.message||"⚠️ Ya registraste hoy."; alertBox.className="alert-box warning"; alertBox.style.display="block"; irAlInicioDePagina();
        showToast("⚠️ "+(data.message||"Ya registraste hoy."),"warning");
      } else {
        vibrar("error");
        alertBox.textContent=data.message||"❌ Error inesperado."; alertBox.className="alert-box error"; alertBox.style.display="block"; irAlInicioDePagina();
        showToast("❌ "+(data.message||"Fallo al procesar."),"warning");
      }
    })
    .catch(function() {
      vibrar("error");
      alertBox.textContent="❌ ERROR DE RED. Verifica tu internet e intenta de nuevo."; alertBox.className="alert-box error"; alertBox.style.display="block"; irAlInicioDePagina();
      showToast("❌ Error de red.","warning");
    })
    .finally(function() { btn.disabled=false; btn.innerHTML="✓ Enviar Asistencia"; });
}

// ── GENERAR CLAVE ─────────────────────────
// FIX PRINCIPAL: todos los campos opcionales se leen con null-check.
// Solo nombre + docente son estrictamente obligatorios.
function generarClave(event) {
  event.preventDefault();

  var hp           = (document.getElementById("gen-website")||{}).value||"";
  var nombreInput  = (document.getElementById("gen-name")||{}).value||"";
  var docenteInput = (document.getElementById("gen-teacher")||{}).value||"";
  var telefonoInput= (document.getElementById("gen-phone")||{}).value||"";
  var correoInput  = (document.getElementById("gen-email")||{}).value||"";
  // gen-birthday puede no existir en el DOM (compatibilidad) → fallback ""
  var cumpleInput  = ((document.getElementById("gen-birthday")||{}).value||"").trim();
  // gen-override igual
  var codigoInput  = ((document.getElementById("gen-override")||{}).value||"").trim();

  var alertBox      = document.getElementById("alertGenerarClave");
  var btn           = document.getElementById("btnGenerar");
  var containerClave= document.getElementById("claveGeneradaContainer");

  if (hp.trim() !== "") {
    alertBox.textContent="❌ No se pudo procesar."; alertBox.className="alert-box error"; alertBox.style.display="block"; return;
  }

  // ── Validaciones obligatorias ──
  if (!validarNombre(nombreInput)) {
    alertBox.textContent="❌ Escribe tu nombre completo (nombre y al menos un apellido).";
    alertBox.className="alert-box error"; alertBox.style.display="block";
    showToast("❌ Nombre inválido.","warning"); return;
  }
  docenteInput = sanitizarInput(docenteInput);
  if (!docenteInput) {
    alertBox.textContent="❌ Selecciona tu docente principal.";
    alertBox.className="alert-box error"; alertBox.style.display="block";
    showToast("❌ Docente requerido.","warning"); return;
  }

  // ── Validaciones opcionales (solo si el usuario las llenó) ──
  var telefono = limpiarTelefono(telefonoInput);
  var correo   = correoInput.trim().toLowerCase();

  // Teléfono: si se ingresó algo, debe ser válido (a menos que haya código de excepción)
  if (telefono && !codigoInput && !validarTelefono(telefonoInput)) {
    alertBox.textContent="❌ El teléfono ingresado no es válido (8 dígitos, empieza con 2, 6 o 7).";
    alertBox.className="alert-box error"; alertBox.style.display="block";
    showToast("❌ Teléfono inválido.","warning"); return;
  }
  // Correo: si se ingresó algo, debe ser válido
  if (correo && !codigoInput && !validarCorreo(correoInput)) {
    alertBox.textContent="❌ El correo ingresado no es válido.";
    alertBox.className="alert-box error"; alertBox.style.display="block";
    showToast("❌ Correo inválido.","warning"); return;
  }
  // Cumpleaños: si se ingresó algo, debe tener formato DD/MM
  if (cumpleInput && !validarCumpleanos(cumpleInput)) {
    alertBox.textContent="❌ Formato de cumpleaños inválido. Usa DD/MM (Ej: 15/08).";
    alertBox.className="alert-box error"; alertBox.style.display="block";
    showToast("❌ Cumpleaños inválido.","warning"); return;
  }

  var nombre = normalizarNombre(nombreInput);
  btn.disabled=true; btn.innerHTML="⚡ CONSULTANDO BASE DE DATOS...";
  containerClave.style.display="none"; alertBox.style.display="none";

  firmarPayload("buscar_alumno", { nombre:nombre }, null)
    .then(function(params) {
      return fetch(SCRIPT_URL, {method:"POST", body:params});
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.clave) {
        // Alumno ya existe → mostrar su clave
        document.getElementById("codGenerado").textContent = data.clave;
        containerClave.style.display="block";
        showToast("🔍 Clave recuperada con éxito.","info");
        document.getElementById("form-keygen").reset();
        btn.disabled=false; btn.innerHTML="🔒 Generar Mi Clave Permanente";
      } else {
        // Nuevo alumno → crear clave
        crearNuevaClave(nombre, docenteInput, telefono||"", correo||"", cumpleInput||"", codigoInput, hp, alertBox, btn, containerClave);
      }
    })
    .catch(function() {
      alertBox.textContent="❌ ERROR AL CONSULTAR EL SERVIDOR. Intenta nuevamente.";
      alertBox.className="alert-box error"; alertBox.style.display="block";
      btn.disabled=false; btn.innerHTML="🔒 Generar Mi Clave Permanente";
    });
}

function crearNuevaClave(nombre, docente, telefono, correo, cumple, codigo, hp, alertBox, btn, containerClave) {
  btn.innerHTML="⚡ CREANDO CREDENCIAL...";
  var chars="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  var claveNueva="";
  var aleatorio = new Uint32Array(4);
  crypto.getRandomValues(aleatorio);
  for (var i=0;i<4;i++) claveNueva+=chars.charAt(aleatorio[i] % chars.length);

  // Todos los campos se incluyen en la firma (con valor vacío si no se proporcionaron)
  // para que el backend pueda reconstruir el HMAC correctamente.
  var fields = {
    nombre:   nombre,
    clave:    claveNueva,
    docente:  sanitizarInput(docente),
    telefono: telefono,
    correo:   correo,
    cumple:   cumple,
    codigo:   codigo,
    hp:       hp||""
  };

  firmarPayload("guardar_clave", fields, null)
    .then(function(params) { return fetch(SCRIPT_URL,{method:"POST",body:params}); })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.result === "success") {
        document.getElementById("codGenerado").textContent=claveNueva;
        containerClave.style.display="block";
        showToast("🎉 ¡Nueva clave creada!","success");
        document.getElementById("form-keygen").reset();
      } else if (data.result === "duplicated") {
        // Encontró el alumno entre la búsqueda y la creación (carrera)
        alertBox.textContent=data.message||"❌ Ya existe una clave para este nombre.";
        alertBox.className="alert-box warning"; alertBox.style.display="block";
      } else {
        alertBox.textContent=data.message||"❌ No se pudo guardar la clave.";
        alertBox.className="alert-box error"; alertBox.style.display="block";
        showToast("⚠️ "+(data.message||"Error al registrar."),"warning");
      }
    })
    .catch(function() {
      alertBox.textContent="❌ NO SE PUDO GUARDAR. Verifica tu conexión.";
      alertBox.className="alert-box error"; alertBox.style.display="block";
    })
    .finally(function() { btn.disabled=false; btn.innerHTML="🔒 Generar Mi Clave Permanente"; });
}

// ── Captura de clave ──────────────────────
function capturarClave() {
  var el    = document.getElementById("claveCapturaArea");
  var boton = document.getElementById("btn-guardar-clave-captura");
  if (!el || typeof html2canvas === "undefined") { showToast("❌ No se pudo generar la captura.","warning"); return; }
  var txt = boton ? boton.innerHTML : "";
  if (boton) { boton.disabled=true; boton.innerHTML="⚡ GENERANDO..."; }
  html2canvas(el, {backgroundColor:"#ffffff", scale:2}).then(function(canvas) {
    var codigo = (document.getElementById("codGenerado")||{}).textContent||"clave";
    var link=document.createElement("a");
    link.download="clave-cented-"+codigo+".png";
    link.href=canvas.toDataURL("image/png");
    document.body.appendChild(link); link.click(); link.remove();
    showToast("📸 Captura guardada.","success");
  }).catch(function() { showToast("❌ Error al generar captura.","warning"); })
  .finally(function() { if(boton){boton.disabled=false;boton.innerHTML=txt;} });
}

// ── PANEL DOCENTE — Login ─────────────────
function unlockTeacherPanel(event) {
  if(event) event.preventDefault();
  var hp  = (document.getElementById("teacher-website")||{}).value||"";
  var pwd = document.getElementById("teacher-password");
  var alertBox = document.getElementById("alertVerRegistros");
  var btn      = document.getElementById("btnAccederRegistros");
  var ahora    = Date.now();

  if(hp.trim()!==""){alertBox.textContent="❌ CREDENCIAL DENEGADA.";alertBox.className="alert-box error";alertBox.style.display="block";return;}

  if(ahora<bloqueoHasta){
    var seg=Math.ceil((bloqueoHasta-ahora)/1000);
    alertBox.textContent="🚫 BLOQUEADO. Espera "+seg+" segundos.";alertBox.className="alert-box error";alertBox.style.display="block";return;
  }
  if(intentosFallidos>=MAX_INTENTOS){
    bloqueoHasta=ahora+TIEMPO_BLOQUEO;
    alertBox.textContent="🚫 DEMASIADOS INTENTOS. Bloqueado 5 minutos.";alertBox.className="alert-box error";alertBox.style.display="block";return;
  }

  alertBox.style.display="none";btn.disabled=true;btn.innerHTML="⚡ VERIFICANDO...";
  var firma=pwd.value.trim();

  sha256Hex(firma).then(function(firmaHash){
    var params=new URLSearchParams();
    params.append("action","validar_firma");
    params.append("firma_hash",firmaHash);
    params.append("hp",hp);
    return fetch(SCRIPT_URL,{method:"POST",body:params});
  })
  .then(function(res){return res.json();})
  .then(function(v){
    if(!v.valido){
      intentosFallidos++;
      alertBox.textContent="❌ CREDENCIAL DENEGADA. Intentos restantes: "+(MAX_INTENTOS-intentosFallidos);
      alertBox.className="alert-box error";alertBox.style.display="block";
      showToast("❌ Acceso incorrecto.","warning");
      pwd.focus();btn.disabled=false;btn.innerHTML="🔓 Entrar";pwd.value="";return;
    }
    intentosFallidos=0;bloqueoHasta=0;tokenSesion=v.token;
    btn.innerHTML="⚡ CARGANDO PANEL...";
    renderizarPanelDocente();
  })
  .catch(function(){
    alertBox.textContent="❌ ERROR AL VALIDAR. Intenta de nuevo.";alertBox.className="alert-box error";alertBox.style.display="block";
    btn.disabled=false;btn.innerHTML="🔓 Entrar";
  });
}

// ── PANEL DOCENTE — Render ────────────────
function renderizarPanelDocente() {
  var authSection  = document.getElementById("teacher-auth");
  var dashSection  = document.getElementById("teacher-dashboard");
  authSection.style.display="none";

  dashSection.innerHTML=`
    <div class="geo-toggle-row">
      <div class="geo-toggle-label">
        📍 Validación de Ubicación GPS
        <span id="geo-toggle-desc">Cargando...</span>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" id="geo-toggle-input" checked />
        <span class="toggle-slider"></span>
      </label>
    </div>

    <div class="input-group">
      <label>Registros de Asistencia (Todos):
        <small id="auto-refresh-indicator" style="font-weight:400;opacity:.6;text-transform:none;">🔄 Auto-actualiza cada 30s</small>
      </label>
      <div class="excel-embed-container" style="padding:.5rem">
        <table id="tabla-api-privada" style="width:100%;border-collapse:collapse;font-size:.85rem;text-align:left;">
          <thead>
            <tr style="background:var(--fg);color:var(--bg);text-transform:uppercase;font-family:var(--fh);">
              <th style="padding:.6rem;border:1px solid var(--fg);">Nombre</th>
              <th style="padding:.6rem;border:1px solid var(--fg);">Clave</th>
              <th style="padding:.6rem;border:1px solid var(--fg);">Grupo</th>
              <th style="padding:.6rem;border:1px solid var(--fg);">Docente</th>
              <th style="padding:.6rem;border:1px solid var(--fg);">Hora</th>
            </tr>
          </thead>
          <tbody id="tabla-api-cuerpo">
            <tr><td colspan="5" style="text-align:center;padding:2rem;opacity:.5;">Cargando...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="stats-counter-grid">
      <div class="stat-box"><span class="stat-num" id="count-morning">0</span><span class="stat-label">☀️ Mañana</span></div>
      <div class="stat-box"><span class="stat-num" id="count-afternoon">0</span><span class="stat-label">🌙 Tarde</span></div>
    </div>

    <div class="input-group">
      <label>Asistencias de Hoy:</label>
      <div class="registros-container" id="listaRegistros"></div>
    </div>

    <div class="form-actions row-layout">
      <button type="button" class="btn-danger" id="btn-clear-all">🗑 Limpiar y Archivar</button>
      <button type="button" class="btn-back" id="btn-lock-return">← Cerrar Panel</button>
    </div>

    <div class="input-group" style="margin-top:.5rem;">
      <label>⏰ Limpieza Automática Semanal</label>
      <small class="helper-text" style="margin-bottom:.8rem;display:block;">
        El sistema limpia y archiva automáticamente según el día y hora configurados.
      </small>
      <div class="geo-toggle-row" style="margin-bottom:1rem;">
        <div class="geo-toggle-label">Activar limpieza automática<span id="auto-clean-desc">Cargando...</span></div>
        <label class="toggle-switch"><input type="checkbox" id="auto-clean-toggle" /><span class="toggle-slider"></span></label>
      </div>
      <div class="input-group">
        <label for="auto-clean-day">Día de la semana</label>
        <select id="auto-clean-day">
          <option value="0">Domingo</option><option value="1">Lunes</option><option value="2">Martes</option>
          <option value="3">Miércoles</option><option value="4">Jueves</option><option value="5">Viernes</option>
          <option value="6" selected>Sábado</option>
        </select>
      </div>
      <div class="input-group">
        <label for="auto-clean-time">Hora (24h, hora El Salvador)</label>
        <input type="text" id="auto-clean-time" value="17:00" placeholder="Ej: 17:00" maxlength="5" />
        <small class="helper-text">Formato HH:MM. Ej: 17:00 = 5:00 PM.</small>
      </div>
      <button type="button" class="btn-secondary" id="btn-save-auto-clean" style="margin-top:.5rem;">💾 Guardar Config. de Limpieza</button>
    </div>
  `;

  dashSection.classList.add("visible");

  // Inyectar panel de personalización de marca
  inyectarPanelMarca(dashSection);

  // Event listeners
  document.getElementById("geo-toggle-input").addEventListener("change", toggleGeolocalizacion);
  document.getElementById("btn-clear-all").addEventListener("click", triggerClearAll);
  document.getElementById("btn-lock-return").addEventListener("click", lockAndReturn);
  document.getElementById("btn-save-auto-clean").addEventListener("click", guardarConfigLimpieza);

  obtenerEstadoGeoGlobal().then(function(activa){
    var inp=document.getElementById("geo-toggle-input"); if(inp) inp.checked=activa; actualizarDescGeo();
  });
  cargarConfigLimpieza();
  cargarDatosPanel(false);
  detenerAutoRefresh();
  panelAutoRefreshInterval=setInterval(function(){ cargarDatosPanel(true); }, 30000);
}

var DIAS=["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

function cargarConfigLimpieza() {
  var params=new URLSearchParams();
  params.append("action","obtener_config_limpieza");
  params.append("token",tokenSesion||"");
  fetch(SCRIPT_URL,{method:"POST",body:params})
    .then(function(r){return r.json();})
    .then(function(data){
      var desc=document.getElementById("auto-clean-desc");
      var tog=document.getElementById("auto-clean-toggle");
      var day=document.getElementById("auto-clean-day");
      var tim=document.getElementById("auto-clean-time");
      if(!desc||!tog||!day||!tim) return;
      if(data.result!=="success"){desc.textContent="No se pudo cargar.";return;}
      tog.checked=!!data.activa; day.value=String(data.dia); tim.value=data.hora;
      actualizarDescLimpieza(data.activa, data.dia, data.hora);
    }).catch(function(){var d=document.getElementById("auto-clean-desc");if(d)d.textContent="⚠️ Error al cargar.";});
}

function actualizarDescLimpieza(activa, dia, hora) {
  var desc=document.getElementById("auto-clean-desc"); if(!desc) return;
  if(!activa){desc.textContent="Desactivada — solo limpieza manual";return;}
  desc.textContent="Activa — todos los "+(DIAS[parseInt(dia,10)]||"Sábado")+" a las "+hora+" (hora ES)";
}

function guardarConfigLimpieza() {
  var btn=document.getElementById("btn-save-auto-clean");
  var tog=document.getElementById("auto-clean-toggle");
  var day=document.getElementById("auto-clean-day");
  var tim=document.getElementById("auto-clean-time");
  if(!btn||!tog||!day||!tim) return;
  var hora=tim.value.trim();
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)){showToast("❌ Hora inválida. Usa HH:MM (ej: 17:00).","warning");tim.focus();return;}
  btn.disabled=true; btn.textContent="⚡ Guardando...";
  var params=new URLSearchParams();
  params.append("action","guardar_config_limpieza");
  params.append("activa",tog.checked?"1":"0");
  params.append("dia",day.value);
  params.append("hora",hora);
  params.append("token",tokenSesion||"");
  fetch(SCRIPT_URL,{method:"POST",body:params})
    .then(function(r){return r.json();})
    .then(function(data){
      btn.disabled=false; btn.textContent="💾 Guardar Config. de Limpieza";
      if(data.result==="success"){actualizarDescLimpieza(tog.checked,day.value,hora);showToast("✅ Config. de limpieza guardada.","success");}
      else if(data.error==="unauthorized"){showToast("❌ Sesión inválida.","warning");lockAndReturn();}
      else showToast("❌ "+(data.message||"Error."),"warning");
    }).catch(function(){btn.disabled=false;btn.textContent="💾 Guardar Config. de Limpieza";showToast("❌ Error de red.","warning");});
}

function detenerAutoRefresh() {
  if(panelAutoRefreshInterval){clearInterval(panelAutoRefreshInterval);panelAutoRefreshInterval=null;}
}

function cargarDatosPanel(silencioso) {
  var ind=document.getElementById("auto-refresh-indicator");
  if(ind&&silencioso) ind.textContent="🔄 Actualizando...";
  var params=new URLSearchParams();
  params.append("action","obtener_registros");
  params.append("token",tokenSesion||"");
  fetch(SCRIPT_URL,{method:"POST",body:params})
    .then(function(r){return r.json();})
    .then(function(data){
      if(data.error==="unauthorized"){detenerAutoRefresh();showToast("❌ Sesión expirada","warning");lockAndReturn();return;}
      var tbody=document.getElementById("tabla-api-cuerpo"); if(!tbody) return;
      tbody.innerHTML="";
      if(!Array.isArray(data)||data.length===0){
        tbody.innerHTML='<tr><td colspan="5" style="text-align:center;padding:2rem;opacity:.5;">No hay registros.</td></tr>';
      } else {
        data.forEach(function(r){
          var f=document.createElement("tr"); f.style.borderBottom="1px solid var(--fg)";
          f.innerHTML='<td style="padding:.6rem;border-right:1px solid var(--fg);font-weight:700;">'+(r.nombre||"—")+'</td>'+
            '<td style="padding:.6rem;border-right:1px solid var(--fg);">'+(r.clave||"—")+'</td>'+
            '<td style="padding:.6rem;border-right:1px solid var(--fg);">'+(r.grupo||"—")+'</td>'+
            '<td style="padding:.6rem;border-right:1px solid var(--fg);">'+(r.docente||"—")+'</td>'+
            '<td style="padding:.6rem;opacity:.8;">'+(r.hora||"—")+'</td>';
          tbody.appendChild(f);
        });
      }
      var ahora=new Date(new Date().toLocaleString("en-US",{timeZone:"America/El_Salvador"}));
      var hoyStr=String(ahora.getDate()).padStart(2,"0")+"/"+String(ahora.getMonth()+1).padStart(2,"0")+"/"+ahora.getFullYear();
      var filtrados=(Array.isArray(data)?data:[]).filter(function(r){
        if(!r.fecha) return false;
        var p=r.fecha.replace(/-/g,"/").split("/");
        return p.length===3&&(p[0].padStart(2,"0")+"/"+p[1].padStart(2,"0")+"/"+p[2])===hoyStr;
      });
      document.getElementById("count-morning").textContent=filtrados.filter(function(r){return r.grupo==="Mañana";}).length;
      document.getElementById("count-afternoon").textContent=filtrados.filter(function(r){return r.grupo==="Tarde";}).length;
      var cont=document.getElementById("listaRegistros");
      cont.innerHTML=filtrados.length===0
        ?'<div class="registro-item" style="text-align:center;opacity:.5;">No hay asistencias hoy.</div>'
        :filtrados.map(function(r){return'<div class="registro-item"><strong>'+r.nombre+'</strong> — '+r.grupo+'<br><small style="opacity:.7;">Clave: '+r.clave+' | '+r.docente+' | '+r.hora+'</small></div>';}).join('');
      if(ind) ind.textContent="🔄 Auto-actualiza cada 30s";
      if(!silencioso) showToast("🔓 Panel Docente Activo","success");
    })
    .catch(function(){
      var i2=document.getElementById("auto-refresh-indicator");
      if(i2) i2.textContent="⚠️ Error — reintentando en 30s";
      if(!silencioso){showToast("❌ Error al cargar datos","warning");lockAndReturn();}
    });
}

function lockAndReturn() {
  detenerAutoRefresh();
  var dash=document.getElementById("teacher-dashboard");
  var auth=document.getElementById("teacher-auth");
  if(dash){dash.classList.remove("visible");dash.innerHTML="";}
  if(auth) auth.style.display="block";
  tokenSesion=null; switchView("view-menu");
}

function toggleGeolocalizacion() {
  var inp=document.getElementById("geo-toggle-input"); var activa=inp.checked;
  var params=new URLSearchParams();
  params.append("action","guardar_geo_estado");
  params.append("estado",activa?"1":"0");
  params.append("token",tokenSesion||"");
  fetch(SCRIPT_URL,{method:"POST",body:params})
    .then(function(r){return r.json();})
    .then(function(data){
      if(data.result==="success"){geoActiva=activa;actualizarDescGeo();showToast(activa?"📍 Geo ACTIVADA":"🔓 Geo DESACTIVADA",activa?"success":"info");}
      else{inp.checked=!activa;showToast("❌ Error al guardar.","warning");}
    }).catch(function(){inp.checked=!activa;showToast("❌ Error de red.","warning");});
}

function actualizarDescGeo() {
  var desc=document.getElementById("geo-toggle-desc"); if(!desc) return;
  desc.textContent=geoActiva?"Activada — alumnos dentro de 1 km":"Desactivada — válido para clases virtuales";
}

function triggerClearAll() {
  if(!confirm("🚨 ¿Confirmas limpiar y archivar TODOS los registros del día?")) return;
  showToast("⚡ Procesando...","info");
  var params=new URLSearchParams();
  params.append("action","limpiar_asistencias");
  params.append("token",tokenSesion||"");
  fetch(SCRIPT_URL,{method:"POST",body:params})
    .then(function(r){return r.json();})
    .then(function(data){
      if(data.result==="success"){showToast("🗑 Registros archivados.","success");alert("Registros guardados en Historial y limpiados correctamente.");lockAndReturn();}
      else if(data.error==="unauthorized"){showToast("❌ Sesión inválida.","warning");lockAndReturn();}
      else showToast("❌ "+(data.message||"Error."),"warning");
    }).catch(function(){showToast("❌ Error. Intenta de nuevo.","warning");});
}

// ═══════════════════════════════════════════════
// PANEL DE PERSONALIZACIÓN DE MARCA
// ═══════════════════════════════════════════════
function inyectarPanelMarca(dashSection) {
  var wrap=document.createElement("div");
  wrap.className="input-group"; wrap.style.marginTop=".5rem";
  wrap.innerHTML=`
    <label class="brand-panel-title">🎨 Personalización de Marca</label>
    <small class="helper-text" style="margin-bottom:.9rem;display:block;">
      Actualiza el logo, nombre institucional y el contenido del aviso emergente.
      Los cambios se aplican para TODOS los visitantes del sitio.
    </small>
    <div id="brand-status-msg" class="brand-status-msg"></div>

    <div class="brand-step">
      <div class="brand-step-label"><span class="brand-step-num">1</span> Logo institucional</div>
      <small class="helper-text">Ícono cuadrado. PNG, JPG o WEBP (máx. 5MB).</small>
      <input type="file" id="brand-logo-file" accept="image/png,image/jpeg,image/webp" style="margin-top:.6rem;" />
      <img id="brand-logo-preview" class="brand-preview-img" alt="Vista previa logo" />
    </div>

    <div class="brand-step">
      <div class="brand-step-label"><span class="brand-step-num">2</span> Nombre institucional</div>
      <input type="text" id="brand-title-input" maxlength="120" placeholder="Ej: Grupo Cented Academy Pro Education" />
    </div>

    <div class="brand-step">
      <div class="brand-step-label"><span class="brand-step-num">3</span> Media del aviso emergente</div>
      <div class="input-group" style="margin-bottom:.8rem;">
        <label for="brand-media-tipo">Tipo de media</label>
        <select id="brand-media-tipo">
          <option value="none">Sin media</option>
          <option value="imagen">Imagen (PNG / JPG / WEBP)</option>
          <option value="video">Video (MP4 / WEBM) — se sube a Drive</option>
          <option value="url_ext">URL externa (YouTube, Google Drive, etc.)</option>
        </select>
      </div>

      <div id="brand-media-file-wrap" style="display:none;">
        <small class="helper-text">Imagen: máx. 5MB. Video: máx. 18MB. Se guarda en Google Drive.</small>
        <input type="file" id="brand-banner-file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" style="margin-top:.4rem;" />
        <img  id="brand-banner-preview" class="brand-preview-banner" alt="Vista previa" style="display:none;" />
        <video id="brand-banner-video-preview" controls style="display:none;max-width:100%;max-height:200px;margin-top:.4rem;"></video>
      </div>

      <div id="brand-media-url-wrap" style="display:none;">
        <small class="helper-text">Pega el enlace de YouTube (embed) o de Google Drive (preview). Ejemplo:<br>
        YouTube: https://www.youtube.com/embed/VIDEO_ID<br>
        Drive: https://drive.google.com/file/d/FILE_ID/preview</small>
        <input type="url" id="brand-url-ext" placeholder="https://www.youtube.com/embed/..." style="margin-top:.4rem;" />
      </div>

      <div class="form-actions row-layout" style="margin:.7rem 0 0;">
        <label style="display:flex;align-items:center;gap:.4rem;font-size:.85rem;font-weight:700;">
          <input type="radio" name="brand-banner-orient" value="horizontal" checked /> Horizontal
        </label>
        <label style="display:flex;align-items:center;gap:.4rem;font-size:.85rem;font-weight:700;">
          <input type="radio" name="brand-banner-orient" value="vertical" /> Vertical
        </label>
      </div>
    </div>

    <div class="brand-step">
      <div class="brand-step-label"><span class="brand-step-num">4</span> Texto del aviso emergente</div>
      <div class="input-group">
        <label for="brand-aviso-titulo">Título</label>
        <input type="text" id="brand-aviso-titulo" maxlength="200" placeholder="Ej: ¡Tenemos un nuevo nombre!" />
      </div>
      <div class="input-group">
        <label for="brand-aviso-texto">Mensaje</label>
        <textarea id="brand-aviso-texto" maxlength="1200" rows="4" placeholder="Texto del aviso..."></textarea>
      </div>
      <div class="input-group">
        <label for="brand-aviso-boton">Texto del botón</label>
        <input type="text" id="brand-aviso-boton" maxlength="60" placeholder="Entendido, continuar" />
      </div>
      <div class="geo-toggle-row" style="margin-top:.6rem;">
        <div class="geo-toggle-label">Mostrar aviso a los visitantes</div>
        <label class="toggle-switch">
          <input type="checkbox" id="brand-aviso-activo" checked />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <button type="button" class="btn-secondary" id="btn-save-brand" style="width:100%;">
      💾 Guardar Personalización de Marca
    </button>
  `;
  dashSection.appendChild(wrap);

  // Mostrar/ocultar controles según tipo de media
  document.getElementById("brand-media-tipo").addEventListener("change", function() {
    var tipo=this.value;
    document.getElementById("brand-media-file-wrap").style.display=(tipo==="imagen"||tipo==="video")?"block":"none";
    document.getElementById("brand-media-url-wrap").style.display=(tipo==="url_ext")?"block":"none";
    // Filtrar el input de archivo según tipo
    var fileInput=document.getElementById("brand-banner-file");
    if(tipo==="imagen") fileInput.accept="image/png,image/jpeg,image/webp";
    else if(tipo==="video") fileInput.accept="video/mp4,video/webm";
    else fileInput.accept="image/png,image/jpeg,image/webp,video/mp4,video/webm";
  });

  document.getElementById("brand-logo-file").addEventListener("change", function(ev) {
    previewMarcaArchivo(ev, "brand-logo-preview", null);
  });
  document.getElementById("brand-banner-file").addEventListener("change", function(ev) {
    previewMarcaArchivo(ev, "brand-banner-preview", "brand-banner-video-preview");
  });
  document.getElementById("btn-save-brand").addEventListener("click", guardarMarca);

  cargarMarcaEnPanel();
}

function previewMarcaArchivo(ev, imgId, videoId) {
  var file=ev.target.files&&ev.target.files[0]; if(!file) return;
  var maxMB = file.type.indexOf("video")===0 ? 18 : 5;
  if(file.size > maxMB*1024*1024) {
    showToast("❌ El archivo es demasiado grande (máx. "+maxMB+"MB).","warning");
    ev.target.value=""; return;
  }
  var reader=new FileReader();
  reader.onload=function(e){
    var imgEl=document.getElementById(imgId);
    var vidEl=videoId?document.getElementById(videoId):null;
    if(file.type.indexOf("video")===0){
      if(imgEl){imgEl.style.display="none";}
      if(vidEl){vidEl.src=e.target.result;vidEl.style.display="block";}
    } else {
      if(imgEl){imgEl.src=e.target.result;imgEl.style.display="block";}
      if(vidEl){vidEl.style.display="none";}
    }
  };
  reader.readAsDataURL(file);
}

function leerBase64_(file) {
  return new Promise(function(res,rej){
    var r=new FileReader();
    r.onload=function(){var p=r.result.split(",");res({base64:p[1]||"",mime:file.type||"image/png"});};
    r.onerror=rej; r.readAsDataURL(file);
  });
}

function subirArchivoAlServidor_(file, nombre) {
  return leerBase64_(file).then(function(d){
    var params=new URLSearchParams();
    params.append("action","subir_archivo_marca");
    params.append("token",tokenSesion||"");
    params.append("archivo_base64",d.base64);
    params.append("mime",d.mime);
    params.append("nombre",nombre);
    return fetch(SCRIPT_URL,{method:"POST",body:params}).then(function(r){return r.json();});
  });
}

function cargarMarcaEnPanel() {
  fetch(SCRIPT_URL+"?action=obtener_config_marca")
    .then(function(r){return r.json();})
    .then(function(data){
      if(!data||data.result!=="success"||!data.config) return;
      var cfg=data.config;
      var ti=document.getElementById("brand-title-input"); if(ti) ti.value=cfg.title||"";
      var lp=document.getElementById("brand-logo-preview"); if(lp&&cfg.logoUrl){lp.src=cfg.logoUrl;lp.style.display="block";}
      var bp=document.getElementById("brand-banner-preview"); if(bp&&cfg.bannerUrl&&cfg.avisoTipoMedia==="imagen"){bp.src=cfg.bannerUrl;bp.style.display="block";}
      var mt=document.getElementById("brand-media-tipo"); if(mt) mt.value=cfg.avisoTipoMedia||"none"; mt&&mt.dispatchEvent(new Event("change"));
      var ue=document.getElementById("brand-url-ext"); if(ue) ue.value=cfg.avisoUrlExt||"";
      var radios=document.getElementsByName("brand-banner-orient");
      for(var i=0;i<radios.length;i++) radios[i].checked=(radios[i].value===(cfg.bannerOrient||"horizontal"));
      var at=document.getElementById("brand-aviso-titulo"); if(at) at.value=cfg.avisoTitulo||"";
      var ax=document.getElementById("brand-aviso-texto"); if(ax) ax.value=cfg.avisoTexto||"";
      var ab=document.getElementById("brand-aviso-boton"); if(ab) ab.value=cfg.avisoBoton||"";
      var aa=document.getElementById("brand-aviso-activo"); if(aa) aa.checked=!!cfg.avisoActivo;
    }).catch(function(){});
}

function mostrarEstadoBrand(msg, tipo) {
  var el=document.getElementById("brand-status-msg"); if(!el) return;
  el.textContent=msg; el.className="brand-status-msg "+(tipo==="ok"?"ok":"warn");
}

function guardarMarca() {
  var btn=document.getElementById("btn-save-brand"); if(!btn) return;
  btn.disabled=true; btn.textContent="⚡ Guardando...";
  mostrarEstadoBrand("Guardando...","warn");

  var tipo   = document.getElementById("brand-media-tipo").value;
  var logoF  = document.getElementById("brand-logo-file").files[0];
  var bannerF= (tipo==="imagen"||tipo==="video") ? (document.getElementById("brand-banner-file").files[0]) : null;
  var radios = document.getElementsByName("brand-banner-orient");
  var orient = "horizontal";
  for(var i=0;i<radios.length;i++) if(radios[i].checked) orient=radios[i].value;

  var subidas=[];
  subidas.push(logoF   ? subirArchivoAlServidor_(logoF,"logo")   : Promise.resolve(null));
  subidas.push(bannerF ? subirArchivoAlServidor_(bannerF,"banner"): Promise.resolve(null));

  Promise.all(subidas).then(function(res){
    var lr=res[0]; var br=res[1];
    if(logoF   &&(!lr||lr.result!=="success")) throw new Error((lr&&lr.message)||"No se pudo subir el logo.");
    if(bannerF &&(!br||br.result!=="success")) throw new Error((br&&br.message)||"No se pudo subir el archivo del aviso.");

    var params=new URLSearchParams();
    params.append("action","guardar_config_marca");
    params.append("token",tokenSesion||"");
    params.append("title",document.getElementById("brand-title-input").value.trim());
    if(lr&&lr.url) params.append("logoUrl",lr.url);
    if(br&&br.url) params.append("bannerUrl",br.url);
    params.append("bannerOrient",orient);
    params.append("avisoTipoMedia",tipo);
    params.append("avisoUrlExt",(document.getElementById("brand-url-ext")||{}).value||"");
    params.append("avisoActivo",document.getElementById("brand-aviso-activo").checked?"1":"0");
    params.append("avisoTitulo",document.getElementById("brand-aviso-titulo").value.trim());
    params.append("avisoTexto", document.getElementById("brand-aviso-texto").value.trim());
    params.append("avisoBoton", document.getElementById("brand-aviso-boton").value.trim());

    return fetch(SCRIPT_URL,{method:"POST",body:params}).then(function(r){return r.json();});
  }).then(function(data){
    btn.disabled=false; btn.textContent="💾 Guardar Personalización de Marca";
    if(!data) return;
    if(data.result==="success"){
      mostrarEstadoBrand("✅ Guardado. Se aplica para todos los visitantes.","ok");
      showToast("✅ Personalización guardada.","success");
      if(data.config) aplicarConfigMarcaAlSitio(data.config);
    } else if(data.error==="unauthorized"){
      mostrarEstadoBrand("❌ Sesión inválida. Inicia sesión y vuelve a guardar.","warn");
      showToast("❌ Sesión inválida.","warning");
    } else {
      mostrarEstadoBrand("❌ "+(data.message||"Error al guardar."),"warn");
      showToast("❌ Error.","warning");
    }
  }).catch(function(err){
    btn.disabled=false; btn.textContent="💾 Guardar Personalización de Marca";
    mostrarEstadoBrand("❌ "+(err&&err.message?err.message:"Error de red."),"warn");
    showToast("❌ Error al guardar.","warning");
  });
}

// ═══════════════════════════════════════════════
// MARCA Y AVISO EMERGENTE — carga al inicio
// ═══════════════════════════════════════════════
function inicializarMarcaYAviso() {
  // Usamos el endpoint canónico; el backend mantiene alias para v7.
  fetch(SCRIPT_URL + "?action=obtener_config_marca")
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (!data || data.result !== "success" || !data.config) return;
      aplicarConfigMarcaAlSitio(data.config);
      mostrarAvisoSiCorresponde(data.config);
    })
    .catch(function() { /* falla silenciosa; el sitio usa valores por defecto del HTML */ });
}

function aplicarConfigMarcaAlSitio(cfg) {
  if (!cfg) return;
  // Logo
  var logoImg = document.getElementById("brand-logo-img");
  if (logoImg && cfg.logoUrl) { logoImg.src=cfg.logoUrl; logoImg.style.display="block"; }
  // Favicon
  if (cfg.logoUrl) { var fav=document.getElementById("favicon-link"); if(fav) fav.href=cfg.logoUrl; }
  // Título
  var titleEl = document.getElementById("brand-title-text");
  if (titleEl && cfg.title) {
    titleEl.textContent=cfg.title;
    document.title=cfg.title+" | AULA DIGITAL";
    var desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute("content", "Portal oficial para el Control de Asistencia — "+cfg.title+".");
    var ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute("content", "Control de Asistencia — "+cfg.title);
    var keywords = document.querySelector('meta[name="keywords"]');
    if (keywords) keywords.setAttribute("content", cfg.title+", control de asistencia, aula digital, CENTED");
  }
  // Logo dentro del aviso
  var avisoLogo = document.getElementById("aviso-logo-img");
  if (avisoLogo && cfg.logoUrl) avisoLogo.src=cfg.logoUrl;
}

function mostrarAvisoSiCorresponde(cfg) {
  if (!cfg || !cfg.avisoActivo) return;
  var yaVisto=false;
  try { yaVisto=sessionStorage.getItem(AVISO_SESSION_KEY)==="1"; } catch(e){}
  if (yaVisto) return;

  var overlay  = document.getElementById("aviso-overlay"); if(!overlay) return;
  var tituloEl = document.getElementById("aviso-titulo-txt");
  var textoEl  = document.getElementById("aviso-texto-txt");
  var botonEl  = document.getElementById("aviso-btn-continuar");
  var mediaWrap= document.getElementById("aviso-media-wrap");

  if (tituloEl && cfg.avisoTitulo) tituloEl.textContent=cfg.avisoTitulo;
  if (textoEl  && cfg.avisoTexto)  textoEl.textContent=cfg.avisoTexto;
  if (botonEl  && cfg.avisoBoton)  botonEl.textContent=cfg.avisoBoton;

  // Construir el elemento de media según el tipo
  if (mediaWrap) {
    mediaWrap.innerHTML="";
    var tipo = cfg.avisoTipoMedia||"none";
    var orient = cfg.bannerOrient||"horizontal";
    var esVertical = orient==="vertical";

    if (tipo==="imagen" && cfg.bannerUrl) {
      var img=document.createElement("img");
      img.src=cfg.bannerUrl; img.alt="";
      img.className="aviso-media-img"+(esVertical?" portrait":"");
      mediaWrap.appendChild(img); mediaWrap.classList.add("visible");

    } else if (tipo==="video" && cfg.bannerUrl) {
      // Solo los enlaces de visualización de Drive usan iframe; los archivos
      // subidos se entregan como video nativo para conservar controles y calidad.
      if (cfg.bannerUrl.indexOf("/preview")!==-1 && cfg.bannerUrl.indexOf("drive.google.com")!==-1) {
        var ifrm=document.createElement("iframe");
        ifrm.src=cfg.bannerUrl; ifrm.className="aviso-media-iframe"+(esVertical?" portrait-frame":"");
        ifrm.setAttribute("allow","autoplay; fullscreen; encrypted-media; picture-in-picture");
        ifrm.setAttribute("allowfullscreen",""); ifrm.setAttribute("loading","eager");
        ifrm.title="Video del aviso institucional";
        mediaWrap.appendChild(ifrm); mediaWrap.classList.add("visible");
      } else {
        // Video nativo: autoplay muted es necesario para que los navegadores
        // móviles permitan iniciar la reproducción sin tocar la pantalla.
        var vid=document.createElement("video");
        vid.src=cfg.bannerUrl; vid.className="aviso-media-video";
        vid.setAttribute("controls",""); vid.setAttribute("preload","auto");
        vid.setAttribute("autoplay",""); vid.setAttribute("muted","");
        vid.setAttribute("playsinline",""); vid.loop=false; vid.muted=true;
        mediaWrap.appendChild(vid); mediaWrap.classList.add("visible");
        vid.play().catch(function() {});
      }

    } else if (tipo==="url_ext" && esUrlHttpsSegura(cfg.avisoUrlExt)) {
      var youtubeEmbed = convertirYoutubeAEmbed(cfg.avisoUrlExt);
      var ifrm2=document.createElement("iframe");
      ifrm2.src=youtubeEmbed || cfg.avisoUrlExt; ifrm2.className="aviso-media-iframe"+(esVertical?" portrait-frame":"");
      ifrm2.setAttribute("allow","autoplay; fullscreen; encrypted-media; picture-in-picture");
      ifrm2.setAttribute("allowfullscreen",""); ifrm2.setAttribute("loading","eager");
      ifrm2.title="Contenido externo del aviso";
      mediaWrap.appendChild(ifrm2); mediaWrap.classList.add("visible");
    }
    // tipo="none": mediaWrap queda vacío y sin clase visible
  }

  overlay.classList.add("visible");
}

function cerrarAviso() {
  var overlay=document.getElementById("aviso-overlay");
  if (overlay) {
    overlay.querySelectorAll("video").forEach(function(v) { v.pause(); v.removeAttribute("src"); v.load(); });
    overlay.querySelectorAll("iframe").forEach(function(frame) { frame.src="about:blank"; });
    overlay.classList.remove("visible");
  }
  try { sessionStorage.setItem(AVISO_SESSION_KEY,"1"); } catch(e){}
}

// ═══════════════════════════════════════════════
// TEMA (modo oscuro/claro)
// ═══════════════════════════════════════════════
function aplicarTema(tema) {
  var oscuro=tema==="dark";
  document.documentElement.setAttribute("data-theme",oscuro?"dark":"light");
  var icon=document.getElementById("theme-icon"); if(icon) icon.textContent=oscuro?"☀️":"🌙";
  var meta=document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute("content",oscuro?"#14151a":"#000000");
}

function inicializarTema() {
  var guardado=null;
  try{guardado=localStorage.getItem(THEME_STORAGE_KEY);}catch(e){}
  var pref=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;
  var tema=guardado||(pref?"dark":"light");
  aplicarTema(tema);
  var inp=document.getElementById("theme-toggle-input"); if(inp) inp.checked=tema==="dark";
}

function toggleTema() {
  var inp=document.getElementById("theme-toggle-input");
  var tema=inp&&inp.checked?"dark":"light";
  aplicarTema(tema);
  try{localStorage.setItem(THEME_STORAGE_KEY,tema);}catch(e){}
}

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", function() {
  inicializarTema();
  inicializarMarcaYAviso();

  var themeInput=document.getElementById("theme-toggle-input");
  if(themeInput) themeInput.addEventListener("change",toggleTema);

  document.getElementById("btn-menu-register").addEventListener("click",function(){switchView("view-register");});
  document.getElementById("btn-menu-keygen").addEventListener("click",function(){switchView("view-keygen");});
  document.getElementById("btn-menu-teacher").addEventListener("click",function(){switchView("view-teacher");});

  document.getElementById("form-register").addEventListener("submit",registrarAsistencia);
  document.getElementById("btn-back-register").addEventListener("click",salirDeRegistro);
  document.getElementById("tab-qr").addEventListener("click",function(){setFirmaTab("qr");});
  document.getElementById("tab-manual").addEventListener("click",function(){setFirmaTab("manual");});
  document.getElementById("btn-start-qr").addEventListener("click",iniciarQR);
  document.getElementById("btn-stop-qr").addEventListener("click",detenerQR);

  document.getElementById("form-keygen").addEventListener("submit",generarClave);
  document.getElementById("btn-back-keygen").addEventListener("click",function(){switchView("view-menu");});

  // Campos opcionales — formateo de cumpleaños solo si el elemento existe
  var birthdayField=document.getElementById("gen-birthday");
  if(birthdayField) birthdayField.addEventListener("input",formatearCumpleanosInput);

  var btnCaptura=document.getElementById("btn-guardar-clave-captura");
  if(btnCaptura) btnCaptura.addEventListener("click",capturarClave);

  document.getElementById("teacher-auth").addEventListener("submit",unlockTeacherPanel);
  document.getElementById("btn-back-teacher").addEventListener("click",function(){switchView("view-menu");});

  // Aviso emergente
  var btnContinuar=document.getElementById("aviso-btn-continuar");
  if(btnContinuar) btnContinuar.addEventListener("click",cerrarAviso);
  var btnX=document.getElementById("aviso-close-x");
  if(btnX) btnX.addEventListener("click",cerrarAviso);
  var avisoOverlay=document.getElementById("aviso-overlay");
  if(avisoOverlay) avisoOverlay.addEventListener("click",function(ev){if(ev.target===avisoOverlay) cerrarAviso();});
});
