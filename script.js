// ==========================================
// CONFIGURACIÓN GLOBAL (SIN CLAVE ESTÁTICA)
// ==========================================
const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwaQ2rD14gF_QeDbEFcdg6uJVzwjkcdqFGrUWliGBj41xrLTWZnYOj877mEdIitdg40/exec";
// ⚠️ PENDIENTE MANUAL: Redesplegar Apps Script con nueva URL y hacer el repo privado en GitHub.

// FIX #1: obtenerClaveMaestraDinamica() ELIMINADA del frontend.
// El algoritmo ahora vive SOLO en el Apps Script (backend).
// La firma viaja como parámetro y el backend la valida.

// FIX #12: Fetch con timeout de 10 segundos usando AbortController
function fetchConTimeout(url, opciones = {}, ms = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opciones, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// FIX #20: Sanitizar caracteres HTML peligrosos en inputs de texto
function sanitizarTexto(str) {
  return str.replace(/[<>&"']/g, "");
}

// FIX #13: Crear celda de tabla segura sin innerHTML
function crearCeldaSegura(texto, estiloExtra = "") {
  const td = document.createElement("td");
  td.style.cssText = "padding: 0.6rem; border-right: 1px solid var(--text-color);" + estiloExtra;
  td.textContent = texto || "—";
  return td;
}

// LÓGICA DE MENSAJES EMERGENTES (TOASTS)
function showToast(message, type = "success") {
  const container = document.getElementById("toast-box-container");
  const toast = document.createElement("div");
  toast.className = `toast-card ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

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
  hours = hours ? hours : 12;
  clockElement.textContent = `${String(hours).padStart(2, "0")}:${minutes}:${seconds} ${ampm}`;
}
setInterval(updateClock, 1000);
updateClock();

// Control de Navegación entre Pantallas
function switchView(viewId) {
  const targetView = document.getElementById(viewId);
  if (!targetView) return;

  // Limpiar alertas al cambiar de pantalla
  document.querySelectorAll(".alert-box").forEach((el) => {
    el.className = "alert-box";
    el.style.display = "none";
  });

  // Quitar active de todas y ponerla en la destino — CSS maneja la transición
  document.querySelectorAll(".card-view").forEach((v) => v.classList.remove("active"));
  targetView.classList.add("active");
}

function validarNombreEstricto(n) {
  const regex = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(\s[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,4}$/;
  return regex.test(n.trim());
}

// ==========================================
// ACCIÓN 1: ACCIONAR ASISTENCIA
// ==========================================
function registrarAsistencia(event) {
  event.preventDefault();

  const claveInput = document.getElementById("reg-key").value.trim().toUpperCase();
  const docenteInput = document.getElementById("reg-teacher").value;
  const grupoInput = document.getElementById("reg-group").value;
  const tokenInput = document.getElementById("reg-token").value.trim();

  const alertBox = document.getElementById("alertRegistro");
  const btn = document.getElementById("btnRegistrar");

  // FIX #16: Validar formato exacto antes de enviar al servidor
  if (!/^[A-Z0-9]{4}$/.test(claveInput)) {
    alertBox.textContent = "❌ LA CLAVE DEBE SER EXACTAMENTE 4 CARACTERES ALFANUMÉRICOS.";
    alertBox.className = "alert-box error";
    showToast("❌ Formato de clave inválido.", "warning");
    return;
  }

  // FIX #4: Rate limiting — cooldown de 30 segundos entre envíos
  const ultimoEnvio = localStorage.getItem("ultimo_envio_asistencia");
  const ahora = Date.now();
  if (ultimoEnvio && ahora - parseInt(ultimoEnvio) < 30000) {
    const restante = Math.ceil((30000 - (ahora - parseInt(ultimoEnvio))) / 1000);
    alertBox.textContent = `⏳ Espera ${restante} segundos antes de volver a registrar.`;
    alertBox.className = "alert-box warning";
    showToast(`⏳ Espera ${restante}s.`, "warning");
    return;
  }

  // FIX #1: La firma ya NO se valida en el frontend.
  // Se envía al backend para que el Apps Script la verifique.

  btn.disabled = true;
  btn.innerHTML = `⚡ ENVIANDO REGISTRO...`;

  const params = new URLSearchParams();
  params.append("action", "asistencia");
  params.append("clave", claveInput);
  params.append("docente", docenteInput);
  params.append("grupo", grupoInput);
  params.append("firma", tokenInput); // FIX #1: firma viaja al backend

  // FIX #12: fetchConTimeout en lugar de fetch directo
  fetchConTimeout(SCRIPT_URL, { method: "POST", body: params })
    .then((res) => {
      // FIX #21: Verificar HTTP status antes de parsear
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then((data) => {
      if (data.result === "success") {
        alertBox.textContent = "✓ ¡ASISTENCIA PROCESADA CON ÉXITO!";
        alertBox.className = "alert-box success";
        showToast("✓ ¡Asistencia registrada exitosamente!", "success");
        document.getElementById("form-register").reset();
        // FIX #4: Guardar timestamp del envío exitoso
        localStorage.setItem("ultimo_envio_asistencia", Date.now());
        setTimeout(() => {
          switchView("view-menu");
        }, 2000);
      } else {
        alertBox.textContent = data.message;
        alertBox.className = "alert-box error";
        showToast("⚠️ Fallo al procesar.", "warning");
      }
    })
    .catch((err) => {
      if (err.name === "AbortError") {
        alertBox.textContent = "❌ TIEMPO DE ESPERA AGOTADO. Intenta de nuevo.";
      } else {
        alertBox.textContent = "❌ ERROR DE RED O CONEXIÓN.";
      }
      alertBox.className = "alert-box error";
      showToast("❌ Error crítico de red.", "warning");
    })
    .finally(() => {
      btn.disabled = false;
      btn.innerHTML = `✓ Enviar Asistencia`;
    });
}

// ==========================================
// ACCIÓN 2: GENERAR O RECORDAR CLAVE ÚNICA
// ==========================================
function generarClave(event) {
  event.preventDefault();

  // FIX #20: Sanitizar nombre antes de usarlo
  const nombreInput = sanitizarTexto(document.getElementById("gen-name").value.trim());
  const docenteInput = document.getElementById("gen-teacher").value;
  const alertBox = document.getElementById("alertGenerarClave");
  const btn = document.getElementById("btnGenerar");
  const containerClave = document.getElementById("claveGeneradaContainer");

  if (!validarNombreEstricto(nombreInput)) {
    alertBox.textContent = "❌ FORMATO ERRÓNEO. USA MAYÚSCULAS INICIALES (EJ: Carlos David).";
    alertBox.className = "alert-box error";
    showToast("❌ Nombre inválido. Revisa las iniciales.", "warning");
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `⚡ CONSULTANDO BASE DE DATOS...`;
  containerClave.style.display = "none";

  // FIX #18: Ya no se pide obtener_claves (lista completa).
  // Se consulta obtener_clave_alumno con el nombre específico.
  fetchConTimeout(`${SCRIPT_URL}?action=obtener_clave_alumno&nombre=${encodeURIComponent(nombreInput)}`)
    .then((res) => {
      // FIX #21: Verificar HTTP status
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then((data) => {
      if (data.clave) {
        // Alumno ya existe → mostrar su clave
        document.getElementById("codGenerado").textContent = data.clave;
        containerClave.style.display = "block";
        alertBox.style.display = "none";
        showToast("🔍 Clave recuperada con éxito.", "info");
        document.getElementById("form-keygen").reset();
        btn.disabled = false;
        btn.innerHTML = `🔒 Generar Mi Clave Permanente`;
      } else {
        // FIX #23: claveNueva se declara aquí en el else, no antes
        btn.innerHTML = `⚡ CREANDO CREDENCIAL...`;

        // FIX #6: crypto.getRandomValues en lugar de Math.random
        let claveNueva = "";
        const caracteres = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        const array = new Uint32Array(4);
        crypto.getRandomValues(array);
        for (let i = 0; i < 4; i++) {
          claveNueva += caracteres.charAt(array[i] % caracteres.length);
        }

        const params = new URLSearchParams();
        params.append("action", "guardar_clave");
        params.append("nombre", nombreInput);
        params.append("clave", claveNueva);
        params.append("docente", docenteInput);

        // FIX #12: fetchConTimeout en el POST interno también
        fetchConTimeout(SCRIPT_URL, { method: "POST", body: params })
          .then((res) => {
            // FIX #21: Verificar HTTP status
            if (!res.ok) throw new Error("HTTP " + res.status);
            return res.json();
          })
          .then((dataPost) => {
            if (dataPost.result === "success") {
              document.getElementById("codGenerado").textContent = claveNueva;
              containerClave.style.display = "block";
              alertBox.style.display = "none";
              showToast("🎉 ¡Tu nueva clave permanente fue creada!", "success");
              document.getElementById("form-keygen").reset();
            } else {
              alertBox.textContent = dataPost.message;
              alertBox.className = "alert-box error";
              showToast("⚠️ Error al registrar.", "warning");
            }
          })
          .catch((err) => {
            if (err.name === "AbortError") {
              alertBox.textContent = "❌ TIEMPO DE ESPERA AGOTADO. Intenta de nuevo.";
            } else {
              alertBox.textContent = "❌ NO SE PUDO GUARDAR EN LA BASE DE DATOS.";
            }
            alertBox.className = "alert-box error";
          })
          .finally(() => {
            btn.disabled = false;
            btn.innerHTML = `🔒 Generar Mi Clave Permanente`;
          });
      }
    })
    .catch((err) => {
      if (err.name === "AbortError") {
        alertBox.textContent = "❌ TIEMPO DE ESPERA AGOTADO. Intenta de nuevo.";
      } else {
        alertBox.textContent = "❌ ERROR AL CONSULTAR EL SERVIDOR.";
      }
      alertBox.className = "alert-box error";
      btn.disabled = false;
      btn.innerHTML = `🔒 Generar Mi Clave Permanente`;
    });
}

// ==========================================
// ACCIÓN 3: PANEL DEL DOCENTE Y CARGA DE DATOS
// ==========================================
function unlockTeacherPanel() {
  const passwordInput = document.getElementById("teacher-password");
  const authSection = document.getElementById("teacher-auth");
  const dashboardSection = document.getElementById("teacher-dashboard");
  const alertBox = document.getElementById("alertVerRegistros");

  const firmaIngresada = passwordInput.value.trim();

  if (!firmaIngresada) {
    alertBox.textContent = "❌ INGRESA LA CLAVE DE VALIDACIÓN.";
    alertBox.className = "alert-box error";
    return;
  }

  // FIX #1 + #7: La validación de la firma la hace el backend.
  // Se manda la firma en el GET y el Apps Script responde si es válida o error.
  alertBox.style.display = "none";
  document.getElementById("btnAccederRegistros").disabled = true;
  document.getElementById("btnAccederRegistros").innerHTML = "⚡ CARGANDO PANEL...";

  // FIX #12: fetchConTimeout
  fetchConTimeout(`${SCRIPT_URL}?action=obtener_registros&firma=${encodeURIComponent(firmaIngresada)}`)
    .then((res) => {
      // FIX #21: Verificar HTTP status
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then((data) => {
      // Si el backend rechaza la firma
      if (data.error) {
        alertBox.textContent = "❌ CREDENCIAL DE ACCESO DENEGADA.";
        alertBox.className = "alert-box error";
        showToast("❌ Acceso Incorrecto.", "warning");
        passwordInput.focus();
        return;
      }

      authSection.style.display = "none";
      dashboardSection.classList.add("visible");
      showToast("🔓 Modo Administrador Activo", "success");

      // FIX #13: Construir tabla con crearCeldaSegura (sin innerHTML con datos del servidor)
      const tablaCuerpo = document.getElementById("tabla-api-cuerpo");
      tablaCuerpo.innerHTML = "";

      if (!data || data.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 5;
        td.style.cssText = "text-align:center; padding:2rem; opacity:0.5;";
        td.textContent = "No hay registros globales almacenados en el servidor.";
        tr.appendChild(td);
        tablaCuerpo.appendChild(tr);
      } else {
        data.forEach((r) => {
          const fila = document.createElement("tr");
          fila.style.borderBottom = "1px solid var(--text-color)";
          fila.appendChild(crearCeldaSegura(r.nombre, "font-weight:700;"));
          fila.appendChild(crearCeldaSegura(r.clave, "font-variant-numeric:tabular-nums;"));
          fila.appendChild(crearCeldaSegura(r.grupo));
          fila.appendChild(crearCeldaSegura(r.docente));
          const tdHora = crearCeldaSegura(r.hora, "font-variant-numeric:tabular-nums; opacity:0.8;");
          tdHora.style.borderRight = "none";
          fila.appendChild(tdHora);
          tablaCuerpo.appendChild(fila);
        });
      }

      const hoy = new Date().toLocaleDateString("es-SV", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).replace(/-/g, '/');

      const filtrados = data.filter((r) => {
        const fechaRegistro = r.fecha ? r.fecha.replace(/-/g, '/') : '';
        return fechaRegistro === hoy;
      });

      document.getElementById("count-morning").textContent = filtrados.filter((r) => r.grupo === "Mañana").length;
      document.getElementById("count-afternoon").textContent = filtrados.filter((r) => r.grupo === "Tarde").length;

      // FIX #13: Construir logs con textContent, sin innerHTML con datos del servidor
      const contenedor = document.getElementById("listaRegistros");
      contenedor.innerHTML = "";

      if (filtrados.length === 0) {
        const div = document.createElement("div");
        div.className = "registro-item";
        div.style.cssText = "text-align:center; opacity:0.5;";
        div.textContent = "No hay asistencias registradas este día.";
        contenedor.appendChild(div);
      } else {
        filtrados.forEach((r) => {
          const item = document.createElement("div");
          item.className = "registro-item";
          const strong = document.createElement("strong");
          strong.textContent = r.nombre || "—";
          const span = document.createElement("span");
          span.textContent = ` — ${r.grupo || "—"}`;
          const br = document.createElement("br");
          const small = document.createElement("small");
          small.style.opacity = "0.7";
          small.textContent = `Clave: ${r.clave || "—"} | Docente: ${r.docente || "—"} | Hora: ${r.hora || "—"}`;
          item.appendChild(strong);
          item.appendChild(span);
          item.appendChild(br);
          item.appendChild(small);
          contenedor.appendChild(item);
        });
      }
    })
    .catch((err) => {
      if (err.name === "AbortError") {
        alertBox.textContent = "❌ TIEMPO DE ESPERA AGOTADO. Intenta de nuevo.";
      } else {
        alertBox.textContent = "❌ ERROR AL TRAER LOS REGISTROS DESDE EL SERVIDOR.";
      }
      alertBox.className = "alert-box error";
    })
    .finally(() => {
      document.getElementById("btnAccederRegistros").disabled = false;
      document.getElementById("btnAccederRegistros").innerHTML = "🔓 Entrar";
      passwordInput.value = "";
    });
}

function lockAndReturn() {
  // FIX #17: Limpiar dashboard al salir para no dejar datos visibles
  document.getElementById("tabla-api-cuerpo").innerHTML = "";
  document.getElementById("listaRegistros").innerHTML = "";
  document.getElementById("count-morning").textContent = "0";
  document.getElementById("count-afternoon").textContent = "0";

  document.getElementById("teacher-dashboard").classList.remove("visible");
  document.getElementById("teacher-auth").style.display = "block";
  switchView("view-menu");
}

// FIX #8: Borrado protegido con firma en lugar de confirm() simple
function triggerClearAll() {
  const firmaConfirm = prompt("⚠️ ACCIÓN IRREVERSIBLE\nIngresa la Firma del Docente de hoy para confirmar el borrado:");
  if (!firmaConfirm) return;

  const params = new URLSearchParams();
  params.append("action", "limpiar_asistencias");
  params.append("firma", firmaConfirm.trim()); // FIX #8: backend verifica firma antes de limpiar

  // FIX #12: fetchConTimeout
  fetchConTimeout(SCRIPT_URL, { method: "POST", body: params })
    .then((res) => {
      // FIX #21: Verificar HTTP status
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then((data) => {
      if (data.result === "success") {
        showToast("🗑 Registros archivados con éxito.", "success");
        alert("Registros guardados en Historial y limpiados correctamente.");
        lockAndReturn();
      } else {
        showToast("❌ " + (data.message || "Firma incorrecta o error al limpiar."), "warning");
      }
    })
    .catch((err) => {
      if (err.name === "AbortError") {
        showToast("❌ Tiempo de espera agotado.", "warning");
      } else {
        showToast("❌ Error al reiniciar el día.", "warning");
      }
    });
}
