// ==========================================
// CONFIGURACIÓN GLOBAL
// ==========================================
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzZbYGeNZXsgiw56Q3rk-vBQMCThOMI2qvVxLCTzO2QKG8YHebTlfQEegL2Lk2sDTC5/exec";

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
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  
  hours = hours % 12;
  hours = hours ? hours : 12; // El número '0' se transforma en '12'
  const hoursStr = String(hours).padStart(2, "0");

  clockElement.textContent = `${hoursStr}:${minutes}:${seconds} ${ampm}`;
}
setInterval(updateClock, 1000);
updateClock();

// Gestión de Navegación entre Pantallas
function switchView(viewId) {
  // Ocultar todas las vistas removiendo la clase activa
  document.querySelectorAll(".form-section").forEach((section) => {
    section.classList.remove("active");
  });
  // Mostrar la vista seleccionada
  const targetView = document.getElementById(viewId);
  if (targetView) {
    targetView.classList.add("active");
  }
}

// ==========================================
// CONTROL DE ASISTENCIA (ALUMNOS)
// ==========================================
function enviarAsistencia() {
  const btn = document.getElementById("btnEnviarAsistencia");
  const alertBox = document.getElementById("alumno-alert");
  const claveInput = document.getElementById("alumno-clave");
  const grupoInput = document.getElementById("alumno-grupo");
  const docenteInput = document.getElementById("alumno-docente");

  const clave = claveInput.value.trim();
  const grupo = grupoInput.value;
  const docente = docenteInput.value;

  if (!clave || !grupo || !docente) {
    alertBox.textContent = "⚠️ POR FAVOR, LLENA TODOS LOS CAMPOS REQUERIDOS.";
    alertBox.className = "alert-box error";
    return;
  }

  // Bloquear botón y mostrar estado de carga
  btn.disabled = true;
  btn.innerHTML = `<span>⏳ Procesando...</span>`;
  alertBox.textContent = "📡 Verificando credenciales con el servidor...";
  alertBox.className = "alert-box info";

  const params = new URLSearchParams();
  params.append("action", "asistencia");
  params.append("clave", clave);
  params.append("grupo", grupo);
  params.append("docente", docente);

  fetch(SCRIPT_URL, {
    method: "POST",
    body: params,
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.status === "success") {
        showToast(`🎉 ¡Perfecto! ${data.nombre}, asistencia registrada.`, "success");
        alertBox.textContent = `✅ REGISTRO EXITOSO: ¡Bienvenido(a), ${data.nombre}!`;
        alertBox.className = "alert-box success";
        claveInput.value = "";
      } else {
        alertBox.textContent = `❌ ERROR: ${data.message}`;
        alertBox.className = "alert-box error";
      }
    })
    .catch((err) => {
      alertBox.textContent = "❌ ERROR CRÍTICO DE CONEXIÓN CON EL SERVIDOR.";
      alertBox.className = "alert-box error";
    })
    .finally(() => {
      btn.disabled = false;
      btn.innerHTML = "✓ Enviar Asistencia";
    });
}

// ==========================================
// PANEL DE CONTROL (DOCENTE)
// ==========================================
function accederRegistros() {
  const passwordInput = document.getElementById("teacher-password");
  const alertBox = document.getElementById("teacher-alert");
  const password = passwordInput.value.trim();
  
  // Validación matemática con la clave dinámica del día
  const claveCorrecta = obtenerClaveDinamica();

  if (password !== claveCorrecta) {
    alertBox.textContent = "❌ CLAVE DE ACCESO INCORRECTA O EXPIRADA.";
    alertBox.className = "alert-box error";
    passwordInput.value = "";
    return;
  }

  // Si la contraseña coincide localmente, desbloquea la interfaz y hace el fetch
  alertBox.textContent = "🔓 Acceso correcto. Cargando registros...";
  alertBox.className = "alert-box success";
  
  document.getElementById("btnAccederRegistros").disabled = true;
  document.getElementById("btnAccederRegistros").innerHTML = "⏳ Cargando...";

  fetch(`${SCRIPT_URL}?action=obtener_asistencias`)
    .then((res) => res.json())
    .then((data) => {
      // Activar vista del dashboard docente
      document.getElementById("teacher-auth").style.display = "none";
      document.getElementById("teacher-dashboard").classList.add("visible");
      showToast("📊 Panel de control actualizado en tiempo real.", "success");

      const tbody = document.getElementById("tablaAsistenciasBody");
      const contenedor = document.getElementById("listaRegistros");
      
      tbody.innerHTML = "";
      contenedor.innerHTML = "";

      // Contadores de turnos
      let mañana = 0;
      let tarde = 0;

      if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; opacity:0.5;">No hay registros el día de hoy.</td></tr>`;
        contenedor.innerHTML = `<p style="opacity:0.5; font-size:13px;">No hay actividades registradas aún.</p>`;
        document.getElementById("count-morning").textContent = "0";
        document.getElementById("count-afternoon").textContent = "0";
      } else {
        // Ordenar del más reciente al más antiguo
        data.reverse();

        data.forEach((r) => {
          // Filtrar contadores por grupo
          if (r.grupo === "MAÑANA") mañana++;
          if (r.grupo === "TARDE") tarde++;

          // Inyectar en tabla principal
          const fila = document.createElement("tr");
          fila.innerHTML = `
            <td><strong>${r.hora}</strong></td>
            <td>${r.nombre}</td>
            <td><span class="badge-nie">${r.clave}</span></td>
            <td>${r.grupo}</td>
            <td>${r.docente}</td>
            <td><span class="status-indicator active"></span> En clase</td>
          `;
          tbody.appendChild(fila);

          // Inyectar en lista rápida/logs de abajo
          const item = document.createElement("div");
          item.className = "registro-item";
          item.innerHTML = `<p><strong>${r.nombre}</strong></p>
                            <small>Clave: ${r.clave} | Docente: ${r.docente} | Hora: ${r.hora}</small>`;
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
}

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
