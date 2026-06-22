// ==========================================
// CONFIGURACIÓN GLOBAL
// ==========================================
const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyC6MxEdmWYLn4opzniRV958AHWFizwUgIfKXIjulW4wp-suDcWW8hJxvl_T4Nwto_b/exec";

/**
 * Genera la clave dinámica del día basada en la fecha de El Salvador (GMT-6).
 * Algoritmo idéntico al del backend en Apps Script.
 */
function obtenerClaveMaestraDinamica() {
  const fechaTz = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/El_Salvador" })
  );
  const day   = fechaTz.getDate();
  const month = fechaTz.getMonth() + 1;
  const year  = fechaTz.getFullYear();
  const val   = (day * 8321) + (month * 9413) + (year * 7123);
  const code  = (val * 1543) % 900000 + 100000;
  return String(code);
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

// ==========================================
// NAVEGACIÓN ENTRE VISTAS
// FIX: se eliminó la manipulación de opacity/transform sobre elementos
//      con display:none que no tenía efecto. La transición queda 100%
//      en la animación CSS @keyframes fadeInView.
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
// FIX: la firma se valida localmente (el backend actual en codigo_apps_script.gs
//      no requiere firma en el POST de asistencia). Si usas el backend con
//      seguridad completa (DEPLY_EXCEL.txt), descomenta params.append("firma",...).
// ==========================================
function registrarAsistencia(event) {
  event.preventDefault();

  const claveInput  = document.getElementById("reg-key").value.trim().toUpperCase();
  const docenteInput = document.getElementById("reg-teacher").value;
  const grupoInput  = document.getElementById("reg-group").value;
  const tokenInput  = document.getElementById("reg-token").value.trim();
  const alertBox    = document.getElementById("alertRegistro");
  const btn         = document.getElementById("btnRegistrar");

  // ── Validación local de firma ──
  if (tokenInput !== obtenerClaveMaestraDinamica()) {
    alertBox.textContent   = "❌ LA FIRMA DEL DOCENTE ES INCORRECTA.";
    alertBox.className     = "alert-box error";
    alertBox.style.display = "block";
    showToast("❌ Firma denegada.", "warning");
    return;
  }

  if (!claveInput) {
    alertBox.textContent   = "❌ Ingresa tu Clave Única de estudiante.";
    alertBox.className     = "alert-box error";
    alertBox.style.display = "block";
    return;
  }

  btn.disabled  = true;
  btn.innerHTML = "⚡ ENVIANDO REGISTRO...";
  alertBox.style.display = "none";

  const params = new URLSearchParams();
  params.append("action",  "asistencia");
  params.append("clave",   claveInput);
  params.append("docente", docenteInput);
  params.append("grupo",   grupoInput);
  // Descomenta si usas backend con firma obligatoria:
  // params.append("firma", tokenInput);

  fetch(SCRIPT_URL, { method: "POST", body: params })
    .then((res) => res.json())
    .then((data) => {
      if (data.result === "success") {
        alertBox.textContent   = "✓ ¡ASISTENCIA PROCESADA CON ÉXITO!";
        alertBox.className     = "alert-box success";
        alertBox.style.display = "block";
        showToast("✓ ¡Asistencia registrada exitosamente!", "success");
        document.getElementById("form-register").reset();
        setTimeout(() => switchView("view-menu"), 2500);
      } else {
        alertBox.textContent   = data.message || "❌ Ocurrió un error inesperado.";
        alertBox.className     = "alert-box error";
        alertBox.style.display = "block";
        showToast("⚠️ " + (data.result === "duplicated" ? "Ya registraste hoy." : "Fallo al procesar."), "warning");
      }
    })
    .catch(() => {
      alertBox.textContent   = "❌ ERROR DE RED O CONEXIÓN. Verifica tu internet e intenta de nuevo.";
      alertBox.className     = "alert-box error";
      alertBox.style.display = "block";
      showToast("❌ Error de red.", "warning");
    })
    .finally(() => {
      btn.disabled  = false;
      btn.innerHTML = "✓ Enviar Asistencia";
    });
}

// ==========================================
// ACCIÓN 2: GENERAR O RECUPERAR CLAVE ÚNICA
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
        // ── Nueva clave → crearla ──
        btn.innerHTML = "⚡ CREANDO CREDENCIAL...";

        let claveNueva = "";
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        for (let i = 0; i < 4; i++) {
          claveNueva += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        const params = new URLSearchParams();
        params.append("action",  "guardar_clave");
        params.append("nombre",  nombreInput);
        params.append("clave",   claveNueva);
        params.append("docente", docenteInput);

        fetch(SCRIPT_URL, { method: "POST", body: params })
          .then((res) => res.json())
          .then((dataPost) => {
            if (dataPost.result === "success") {
              document.getElementById("codGenerado").textContent = claveNueva;
              containerClave.style.display = "block";
              showToast("🎉 ¡Nueva clave permanente creada!", "success");
              document.getElementById("form-keygen").reset();
            } else {
              // Puede ser "duplicated" si otro submit llegó al mismo tiempo
              if (dataPost.result === "duplicated") {
                alertBox.textContent = dataPost.message;
              } else {
                alertBox.textContent = dataPost.message || "❌ No se pudo guardar la clave.";
              }
              alertBox.className     = "alert-box error";
              alertBox.style.display = "block";
              showToast("⚠️ Error al registrar.", "warning");
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
// FIX CRÍTICO: la función no tenía el parámetro "event", por lo que el
//   formulario hacía submit nativo y recargaba la página entera sin
//   ejecutar ningún código. Ahora recibe event y llama preventDefault().
// ==========================================
function unlockTeacherPanel(event) {
  if (event) event.preventDefault(); // ← FIX crítico

  const passwordInput    = document.getElementById("teacher-password");
  const authSection      = document.getElementById("teacher-auth");
  const dashboardSection = document.getElementById("teacher-dashboard");
  const alertBox         = document.getElementById("alertVerRegistros");
  const btnAcceder       = document.getElementById("btnAccederRegistros");

  // ── Validación local de clave dinámica ──
  if (passwordInput.value.trim() !== obtenerClaveMaestraDinamica()) {
    alertBox.textContent   = "❌ CREDENCIAL DE ACCESO DENEGADA.";
    alertBox.className     = "alert-box error";
    alertBox.style.display = "block";
    showToast("❌ Acceso incorrecto.", "warning");
    passwordInput.focus();
    return;
  }

  alertBox.style.display = "none";
  btnAcceder.disabled    = true;
  btnAcceder.innerHTML   = "⚡ CARGANDO PANEL...";

  fetch(`${SCRIPT_URL}?action=obtener_registros`)
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
      // FIX: normalizamos la fecha para que coincida con el formato dd/MM/yyyy
      //      que devuelve el backend, independientemente del locale del navegador.
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
    })
    .catch(() => {
      alertBox.textContent   = "❌ ERROR AL TRAER LOS REGISTROS DESDE EL SERVIDOR.";
      alertBox.className     = "alert-box error";
      alertBox.style.display = "block";
      // Mostrar de nuevo el formulario de auth si falla la carga
      authSection.style.display = "block";
      dashboardSection.classList.remove("visible");
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
// ==========================================
function triggerClearAll() {
  if (
    !confirm(
      "🚨 ¿Estás completamente seguro de que deseas limpiar y archivar todos los registros del día?"
    )
  )
    return;

  const params = new URLSearchParams();
  params.append("action", "limpiar_asistencias");

  fetch(SCRIPT_URL, { method: "POST", body: params })
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
    .catch(() => showToast("❌ Error al reiniciar el día. Intenta de nuevo.", "warning"));
}
