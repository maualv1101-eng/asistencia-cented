// ==========================================
// CONFIGURACIÓN GLOBAL
// ==========================================
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwI9jGpQ3SzxzQz914jUX4nPazP4FCGad1mf8BoBRSubqxzowPXJaHjWyppW8zbi1Zh/exec";

// Generador de Clave Dinámica Diaria (Sincronizado matemáticamente con tu Apps Script)
function obtenerClaveDinamica() {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = hoy.getMonth() + 1;
  const dia = hoy.getDate();
  
  const codigoMatematico = ((anio * dia) + (mes * 77)) % 900000 + 100000;
  return Math.floor(codigoMatematico).toString();
}

// LÓGICA DE MENSAJES EMERGENTES (TOASTS)
function showToast(message, type = "success") {
  const container = document.getElementById("toast-box-container");
  if (!container) return;
  
  const toast = document.createElement("div");
  toast.className = `toast-card ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Remover de forma fluida a los 4 segundos
  setTimeout(() => {
    toast.style.animation = "toast-fade-out 0.4s cubic-bezier(0.19, 1, 0.22, 1) forwards";
    toast.addEventListener("animationend", () => {
      toast.remove();
    });
  }, 4000);
}

// Reloj En Vivo
function updateClock() {
  const clockElement = document.getElementById("live-clock");
  if (!clockElement) return;
  const now = new Date();
  let hours = now.getHours();
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const seconds = now.getSeconds().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  
  hours = hours % 12;
  hours = hours ? hours : 12; // Formato 12 horas
  
  clockElement.textContent = `${hours}:${minutes}:${seconds} ${ampm}`;
}
setInterval(updateClock, 1000);
updateClock();

// Gestión de Vistas (Tabs / Secciones)
function switchView(viewId) {
  document.querySelectorAll(".view-section").forEach((section) => {
    section.classList.remove("active");
  });
  const target = document.getElementById(viewId);
  if (target) target.classList.add("active");
}

// ==========================================
// ACCIÓN: REGISTRO DE ASISTENCIA (ALUMNOS)
// ==========================================
document.getElementById("formAsistencia").addEventListener("submit", function (e) {
  e.preventDefault();

  const claveInput = document.getElementById("student-id").value.trim();
  const grupoInput = document.getElementById("student-group").value;
  const docenteInput = document.getElementById("student-teacher").value;
  const btnSubmit = document.getElementById("btnEnviarAsistencia");

  if (!claveInput || !grupoInput || !docenteInput) {
    showToast("⚠️ Por favor, completa todos los campos requeridos.", "warning");
    return;
  }

  btnSubmit.disabled = true;
  btnSubmit.innerHTML = `<span class="spinner"></span> Registrando...`;

  const params = new URLSearchParams();
  params.append("action", "asistencia");
  params.append("clave", claveInput);
  params.append("grupo", grupoInput);
  params.append("docente", docenteInput);

  fetch(SCRIPT_URL, {
    method: "POST",
    body: params,
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.status === "success") {
        showToast(`🎉 ¡Perfecto! Asistencia registrada para: ${data.nombre}`, "success");
        document.getElementById("student-id").value = "";
      } else {
        showToast(`❌ Error: ${data.message}`, "warning");
      }
    })
    .catch((err) => {
      showToast("❌ Hubo un fallo en la conexión con el servidor.", "warning");
    })
    .finally(() => {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = "✅ Registrar Mi Entrada";
    });
});

// ==========================================
// PANEL DE CONTROL (DOCENTES) - VALIDACIÓN DINÁMICA
// ==========================================
document.getElementById("btnAccederRegistros").addEventListener("click", function () {
  const passwordInput = document.getElementById("password-teacher");
  const alertBox = document.getElementById("alert-teacher-auth");
  
  const claveIngresada = passwordInput.value.trim();
  const claveCorrectaValida = obtenerClaveDinamica();

  // Validar directamente contra el generador matemático de 6 dígitos
  if (claveIngresada !== claveCorrectaValida) {
    alertBox.textContent = "❌ CLAVE DE ACCESO INCORRECTA.";
    alertBox.className = "alert-box error";
    passwordInput.value = "";
    return;
  }

  // Si pasa la validación, procesar acceso y traer datos
  alertBox.textContent = "🔓 Acceso concedido de forma segura. Cargando...";
  alertBox.className = "alert-box success";
  document.getElementById("btnAccederRegistros").disabled = true;
  document.getElementById("btnAccederRegistros").innerHTML = "Cargando...";

  const params = new URLSearchParams();
  params.append("action", "obtener_asistencias");

  fetch(SCRIPT_URL, {
    method: "POST",
    body: params,
  })
    .then((response) => response.json())
    .then((data) => {
      document.getElementById("teacher-auth").style.display = "none";
      document.getElementById("teacher-dashboard").classList.add("visible");
      alertBox.textContent = "";
      alertBox.className = "alert-box";

      const tablaBody = document.querySelector("#tablaAsistencias tbody");
      const contenedor = document.getElementById("listaRegistros");
      tablaBody.innerHTML = "";
      contenedor.innerHTML = "";

      if (data.length === 0) {
        tablaBody.innerHTML = `<tr><td colspan="5" style="text-align:center; opacity:0.6;">No hay registros para este día.</td></tr>`;
        contenedor.innerHTML = `<p style="opacity:0.5; font-size:0.9rem;">Sin logs disponibles hoy.</p>`;
        document.getElementById("count-morning").textContent = "0";
        document.getElementById("count-afternoon").textContent = "0";
      } else {
        let mañana = 0;
        let tarde = 0;

        data.forEach((r) => {
          if (r.grupo === "Mañana") mañana++;
          if (r.grupo === "Tarde") tarde++;

          // Inyectar en tabla estructural
          const fila = document.createElement("tr");
          fila.innerHTML = `
            <td><strong>${r.fecha}</strong></td>
            <td><span class="badge-time">${r.hora}</span></td>
            <td><strong>${r.nombre}</strong></td>
            <td><small class="text-muted">${r.clave}</small></td>
            <td><span class="badge-group ${r.grupo === "Mañana" ? "morning" : "afternoon"}">${r.grupo}</span></td>
          `;
          tablaBody.appendChild(fila);

          // Inyectar en logs rápidos inferiores
          const item = document.createElement("div");
          item.className = "registro-item";
          item.innerHTML = `🌟 <strong>${r.nombre}</strong> <br> <small class="text-muted">ID: ${r.clave} | Docente: ${r.docente} | Hora: ${r.hora}</small>`;
          contenedor.appendChild(item);
        });

        // Actualizar contadores visuales
        document.getElementById("count-morning").textContent = mañana;
        document.getElementById("count-afternoon").textContent = tarde;
      }
    })
    .catch((err) => {
      alertBox.textContent = "❌ ERROR AL TRAER LOS REGISTROS DESDE EL SERVIDOR.";
      alertBox.className = "alert-box error";
    })
    .finally(() => {
      document.getElementById("btnAccederRegistros").disabled = false;
      document.getElementById("btnAccederRegistros").innerHTML = "🔓 Entrar";
      passwordInput.value = "";
    });
});

function lockAndReturn() {
  document.getElementById("teacher-dashboard").classList.remove("visible");
  document.getElementById("teacher-auth").style.display = "block";
  switchView("view-menu");
}

function triggerClearAll() {
  if (confirm("🚨 ¿Estás completamente seguro de que deseas limpiar y archivar todos los registros del día?")) {
    const params = new URLSearchParams();
    params.append("action", "limpiar_asistencias");

    fetch(SCRIPT_URL, { method: "POST", body: params })
      .then(() => {
        showToast("🗑 Registros archivados con éxito.", "success");
        alert("Registros guardados en Historial y limpiados correctamente.");
        lockAndReturn();
      })
      .catch(() => showToast("❌ Error al reiniciar el día.", "warning"));
  }
}
