const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx3ZYrJsSSKbEZg3mRarzddxHPq3HJ4si0WeZiTO-iu-sGQY12TbgNf8ueMPlho5tok/exec";

const CENTED_LAT = 13.716795758900204;
const CENTED_LNG = -89.1001956388224;
const RADIO_KM   = 1.0;

// ── Estado global ─────────────────────────
var geoActiva    = true;
var geoOK        = false;
var geoRevisada  = false;
var geoCoords    = null;
var nombreSeleccionadoParaClave = "";
var listaAlumnosCargada = false;
var listaAlumnosCargando = false;

const THEME_STORAGE_KEY = "cented_theme";

// ── Crypto (HMAC Seguro) ──────────────────
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


// ── RECORDAR CLAVE: lista pública de nombres, clave solo tras validar admin ──
function setEstadoListaAlumnos(texto) {
  var estado = document.getElementById("reg-student-list-status");
  if (estado) estado.textContent = texto;
}

function cargarListaEstudiantesSelect(intento, forzar) {
  intento = intento || 0;
  var select = document.getElementById("reg-student-select");
  if (!select || listaAlumnosCargando || (listaAlumnosCargada && !forzar)) return;

  listaAlumnosCargando = true;
  select.disabled = true;
  setEstadoListaAlumnos("Cargando nombres de la hoja Claves…");
  var retryBtn = document.getElementById("btn-reload-students");
  if (retryBtn) { retryBtn.disabled = true; retryBtn.style.display = "none"; }

  var sep = SCRIPT_URL.indexOf("?") === -1 ? "?" : "&";
  var url = SCRIPT_URL + sep + "action=obtener_lista_alumnos&_=" + Date.now();
  fetch(url, { cache: "no-store", redirect: "follow" })
    .then(function(res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function(data) {
      if (!data || data.result !== "success" || !Array.isArray(data.alumnos)) {
        throw new Error("Respuesta de lista inválida");
      }
      var nombres = [];
      var vistos = Object.create(null);
      data.alumnos.forEach(function(valor) {
        var nombre = typeof valor === "string" ? valor.trim() : "";
        var clave = nombre.toLocaleLowerCase("es");
        if (nombre && !vistos[clave]) { vistos[clave] = true; nombres.push(nombre); }
      });
      nombres.sort(function(a, b) { return a.localeCompare(b, "es", { sensitivity: "base" }); });

      var seleccionado = select.value;
      select.innerHTML = "";
      var placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "-- Selecciona tu Nombre para recordar clave --";
      placeholder.selected = true;
      select.appendChild(placeholder);
      nombres.forEach(function(nombre) {
        var opt = document.createElement("option");
        opt.value = nombre;
        opt.textContent = nombre;
        select.appendChild(opt);
      });
      if (seleccionado && nombres.indexOf(seleccionado) !== -1) select.value = seleccionado;

      listaAlumnosCargada = true;
      select.dataset.loaded = "true";
      select.disabled = false;
      setEstadoListaAlumnos(nombres.length
        ? "Lista cargada: " + nombres.length + " estudiantes. La clave se muestra solo con autorización docente."
        : "La hoja Claves no devolvió nombres; revisa que haya datos desde la fila 2 en la columna A.");
      if (retryBtn) retryBtn.style.display = "none";
    })
    .catch(function() {
      listaAlumnosCargada = false;
      if (intento < 2) {
        setEstadoListaAlumnos("No se pudo conectar con la lista; reintentando (" + (intento + 1) + "/2)…");
        window.setTimeout(function() { cargarListaEstudiantesSelect(intento + 1, true); }, 700 * (intento + 1));
      } else {
        select.innerHTML = "";
        var errorOption = document.createElement("option");
        errorOption.value = "";
        errorOption.textContent = "Lista no disponible — vuelve a cargar";
        errorOption.selected = true;
        select.appendChild(errorOption);
        select.disabled = true;
        setEstadoListaAlumnos("No se pudo cargar la lista. Revisa la conexión y toca «Recargar nombres». ");
        if (retryBtn) { retryBtn.disabled = false; retryBtn.style.display = "block"; }
      }
    })
    .then(function() { listaAlumnosCargando = false; }, function() { listaAlumnosCargando = false; });
}

function mostrarErrorConsultaClave(mensaje) {
  var alertBox = document.getElementById("alertAuthClave");
  if (!alertBox) return;
  alertBox.textContent = mensaje;
  alertBox.className = "alert-box error";
  alertBox.style.display = "block";
}

function abrirModalAuthClave(nombre) {
  nombreSeleccionadoParaClave = sanitizarInput(nombre || "");
  if (!nombreSeleccionadoParaClave) return;
  var modal = document.getElementById("modal-auth-clave");
  var texto = document.getElementById("modal-auth-student-name");
  var pass = document.getElementById("auth-admin-pass");
  var alerta = document.getElementById("alertAuthClave");
  if (texto) texto.textContent = "Para consultar la Clave Única de " + nombreSeleccionadoParaClave + ", ingresa la autorización docente.";
  if (pass) pass.value = "";
  if (alerta) { alerta.textContent = ""; alerta.style.display = "none"; }
  if (modal) modal.style.display = "flex";
  if (pass) pass.focus();
}

function cerrarModalAuthClave() {
  var modal = document.getElementById("modal-auth-clave");
  var pass = document.getElementById("auth-admin-pass");
  var select = document.getElementById("reg-student-select");
  if (modal) modal.style.display = "none";
  if (pass) pass.value = "";
  if (select) select.value = "";
  nombreSeleccionadoParaClave = "";
}

function procesarConsultaClaveOlvidada() {
  var pass = document.getElementById("auth-admin-pass");
  var alerta = document.getElementById("alertAuthClave");
  var btn = document.getElementById("btn-confirm-auth-clave");
  var claveAdmin = pass ? pass.value.trim() : "";
  if (!nombreSeleccionadoParaClave) {
    mostrarErrorConsultaClave("Selecciona primero el nombre del estudiante.");
    return;
  }
  if (!claveAdmin) {
    mostrarErrorConsultaClave("Ingresa la clave de autorización docente.");
    if (pass) pass.focus();
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = "VERIFICANDO…"; }
  if (alerta) alerta.style.display = "none";

  firmarPayload("consultar_clave_olvidada", {
    nombre: nombreSeleccionadoParaClave,
    clave_admin: claveAdmin
  }, null)
    .then(function(params) { return fetch(SCRIPT_URL, { method: "POST", body: params }); })
    .then(function(res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
    .then(function(data) {
      if (data && data.result === "success" && /^[A-Z0-9]{4}$/.test(String(data.clave || "").toUpperCase())) {
        var docente = sanitizarInput(String(data.docente || ""));
        if (!docente) {
          mostrarErrorConsultaClave("La columna D (docente) está vacía para este nombre en la hoja Claves. No se completó el registro.");
          return;
        }
        var keyInput = document.getElementById("reg-key");
        var teacherInput = document.getElementById("reg-teacher");
        if (keyInput) keyInput.value = String(data.clave).toUpperCase();
        if (teacherInput) teacherInput.value = docente;
        showToast("Clave recuperada y docente asignado al formulario.", "success");
        cerrarModalAuthClave();
      } else {
        mostrarErrorConsultaClave((data && data.message) || "No se encontró la clave del estudiante.");
      }
    })
    .catch(function() { mostrarErrorConsultaClave("Error de conexión al consultar la hoja Claves. Intenta de nuevo."); })
    .then(function() {
      if (btn) { btn.disabled = false; btn.textContent = "✓ Confirmar"; }
    }, function() {
      if (btn) { btn.disabled = false; btn.textContent = "✓ Confirmar"; }
    });
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
  if (current) {
    current.querySelectorAll(".alert-box").forEach(function(el) {
      el.className = "alert-box"; el.style.display = "none";
    });
    current.classList.remove("active");
  }
  target.classList.add("active");
  if (viewId === "view-register") {
    geoOK = false; geoRevisada = false;
    cargarListaEstudiantesSelect(0, true);
    obtenerEstadoGeoGlobal().then(function() { verificarGeolocalizacion(); });
  }
}

function irAlInicioDePagina() { window.scrollTo({ top:0, left:0, behavior:"smooth" }); }

// ── Geolocalización ───────────────────────
function obtenerEstadoGeoGlobal() {
  return fetch(SCRIPT_URL + "?action=obtener_geo_estado&_=" + Date.now(), { cache: "no-store" })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (!data || typeof data.geo_activa !== "boolean") throw new Error("Estado GPS inválido");
      geoActiva = data.geo_activa;
      return geoActiva;
    })
    .catch(function() {
      // Cierre seguro: si el servidor no responde, no se omite el control GPS.
      geoActiva = true;
      return true;
    });
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
      var msgs = { 1:"Permiso de ubicación denegado.", 2:"No se pudo obtener la ubicación.", 3:"Tiempo agotado." };
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
        setTimeout(function(){ switchView("view-menu"); }, 2500);
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
  
  var telefono = limpiarTelefono(telefonoInput);
  var correo   = correoInput.trim().toLowerCase();
  var nombre   = normalizarNombre(nombreInput);

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
        crearNuevaClave(nombre, docenteInput, telefono||"", correo||"", cumpleInput||"", hp, alertBox, btn, containerClave);
      }
    })
    .catch(function() {
      alertBox.textContent="❌ ERROR AL CONSULTAR EL SERVIDOR.";
      alertBox.className="alert-box error"; alertBox.style.display="block";
      btn.disabled=false; btn.innerHTML="🔒 Generar Mi Clave Permanente";
    });
}

function crearNuevaClave(nombre, docente, telefono, correo, cumple, hp, alertBox, btn, containerClave) {
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
    codigo:   "",
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

  var studentSelect = document.getElementById("reg-student-select");
  if (studentSelect) {
    studentSelect.addEventListener("change", function() {
      if (this.value) abrirModalAuthClave(this.value);
    });
    studentSelect.addEventListener("focus", function() {
      if (!listaAlumnosCargada && !listaAlumnosCargando) cargarListaEstudiantesSelect();
    });
  }
  var retryList = document.getElementById("btn-reload-students");
  if (retryList) retryList.addEventListener("click", function() {
    listaAlumnosCargada = false;
    cargarListaEstudiantesSelect(0, true);
  });
  var authConfirm = document.getElementById("btn-confirm-auth-clave");
  if (authConfirm) authConfirm.addEventListener("click", procesarConsultaClaveOlvidada);
  var authCancel = document.getElementById("btn-cancel-auth-clave");
  if (authCancel) authCancel.addEventListener("click", cerrarModalAuthClave);
  var authPass = document.getElementById("auth-admin-pass");
  if (authPass) authPass.addEventListener("keydown", function(ev) {
    if (ev.key === "Enter") { ev.preventDefault(); procesarConsultaClaveOlvidada(); }
  });

  var themeInput=document.getElementById("theme-toggle-input");
  if(themeInput) themeInput.addEventListener("change",toggleTema);

  document.getElementById("btn-menu-register").addEventListener("click",function(){switchView("view-register");});
  document.getElementById("btn-menu-keygen").addEventListener("click",function(){switchView("view-keygen");});

  document.getElementById("form-register").addEventListener("submit",registrarAsistencia);
  document.getElementById("btn-back-register").addEventListener("click",function(){switchView("view-menu");});

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
});
