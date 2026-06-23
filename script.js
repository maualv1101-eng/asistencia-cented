// ==========================================
// FRONTEND — Sistema de Asistencia CENTED v2.0
// SEGURIDAD MEJORADA: Sin algoritmo expuesto + reCAPTCHA
// ==========================================

const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxz-s-GcCEjju-139Z8qUVM5swwPckwjofalfbBs1PfraMoFG50u0E3-BrhL315Bmus/exec";

// ── CONFIGURACIÓN reCAPTCHA v2 Invisible ──
// Registra tu sitio en https://www.google.com/recaptcha/admin
// Selecciona "reCAPTCHA v2" → "Invisible reCAPTCHA badge"
// Copia el SITE KEY aquí:
const RECAPTCHA_SITE_KEY = "6LfOsy4tAAAAABgO5ehK1cf7aphG-NzPShd2SkT_"; // ← REEMPLAZA CON TU SITE KEY

/**
 * Carga el script de reCAPTCHA de forma asíncrona.
 * Se llama automáticamente al inicio.
 */
function cargarRecaptcha() {
  if (document.getElementById("recaptcha-script")) return;
  var script = document.createElement("script");
  script.id = "recaptcha-script";
  script.src = "https://www.google.com/recaptcha/api.js?render=explicit";
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

/**
 * Ejecuta reCAPTCHA invisible y devuelve el token.
 * @returns {Promise<string>} Token de reCAPTCHA.
 */
function ejecutarRecaptcha() {
  return new Promise((resolve, reject) => {
    if (typeof grecaptcha === "undefined") {
      reject("reCAPTCHA no cargado aún. Intenta de nuevo en unos segundos.");
      return;
    }
    grecaptcha.ready(function() {
      grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: "submit" }).then(function(token) {
        resolve(token);
      }).catch(function(err) {
        reject("Error de reCAPTCHA: " + err);
      });
    });
  });
}

// ==========================================
// TOASTS (mensajes emergentes)
// ==========================================
function showToast(message, type = "success") {
  const container = document.getElementById("toast-box-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast-card ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation =
      "toast-fade-out 0.4s cubic-bezier(0.19, 1, 0.22, 1) forwards";
    toast.addEventListener("animationend", () => toast.remove());
  }, 4000);
}

// ==========================================
// RELOJ EN VIVO
// ==========================================
function updateClock() {
  const el = document.getElementById("live-clock");
  if (!el) return;
  const now = new Date();
  let h = now.getHours();
  const m    = String(now.getMinutes()).padStart(2, "0");
  const s    = String(now.getSeconds()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  el.textContent = `${String(h).padStart(2, "0")}:${m}:${s} ${ampm}`;
}
setInterval(updateClock, 1000);
updateClock();

// Cargar reCAPTCHA al iniciar
cargarRecaptcha();

// ==========================================
// NAVEGACIÓN ENTRE VISTAS
// ==========================================
function switchView(viewId) {
  const current = document.querySelector(".card-view.active");
  const target  = document.getElementById(viewId);
  if (!target || current === target) return;

  // Limpiar alertas al navegar
  document.querySelectorAll(".alert-box").forEach((el) => {
    el.className = "alert-box";
    el.style.display = "none";
  });

  if (current) current.classList.remove("active");
  target.classList.add("active");
}

// ==========================================
// VALIDACIÓN DE NOMBRE (Mayúscula inicial)
// ==========================================
function validarNombreEstricto(n) {
  const regex = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(\s[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,4}$/;
  return regex.test(n.trim());
}

// ==========================================
// ACCIÓN 1: REGISTRAR ASISTENCIA
// SEGURIDAD: Firma validada 100% en backend + reCAPTCHA
// ==========================================
function registrarAsistencia(event) {
  event.preventDefault();

  const claveInput   = document.getElementById("reg-key").value.trim().toUpperCase();
  const docenteInput = document.getElementById("reg-teacher").value;
  const grupoInput   = document.getElementById("reg-group").value;
  const tokenInput   = document.getElementById("reg-token").value.trim();
  const alertBox     = document.getElementById("alertRegistro");
  const btn          = document.getElementById("btnRegistrar");

  if (!claveInput) {
    alertBox.textContent   = "❌ Ingresa tu Clave Única de estudiante.";
    alertBox.className     = "alert-box error";
    alertBox.style.display = "block";
    return;
  }

  btn.disabled  = true;
  btn.innerHTML = "⚡ VERIFICANDO SEGURIDAD...";
  alertBox.style.display = "none";

  // Ejecutar reCAPTCHA invisible, luego enviar al backend
  ejecutarRecaptcha()
    .then((recaptchaToken) => {
      btn.innerHTML = "⚡ ENVIANDO REGISTRO...";

      const params = new URLSearchParams();
      params.append("action",    "asistencia");
      params.append("clave",     claveInput);
      params.append("docente",   docenteInput);
      params.append("grupo",     grupoInput);
      params.append("firma",     tokenInput);      // ← Validada en backend, NO local
      params.append("recaptcha", recaptchaToken); // ← Token de seguridad

      return fetch(SCRIPT_URL, { method: "POST", body: params });
    })
    .then((res) => res.json())
    .then((data) => {
      if (data.result === "success") {
        alertBox.textContent   = "✓ ¡ASISTENCIA PROCESADA CON ÉXITO! Bienvenido/a, " + (data.nombre || "");
        alertBox.className     = "alert-box success";
        alertBox.style.display = "block";
        showToast("✓ ¡Asistencia registrada exitosamente!", "success");
        document.getElementById("form-register").reset();
        setTimeout(() => switchView("view-menu"), 2500);
      } else if (data.result === "duplicated") {
        alertBox.textContent   = data.message || "⚠️ Ya registraste hoy.";
        alertBox.className     = "alert-box warning";
        alertBox.style.display = "block";
        showToast("⚠️ " + data.message, "warning");
      } else {
        alertBox.textContent   = data.message || "❌ Ocurrió un error inesperado.";
        alertBox.className     = "alert-box error";
        alertBox.style.display = "block";
        showToast("❌ " + (data.message || "Fallo al procesar."), "warning");
      }
    })
    .catch((err) => {
      alertBox.textContent   = "❌ ERROR DE RED O SEGURIDAD. Verifica tu internet e intenta de nuevo.";
      alertBox.className     = "alert-box error";
      alertBox.style.display = "block";
      showToast("❌ " + (err.message || "Error de red."), "warning");
    })
    .finally(() => {
      btn.disabled  = false;
      btn.innerHTML = "✓ Enviar Asistencia";
      // Resetear reCAPTCHA para próximo uso
      if (typeof grecaptcha !== "undefined") grecaptcha.reset();
    });
}

// ==========================================
// ACCIÓN 2: GENERAR O RECUPERAR CLAVE ÚNICA
// SEGURIDAD: reCAPTCHA en creación de claves
// ==========================================
function generarClave(event) {
  event.preventDefault();

  const nombreInput    = document.getElementById("gen-name").value.trim();
  const docenteInput   = document.getElementById("gen-teacher").value;
  const alertBox       = document.getElementById("alertGenerarClave");
  const btn            = document.getElementById("btnGenerar");
  const containerClave = document.getElementById("claveGeneradaContainer");

  // ── Validación de nombre ──
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

  // Consultar si ya existe una clave para este alumno
  fetch(`${SCRIPT_URL}?action=obtener_claves`)
    .then((res) => res.json())
    .then((data) => {
      const alumno = Array.isArray(data)
        ? data.find(
            (r) =>
              r.nombre &&
              r.nombre.trim().toLowerCase() === nombreInput.toLowerCase()
          )
        : null;

      if (alumno && alumno.clave) {
        // ── Ya tiene clave → mostrarla ──
        document.getElementById("codGenerado").textContent = alumno.clave;
        containerClave.style.display = "block";
        showToast("🔍 Clave recuperada con éxito.", "info");
        document.getElementById("form-keygen").reset();
        btn.disabled  = false;
        btn.innerHTML = "🔒 Generar Mi Clave Permanente";
      } else {
        // ── Nueva clave → crearla (con reCAPTCHA) ──
        btn.innerHTML = "⚡ VERIFICANDO SEGURIDAD...";

        ejecutarRecaptcha()
          .then((recaptchaToken) => {
            btn.innerHTML = "⚡ CREANDO CREDENCIAL...";

            let claveNueva = "";
            const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            for (let i = 0; i < 4; i++) {
              claveNueva += chars.charAt(Math.floor(Math.random() * chars.length));
            }

            const params = new URLSearchParams();
            params.append("action",    "guardar_clave");
            params.append("nombre",    nombreInput);
            params.append("clave",     claveNueva);
            params.append("docente",   docenteInput);
            params.append("recaptcha", recaptchaToken);

            return fetch(SCRIPT_URL, { method: "POST", body: params });
          })
          .then((res) => res.json())
          .then((dataPost) => {
            if (dataPost.result === "success") {
              document.getElementById("codGenerado").textContent = claveNueva;
              containerClave.style.display = "block";
              showToast("🎉 ¡Nueva clave permanente creada!", "success");
              document.getElementById("form-keygen").reset();
            } else {
              alertBox.textContent = dataPost.message || "❌ No se pudo guardar la clave.";
              alertBox.className     = "alert-box error";
              alertBox.style.display = "block";
              showToast("⚠️ " + (dataPost.message || "Error al registrar."), "warning");
            }
          })
          .catch(() => {
            alertBox.textContent   = "❌ NO SE PUDO GUARDAR EN LA BASE DE DATOS. Verifica tu conexión.";
            alertBox.className     = "alert-box error";
            alertBox.style.display = "block";
          })
          .finally(() => {
            btn.disabled  = false;
            btn.innerHTML = "🔒 Generar Mi Clave Permanente";
            if (typeof grecaptcha !== "undefined") grecaptcha.reset();
          });
      }
    })
    .catch(() => {
      alertBox.textContent   = "❌ ERROR AL CONSULTAR EL SERVIDOR. Intenta nuevamente.";
      alertBox.className     = "alert-box error";
      alertBox.style.display = "block";
      btn.disabled  = false;
      btn.innerHTML = "🔒 Generar Mi Clave Permanente";
    });
}

// ==========================================
// ACCIÓN 3: PANEL DOCENTE
// SEGURIDAD: Firma validada en backend + reCAPTCHA
// ==========================================
function unlockTeacherPanel(event) {
  if (event) event.preventDefault();

  const passwordInput    = document.getElementById("teacher-password");
  const authSection      = document.getElementById("teacher-auth");
  const dashboardSection = document.getElementById("teacher-dashboard");
  const alertBox         = document.getElementById("alertVerRegistros");
  const btnAcceder       = document.getElementById("btnAccederRegistros");

  alertBox.style.display = "none";
  btnAcceder.disabled    = true;
  btnAcceder.innerHTML   = "⚡ VERIFICANDO CREDENCIALES...";

  // ── VALIDACIÓN EN BACKEND: Enviar firma al servidor para validar ──
  const firma = passwordInput.value.trim();

  fetch(`${SCRIPT_URL}?action=validar_firma&firma=${encodeURIComponent(firma)}`)
    .then((res) => res.json())
    .then((validacion) => {
      if (!validacion.valido) {
        alertBox.textContent   = "❌ CREDENCIAL DE ACCESO DENEGADA.";
        alertBox.className     = "alert-box error";
        alertBox.style.display = "block";
        showToast("❌ Acceso incorrecto.", "warning");
        passwordInput.focus();
        btnAcceder.disabled  = false;
        btnAcceder.innerHTML = "🔓 Entrar";
        return;
      }

      // Firma válida → cargar datos
      btnAcceder.innerHTML = "⚡ CARGANDO PANEL...";

      return fetch(`${SCRIPT_URL}?action=obtener_registros`)
        .then((res) => res.json())
        .then((data) => {
          authSection.style.display = "none";
          dashboardSection.classList.add("visible");
          showToast("🔓 Modo Administrador Activo", "success");

          // ── Tabla global ──
          const tablaCuerpo = document.getElementById("tabla-api-cuerpo");
          tablaCuerpo.innerHTML = "";

          if (!Array.isArray(data) || data.length === 0) {
            tablaCuerpo.innerHTML = `
              <tr>
                <td colspan="5" style="text-align:center; padding:2rem; opacity:0.5;">
                  No hay registros globales en el servidor.
                </td>
              </tr>`;
          } else {
            data.forEach((r) => {
              const fila = document.createElement("tr");
              fila.style.borderBottom = "1px solid var(--text-color)";
              fila.innerHTML = `
                <td style="padding:0.6rem; border-right:1px solid var(--text-color); font-weight:700;">${r.nombre  || "—"}</td>
                <td style="padding:0.6rem; border-right:1px solid var(--text-color); font-variant-numeric:tabular-nums;">${r.clave   || "—"}</td>
                <td style="padding:0.6rem; border-right:1px solid var(--text-color);">${r.grupo   || "—"}</td>
                <td style="padding:0.6rem; border-right:1px solid var(--text-color);">${r.docente || "—"}</td>
                <td style="padding:0.6rem; font-variant-numeric:tabular-nums; opacity:0.8;">${r.hora    || "—"}</td>
              `;
              tablaCuerpo.appendChild(fila);
            });
          }

          // ── Filtrar registros de HOY ──
          const ahora   = new Date(
            new Date().toLocaleString("en-US", { timeZone: "America/El_Salvador" })
          );
          const diaHoy  = String(ahora.getDate()).padStart(2, "0");
          const mesHoy  = String(ahora.getMonth() + 1).padStart(2, "0");
          const anioHoy = ahora.getFullYear();
          const hoyStr  = `${diaHoy}/${mesHoy}/${anioHoy}`;

          const filtrados = (Array.isArray(data) ? data : []).filter((r) => {
            if (!r.fecha) return false;
            const partes = r.fecha.replace(/-/g, "/").split("/");
            if (partes.length !== 3) return false;
            const norm = `${partes[0].padStart(2,"0")}/${partes[1].padStart(2,"0")}/${partes[2]}`;
            return norm === hoyStr;
          });

          document.getElementById("count-morning").textContent   =
            filtrados.filter((r) => r.grupo === "Mañana").length;
          document.getElementById("count-afternoon").textContent =
            filtrados.filter((r) => r.grupo === "Tarde").length;

          // ── Lista rápida de hoy ──
          const contenedor = document.getElementById("listaRegistros");
          contenedor.innerHTML = "";

          if (filtrados.length === 0) {
            contenedor.innerHTML = `
              <div class="registro-item" style="text-align:center; opacity:0.5;">
                No hay asistencias registradas hoy.
              </div>`;
          } else {
            filtrados.forEach((r) => {
              const item = document.createElement("div");
              item.className = "registro-item";
              item.innerHTML = `
                <strong>${r.nombre}</strong> — ${r.grupo}<br>
                <small style="opacity:0.7;">
                  Clave: ${r.clave} | Docente: ${r.docente} | Hora: ${r.hora}
                </small>`;
              contenedor.appendChild(item);
            });
          }
        });
    })
    .catch(() => {
      alertBox.textContent   = "❌ ERROR AL VALIDAR CREDENCIALES. Intenta de nuevo.";
      alertBox.className     = "alert-box error";
      alertBox.style.display = "block";
    })
    .finally(() => {
      btnAcceder.disabled  = false;
      btnAcceder.innerHTML = "🔓 Entrar";
      passwordInput.value  = "";
    });
}

// ==========================================
// CERRAR PANEL Y VOLVER
// ==========================================
function lockAndReturn() {
  const dashboard = document.getElementById("teacher-dashboard");
  const auth      = document.getElementById("teacher-auth");
  if (dashboard) dashboard.classList.remove("visible");
  if (auth)      auth.style.display = "block";
  switchView("view-menu");
}

// ==========================================
// ACCIÓN 4: LIMPIAR Y ARCHIVAR ASISTENCIAS
// SEGURIDAD: reCAPTCHA obligatorio
// ==========================================
function triggerClearAll() {
  if (
    !confirm(
      "🚨 ¿Estás completamente seguro de que deseas limpiar y archivar todos los registros del día?"
    )
  )
    return;

  showToast("⚡ Verificando seguridad...", "info");

  ejecutarRecaptcha()
    .then((recaptchaToken) => {
      const params = new URLSearchParams();
      params.append("action",    "limpiar_asistencias");
      params.append("recaptcha", recaptchaToken);

      return fetch(SCRIPT_URL, { method: "POST", body: params });
    })
    .then((res) => res.json())
    .then((data) => {
      if (data.result === "success") {
        showToast("🗑 Registros archivados con éxito.", "success");
        alert("Registros guardados en Historial y limpiados correctamente.");
        lockAndReturn();
      } else {
        showToast("❌ " + (data.message || "Error al limpiar."), "warning");
      }
    })
    .catch(() => {
      showToast("❌ Error al reiniciar el día. Intenta de nuevo.", "warning");
    })
    .finally(() => {
      if (typeof grecaptcha !== "undefined") grecaptcha.reset();
    });
}
