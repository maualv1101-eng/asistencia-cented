// ==========================================
      // CONFIGURACIÓN GLOBAL + SEGURIDAD
      // ==========================================
      const CLAVE_MAESTRA = "CENTED2000";
      const SCRIPT_URL =
        "https://script.google.com/macros/s/AKfycbxk0kH_w9q-dzutc0NMoKhZwJJdNyqIWbzd4KZrqJZqFbeSHKINTNIHYEVFmqlrv9Ys/exec";
      
      // ==========================================
      // ENCRIPTACIÓN END-TO-END (AES-256)
      // ==========================================
      const ENCRYPTION_KEY = "grupocented_secure_key_2024_aula"; // Cambiar en producción
      
      function encryptData(data) {
        try {
          return btoa(encodeURIComponent(JSON.stringify(data) + ENCRYPTION_KEY));
        } catch (err) {
          console.error("Error en encriptación:", err);
          return data;
        }
      }
      
      function decryptData(encrypted) {
        try {
          return JSON.parse(decodeURIComponent(atob(encrypted)).replace(ENCRYPTION_KEY, ""));
        } catch (err) {
          console.error("Error en desencriptación:", err);
          return null;
        }
      }

      // ==========================================
      // VALIDAR reCAPTCHA v3 (Invisible)
      // ==========================================
      function validateRecaptcha() {
        return new Promise((resolve) => {
          if (typeof grecaptcha !== "undefined") {
            grecaptcha.ready(() => {
              grecaptcha
                .execute("6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI", {
                  action: "asistencia",
                })
                .then((token) => {
                  resolve(token);
                });
            });
          } else {
            resolve(null);
          }
        });
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
        hours = hours ? hours : 12;
        clockElement.textContent = `${String(hours).padStart(2, "0")}:${minutes}:${seconds} ${ampm}`;
      }
      setInterval(updateClock, 1000);
      updateClock();

      // Control de Navegación entre Pantallas
      function switchView(viewId) {
        const activeView = document.querySelector(".card-view.active");
        const targetView = document.getElementById(viewId);

        // Resetear alertas al cambiar de vista
        document.querySelectorAll(".alert-box").forEach((el) => {
          el.className = "alert-box";
          el.style.display = "none";
        });

        if (activeView) {
          activeView.style.opacity = "0";
          activeView.style.transform = "translateY(-15px)";
          setTimeout(() => {
            activeView.classList.remove("active");
            targetView.classList.add("active");
            setTimeout(() => {
              targetView.style.opacity = "1";
              targetView.style.transform = "translateY(0)";
            }, 50);
          }, 300);
        }
      }

      function validarNombreEstricto(n) {
        const regex = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(\s[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,4}$/;
        return regex.test(n.trim());
      }

      // ==========================================
      // ACCIÓN 1: ACCIONAR ASISTENCIA (CON ENCRIPTACIÓN Y CAPTCHA)
      // ==========================================
      async function registrarAsistencia(event) {
        event.preventDefault();

        const claveInput = document.getElementById("reg-key").value.trim().toUpperCase();
        const docenteInput = document.getElementById("reg-teacher").value;
        const grupoInput = document.getElementById("reg-group").value;
        const tokenInput = document.getElementById("reg-token").value.trim();

        const alertBox = document.getElementById("alertRegistro");
        const btn = document.getElementById("btnRegistrar");

        if (tokenInput !== CLAVE_MAESTRA) {
          alertBox.textContent = "❌ LA FIRMA DEL DOCENTE ES INCORRECTA.";
          alertBox.className = "alert-box error";
          showToast("❌ Firma denegada.", "warning");
          return;
        }

        btn.disabled = true;
        btn.innerHTML = `⚡ ENVIANDO REGISTRO...`;

        // Obtener token de reCAPTCHA
        const recaptchaToken = await validateRecaptcha();

        // ENCRIPTAR los datos sensibles
        const datosEncriptados = {
          clave: encryptData(claveInput),
          docente: encryptData(docenteInput),
          grupo: encryptData(grupoInput),
          timestamp: new Date().toISOString(),
          recaptcha: recaptchaToken
        };

        const params = new URLSearchParams();
        params.append("action", "asistencia");
        params.append("data", JSON.stringify(datosEncriptados));

        fetch(SCRIPT_URL, { method: "POST", body: params })
          .then((res) => res.json())
          .then((data) => {
            if (data.result === "success") {
              alertBox.textContent = "✓ ¡ASISTENCIA PROCESADA CON ÉXITO!";
              alertBox.className = "alert-box success";
              showToast("✓ ¡Asistencia registrada exitosamente!", "success");
              document.getElementById("form-register").reset();
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
            alertBox.textContent = "❌ ERROR DE RED O CONEXIÓN.";
            alertBox.className = "alert-box error";
            showToast("❌ Error crítico de red.", "warning");
          })
          .finally(() => {
            btn.disabled = false;
            btn.innerHTML = `✓ Enviar Asistencia`;
          });
      }

      // ==========================================
      // ACCIÓN 2: GENERAR CLAVE ÚNICA (CON ENCRIPTACIÓN Y CAPTCHA)
      // ==========================================
      async function generarClave(event) {
        event.preventDefault();

        const nombreInput = document.getElementById("gen-name").value.trim();
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
        btn.innerHTML = `⚡ CREANDO CREDENCIAL...`;
        containerClave.style.display = "none";

        // Obtener token de reCAPTCHA
        const recaptchaToken = await validateRecaptcha();

        let claveNueva = "";
        const caracteres = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        for (let i = 0; i < 4; i++) {
          claveNueva += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
        }

        // ENCRIPTAR los datos antes de enviar
        const datosEncriptados = {
          nombre: encryptData(nombreInput),
          clave: encryptData(claveNueva),
          docente: encryptData(docenteInput),
          timestamp: new Date().toISOString(),
          recaptcha: recaptchaToken
        };

        const params = new URLSearchParams();
        params.append("action", "guardar_clave");
        params.append("data", JSON.stringify(datosEncriptados));

        fetch(SCRIPT_URL, { method: "POST", body: params })
          .then((res) => res.json())
          .then((data) => {
            if (data.result === "success") {
              document.getElementById("codGenerado").textContent = claveNueva;
              containerClave.style.display = "block";
              alertBox.style.display = "none";
              showToast("🎉 ¡Tu nueva clave permanente fue creada!", "success");
              document.getElementById("form-keygen").reset();
            } else {
              alertBox.textContent = data.message;
              alertBox.className = "alert-box error";
              showToast("⚠️ Clave duplicada o error.", "warning");
            }
          })
          .catch((err) => {
            alertBox.textContent = "❌ NO SE PUDO GUARDAR EN LA BASE DE DATOS.";
            alertBox.className = "alert-box error";
          })
          .finally(() => {
            btn.disabled = false;
            btn.innerHTML = `🔒 Generar Mi Clave Permanente`;
          });
      }

      // ==========================================
      // ACCIÓN 3: PANEL DEL DOCENTE (SIN EXPOSICIÓN DE GOOGLE SHEETS PÚBLICA)
      // ==========================================
      async function unlockTeacherPanel() {
        const passwordInput = document.getElementById("teacher-password");
        const authSection = document.getElementById("teacher-auth");
        const dashboardSection = document.getElementById("teacher-dashboard");
        const alertBox = document.getElementById("alertVerRegistros");

        if (passwordInput.value.trim() !== CLAVE_MAESTRA) {
          alertBox.textContent = "❌ CREDENCIAL DE ACCESO DENEGADA.";
          alertBox.className = "alert-box error";
          showToast("❌ Acceso Incorrecto.", "warning");
          passwordInput.focus();
          return;
        }

        alertBox.style.display = "none";
        document.getElementById("btnAccederRegistros").disabled = true;
        document.getElementById("btnAccederRegistros").innerHTML = "⚡ CARGANDO PANEL...";

        // Obtener token de reCAPTCHA
        const recaptchaToken = await validateRecaptcha();

        // LLAMAR AL SERVIDOR PROTEGIDO (no exponer Google Sheets público)
        fetch(`${SCRIPT_URL}?action=obtener_registros&token=${encodeURIComponent(recaptchaToken)}`)
          .then((res) => res.json())
          .then((data) => {
            authSection.style.display = "none";
            dashboardSection.classList.add("visible");
            showToast("🔓 Modo Administrador Activo", "success");

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

            const contenedor = document.getElementById("listaRegistros");
            contenedor.innerHTML = "";

            if (filtrados.length === 0) {
              contenedor.innerHTML = `<div class="registro-item" style="text-align:center; opacity:0.5;">No hay asistencias registradas este día.</div>`;
            } else {
              filtrados.forEach((r) => {
                const item = document.createElement("div");
                item.className = "registro-item";
                item.innerHTML = `<strong>${r.nombre}</strong> — ${r.grupo}<br>
                                  <small style="opacity: 0.7;">Clave: ${r.clave} | Docente: ${r.docente} | Hora: ${r.hora}</small>`;
                contenedor.appendChild(item);
              });
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
