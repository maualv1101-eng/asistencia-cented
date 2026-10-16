const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwD-s-Xy9XTP1r_8YukdBCcCXkYPwRiNtgZRiP-nrHSXy0heasLBBc6pOwp_0d1gTI1/exec";

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
var nombreSeleccionadoParaClave = "";

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

  var camposOrdenados = Object.keys(fields).sort().map(function(k) {
    var v = fields[k];
    return k + "=" + (v !== undefined && v !== null ? v : "");
  }).join("|");
  var mensaje = action + "|" + nonce + "|" + ts + "|" + camposOrdenados;
  var hmac = await hmacSha256Hex(clave, mensaje);

  var params = new URLSearchParams();
  params.append("action", action);
  Object.keys(fields).forEach(function(k) {
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

// ── Cargar lista de estudiantes en el desplegable ──
function cargarListaEstudiantesSelect() {
  var select = document.getElementById("reg-student-select");
  if (!select) return;
  fetch(SCRIPT_URL + "?action=obtener_lista_alumnos")
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data && data.result === "success" && Array.isArray(data.alumnos)) {
        select.innerHTML = '<option value="" selected>-- Selecciona tu Nombre para recordar clave --</option>';
        data.alumnos.forEach(function(nombre) {
          var opt = document.createElement("option");
          opt.value = nombre;
          opt.textContent = nombre;
          select.appendChild(opt);
        });
      }
    })
    .catch(function(err) {});
}

// ── Manejo de Autorización de Clave ──
function abrirModalAuthClave(nombre) {
  nombreSeleccionadoParaClave = nombre;
  var modal = document.getElementById("modal-auth-clave");
  var txtStudent = document.getElementById("modal-auth-student-name");
  var passInput = document.getElementById("auth-admin-pass");
  var alertBox = document.getElementById("alertAuthClave");

  if (txtStudent) {
    txtStudent.innerHTML = "Ingresa la clave docente para consultar la Clave Única de <strong>" + nombre + "</strong>:";
  }
  if (passInput) passInput.value = "";
  if (alertBox) { alertBox.style.display = "none"; alertBox.className = "alert-box"; }
  if (modal) { modal.style.display = "flex"; }
  if (passInput) passInput.focus();
}

function cerrarModalAuthClave() {
  var modal = document.getElementById("modal-auth-clave");
  if (modal) modal.style.display = "none";
  var select = document.getElementById("reg-student-select");
  if (select) select.value = "";
  nombreSeleccionadoParaClave = "";
}

function procesarConsultaClaveOlvidada() {
  var passInput = document.getElementById("auth-admin-pass");
  var alertBox = document.getElementById("alertAuthClave");
  var btn = document.getElementById("btn-confirm-auth-clave");

  var claveAdmin = (passInput ? passInput.value : "").trim();
  if (!claveAdmin) {
    if (alertBox) {
      alertBox.textContent = "❌ Ingresa la clave docente.";
      alertBox.className = "alert-box error"; alertBox.style.display = "block";
    }
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = "VERIFICANDO..."; }

  firmarPayload("consultar_clave_olvidada", {
    nombre: nombreSeleccionadoParaClave,
    clave_admin: claveAdmin
  }, null)
  .then(function(params) { return fetch(SCRIPT_URL, { method: "POST", body: params }); })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.result === "success" && data.clave) {
      var regKeyInput = document.getElementById("reg-key");
      if (regKeyInput) {
        regKeyInput.value = data.clave;
        regKeyInput.dispatchEvent(new Event("input"));
      }
      showToast("✅ Clave cargada: " + data.clave, "success");
      cerrarModalAuthClave();
    } else {
      if (alertBox) {
        alertBox.textContent = data.message || "❌ Clave de autorización incorrecta.";
        alertBox.className = "alert-box error"; alertBox.style.display = "block";
      }
    }
  })
  .catch(function() {
    if (alertBox) {
      alertBox.textContent = "❌ Error de conexión al consultar.";
      alertBox.className = "alert-box error"; alertBox.style.display = "block";
    }
  })
  .finally(function() {
    if (btn) { btn.disabled = false; btn.textContent = "✓ Confirmar"; }
  });
}

// ── Navegación entre vistas ───────────────
function switchView(viewId) {
  var current = document.querySelector(".card-view.active");
  var target  = document.getElementById(viewId);
  if (!target || current === target) return;
  if (current) {
    current.querySelectorAll(".alert-box").forEach(function(el) {
      el.className = "alert-box"; el.style.display = "none";
    });
    current.classList.remove("active");
  }
  target.classList.add("active");
  if (viewId === "view-register") {
    geoOK = false; geoRevisada = false;
    var fv = document.getElementById("firma-valor"); if (fv) fv.value = "";
    cargarListaEstudiantesSelect();
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
function detenerQR() {
  if (qrScanner && qrActivo) {
    qrScanner.stop().catch(function(){}).finally(function(){ qrScanner=null; qrActivo=false; });
  } else { qrScanner=null; qrActivo=false; }
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

  var claveInput   = sanitizarInput((document.getElementById("reg-key")||{}).value||"").toUpperCase();
  var docenteInput = sanitizarInput((document.getElementById("reg-teacher")||{}).value||"");
  var grupoInput   = sanitizarInput((document.getElementById("reg-group")||{}).value||"");

  if (!claveInput || claveInput.length !== 4) {
    alertBox.textContent="❌ Ingresa tu Clave Única de 4 caracteres."; alertBox.className="alert-box error"; alertBox.style.display="block"; irAlInicioDePagina(); return;
  }

  if (geoActiva && !geoRevisada) {
    alertBox.textContent="⏳ Esperando verificación de ubicación."; alertBox.className="alert-box warning"; alertBox.style.display="block"; irAlInicioDePagina(); return;
  }
  if (geoActiva && !geoOK) {
    alertBox.textContent="❌ Debes estar dentro del CENTED (máx 1 km).";
    alertBox.className="alert-box error"; alertBox.style.display="block"; irAlInicioDePagina(); return;
  }

  alertBox.style.display="none"; btn.disabled=true; btn.innerHTML="⚡ ENVIANDO REGISTRO...";

  var fields = { clave:claveInput, docente:docenteInput, grupo:grupoInput, firma:"", hp:hp };
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
function generarClave(event) {
  event.preventDefault();

  var hp           = (document.getElementById("gen-website")||{}).value||"";
  var nombreInput  = (document.getElementById("gen-name")||{}).value||"";
  var docenteInput = (document.getElementById("gen-teacher")||{}).value||"";
  var telefonoInput= (document.getElementById("gen-phone")||{}).value||"";
  var correoInput  = (document.getElementById("gen-email")||{}).value||"";
  var cumpleInput  = ((document.getElementById("gen-birthday")||{}).value||"").trim();
  var codigoInput  = ((document.getElementById("gen-override")||{}).value||"").trim();

  var alertBox      = document.getElementById("alertGenerarClave");
  var btn           = document.getElementById("btnGenerar");
  var containerClave= document.getElementById("claveGeneradaContainer");

  if (hp.trim() !== "") {
    alertBox.textContent="❌ No se pudo procesar."; alertBox.className="alert-box error"; alertBox.style.display="block"; return;
  }

  if (!validarNombre(nombreInput)) {
    alertBox.textContent="❌ Escribe tu nombre completo (nombre y al menos un apellido).";
    alertBox.className="alert-box error"; alertBox.style.display="block";
    showToast("❌ Nombre inválido.","warning"); return;
  }
  docenteInput = sanitizarInput(docenteInput);

  var telefono = limpiarTelefono(telefonoInput);
  var correo   = correoInput.trim().toLowerCase();

  var nombre = normalizarNombre(nombreInput);
  btn.disabled=true; btn.innerHTML="⚡ CONSULTANDO BASE DE DATOS...";
  containerClave.style.display="none"; alertBox.style.display="none";

  firmarPayload("buscar_alumno", { nombre:nombre }, null)
    .then(function(params) { return fetch(SCRIPT_URL, {method:"POST", body:params}); })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.clave) {
        document.getElementById("codGenerado").textContent = data.clave;
        containerClave.style.display="block";
        showToast("🔍 Clave recuperada con éxito.","info");
        document.getElementById("form-keygen").reset();
        btn.disabled=false; btn.innerHTML="🔒 Generar Mi Clave Permanente";
      } else {
        crearNuevaClave(nombre, docenteInput, telefono||"", correo||"", cumpleInput||"", codigoInput, hp, alertBox, btn, containerClave);
      }
    })
    .catch(function() {
      alertBox.textContent="❌ ERROR AL CONSULTAR EL SERVIDOR.";
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
        cargarListaEstudiantesSelect();
      } else if (data.result === "duplicated") {
        alertBox.textContent=data.message||"❌ Ya existe una clave para este nombre.";
        alertBox.className="alert-box warning"; alertBox.style.display="block";
      } else {
        alertBox.textContent=data.message||"❌ No se pudo guardar la clave.";
        alertBox.className="alert-box error"; alertBox.style.display="block";
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
  `;

  dashSection.classList.add("visible");

  document.getElementById("geo-toggle-input").addEventListener("change", toggleGeolocalizacion);
  document.getElementById("btn-clear-all").addEventListener("click", triggerClearAll);
  document.getElementById("btn-lock-return").addEventListener("click", lockAndReturn);

  obtenerEstadoGeoGlobal().then(function(activa){
    var inp=document.getElementById("geo-toggle-input"); if(inp) inp.checked=activa; actualizarDescGeo();
  });
  cargarDatosPanel(false);
  detenerAutoRefresh();
  panelAutoRefreshInterval=setInterval(function(){ cargarDatosPanel(true); }, 30000);
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
      if(data.result==="success"){showToast("🗑 Registros archivados.","success");alert("Registros guardados en Historial.");lockAndReturn();}
      else if(data.error==="unauthorized"){showToast("❌ Sesión inválida.","warning");lockAndReturn();}
      else showToast("❌ "+(data.message||"Error."),"warning");
    }).catch(function(){showToast("❌ Error. Intenta de nuevo.","warning");});
}

// ── TEMA ──
function aplicarTema(tema) {
  var oscuro=tema==="dark";
  document.documentElement.setAttribute("data-theme",oscuro?"dark":"light");
  var icon=document.getElementById("theme-icon"); if(icon) icon.textContent=oscuro?"☀️":"🌙";
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

// ── INIT ──
document.addEventListener("DOMContentLoaded", function() {
  inicializarTema();
  cargarListaEstudiantesSelect();

  var themeInput=document.getElementById("theme-toggle-input");
  if(themeInput) themeInput.addEventListener("change",toggleTema);

  document.getElementById("btn-menu-register").addEventListener("click",function(){switchView("view-register");});
  document.getElementById("btn-menu-keygen").addEventListener("click",function(){switchView("view-keygen");});
  document.getElementById("btn-menu-teacher").addEventListener("click",function(){switchView("view-teacher");});

  document.getElementById("form-register").addEventListener("submit",registrarAsistencia);
  document.getElementById("btn-back-register").addEventListener("click",salirDeRegistro);

  // Escuchar selección de estudiante en el desplegable
  var studentSelect = document.getElementById("reg-student-select");
  if (studentSelect) {
    studentSelect.addEventListener("change", function() {
      var val = this.value;
      if (val) abrirModalAuthClave(val);
    });
  }

  // Botones de modal de autorización
  var btnAuthConfirm = document.getElementById("btn-confirm-auth-clave");
  if (btnAuthConfirm) btnAuthConfirm.addEventListener("click", procesarConsultaClaveOlvidada);

  var btnAuthCancel = document.getElementById("btn-cancel-auth-clave");
  if (btnAuthCancel) btnAuthCancel.addEventListener("click", cerrarModalAuthClave);

  // Autocompletar docente si escribe directamente la clave
  var regKeyEl = document.getElementById("reg-key");
  if (regKeyEl) {
    regKeyEl.addEventListener("input", function(e) {
      var clave = e.target.value.trim().toUpperCase();
      if (clave.length === 4) {
        firmarPayload("buscar_alumno", { clave: clave }, null)
          .then(function(params) { return fetch(SCRIPT_URL, { method: "POST", body: params }); })
          .then(function(res) { return res.json(); })
          .then(function(data) {
            if (data && data.docente) {
              var selectDocente = document.getElementById("reg-teacher");
              if (selectDocente) selectDocente.value = data.docente;
            }
          })
          .catch(function(err) {});
      }
    });
  }

  document.getElementById("form-keygen").addEventListener("submit",generarClave);
  document.getElementById("btn-back-keygen").addEventListener("click",function(){switchView("view-menu");});

  var birthdayField=document.getElementById("gen-birthday");
  if(birthdayField) birthdayField.addEventListener("input",formatearCumpleanosInput);

  var btnCaptura=document.getElementById("btn-guardar-clave-captura");
  if(btnCaptura) btnCaptura.addEventListener("click",capturarClave);

  document.getElementById("teacher-auth").addEventListener("submit",unlockTeacherPanel);
  document.getElementById("btn-back-teacher").addEventListener("click",function(){switchView("view-menu");});
});
