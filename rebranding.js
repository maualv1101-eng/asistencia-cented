/* ================================================================
   rebranding.js  (v2)
   Archivo NUEVO e independiente. NO modifica ni depende de la lógica
   interna de script.js — solo REUTILIZA dos cosas que script.js ya
   deja disponibles en el navegador (variables/funciones globales,
   no toca su código):
     - switchView(viewId)   -> para navegar entre secciones.
     - SCRIPT_URL            -> la misma URL del backend de Apps Script.
     - tokenSesion            -> el token que se obtiene al iniciar
                                  sesión en "Panel del Docente" (03).

   Qué hace:
   1) Ventana emergente de anuncio (logo + título + imagen grande
      opcional + descripción), visible para todo el mundo, cargando
      su contenido desde el backend (obtener_marca) para que se vea
      igual para todos los visitantes.
   2) Panel "Personalización de Marca" (05), protegido con una clave
      simple (cented2000) para entrar, con 3 pasos en este orden:
        1. Logo (ícono pequeño)
        2. Título institucional
        3. Imagen grande / banner (horizontal o vertical)
      Al guardar, si el docente ya inició sesión en el Panel del
      Docente (03) en esta misma visita, los cambios se guardan en
      el backend (Apps Script + Drive) y se ven para TODOS los
      visitantes. Si no, se guardan solo en este navegador como
      vista previa local.
   ================================================================ */

(function () {
  "use strict";

  var CONFIG = {
    BRAND_PASSWORD: "cented2000",
    SHOW_MODE: "always",

    STORAGE_KEYS: {
      logo: "cented_brand_logo",
      banner: "cented_brand_banner",
      title: "cented_brand_title",
      slogan: "cented_brand_slogan",
      announcement: "cented_brand_announcement",
      seenSession: "cented_rebrand_seen_session"
    },

    DEFAULT_TITLE: "GRUPO CENTED ACADEMY PRO EDUCATION",
    DEFAULT_SLOGAN: "DEPARTAMENTO DE SISTEMAS INFORMATICOS",
    DEFAULT_ANNOUNCEMENT:
      "A partir de hoy, <strong>Grupo Cented</strong> pasa a ser " +
      "<strong>Grupo Cented Academy Pro Education</strong>. Seguimos siendo el mismo " +
      "equipo, el mismo sistema de asistencia y la misma comunidad — solo con una " +
      "nueva identidad."
  };

  var marcaActual = { titulo: "", eslogan: "", anuncio: "", logo_url: "", banner_url: "" };

  // SCRIPT_URL y tokenSesion son declarados por script.js (const/var en el
  // scope global del documento). No están colgados de "window.SCRIPT_URL"
  // porque SCRIPT_URL usa "const", así que los referenciamos directo con
  // typeof para no romper si script.js no cargó todavía o cambia.
  function backendDisponible() {
    return typeof SCRIPT_URL === "string" && SCRIPT_URL.indexOf("http") === 0;
  }

  function obtenerUrlBackend() {
    return typeof SCRIPT_URL === "string" ? SCRIPT_URL : "";
  }

  function haySesionDocenteActiva() {
    return typeof tokenSesion === "string" && tokenSesion.length > 10;
  }

  function obtenerTokenSesionActual() {
    return typeof tokenSesion === "string" ? tokenSesion : "";
  }

  function cargarMarcaDesdeBackend() {
    if (!backendDisponible()) {
      aplicarMarcaLocalComoRespaldo();
      return;
    }
    fetch(obtenerUrlBackend() + "?action=obtener_marca")
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.result === "success" && data.marca) marcaActual = data.marca;
        aplicarMarcaAlDom();
      })
      .catch(function () { aplicarMarcaLocalComoRespaldo(); });
  }

  function aplicarMarcaLocalComoRespaldo() {
    marcaActual = {
      titulo: localStorage.getItem(CONFIG.STORAGE_KEYS.title) || "",
      eslogan: localStorage.getItem(CONFIG.STORAGE_KEYS.slogan) || "",
      anuncio: localStorage.getItem(CONFIG.STORAGE_KEYS.announcement) || "",
      logo_url: localStorage.getItem(CONFIG.STORAGE_KEYS.logo) || "",
      banner_url: localStorage.getItem(CONFIG.STORAGE_KEYS.banner) || ""
    };
    aplicarMarcaAlDom();
  }

  function aplicarMarcaAlDom() {
    var titulo = marcaActual.titulo || CONFIG.DEFAULT_TITLE;
    var eslogan = marcaActual.eslogan || CONFIG.DEFAULT_SLOGAN;
    var anuncio = marcaActual.anuncio || CONFIG.DEFAULT_ANNOUNCEMENT;

    var h1 = document.querySelector(".main-header h1");
    if (h1) h1.textContent = titulo;
    var sub = document.querySelector(".main-header .subtitle");
    if (sub) sub.textContent = eslogan;

    if (marcaActual.logo_url) {
      document
        .querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"], #rebrand-modal-logo')
        .forEach(function (el) {
          if (el.tagName === "LINK") el.setAttribute("href", marcaActual.logo_url);
          else el.setAttribute("src", marcaActual.logo_url);
        });
    }

    var bannerWrap = document.getElementById("rebrand-modal-banner-wrap");
    var bannerImg = document.getElementById("rebrand-modal-banner");
    if (bannerWrap && bannerImg) {
      if (marcaActual.banner_url) {
        bannerImg.setAttribute("src", marcaActual.banner_url);
        bannerWrap.style.display = "block";
      } else {
        bannerWrap.style.display = "none";
      }
    }

    var modalText = document.getElementById("rebrand-modal-text");
    if (modalText) modalText.innerHTML = anuncio;
  }

  function shouldShowModal() {
    if (CONFIG.SHOW_MODE === "always") return true;
    try { return !sessionStorage.getItem(CONFIG.STORAGE_KEYS.seenSession); }
    catch (e) { return true; }
  }

  function markModalSeen() {
    try { sessionStorage.setItem(CONFIG.STORAGE_KEYS.seenSession, "1"); }
    catch (e) { /* ignore */ }
  }

  function openModal() {
    var overlay = document.getElementById("rebrand-modal-overlay");
    if (overlay) overlay.classList.add("is-visible");
  }

  function closeModal() {
    var overlay = document.getElementById("rebrand-modal-overlay");
    if (!overlay) return;
    overlay.classList.remove("is-visible");
    markModalSeen();
  }

  function initModal() {
    var overlay = document.getElementById("rebrand-modal-overlay");
    if (!overlay) return;
    var closeBtn = document.getElementById("rebrand-modal-close");
    var acceptBtn = document.getElementById("rebrand-modal-accept");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (acceptBtn) acceptBtn.addEventListener("click", closeModal);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeModal(); });
    if (shouldShowModal()) setTimeout(openModal, 350);
  }

  function showBrandAlert(msg, type) {
    var box = document.getElementById("alertBrand");
    if (!box) return;
    box.textContent = msg;
    box.className = "alert-box " + (type || "info");
    box.style.display = "block";
  }

  function leerArchivoComoBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (ev) { resolve(ev.target.result); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function initBrandPanel() {
    var menuBtn = document.getElementById("btn-menu-brand");
    var backBtn = document.getElementById("btn-back-brand");
    var authForm = document.getElementById("brand-auth");
    var passwordInput = document.getElementById("brand-password");
    var panel = document.getElementById("brand-panel");

    var logoInput = document.getElementById("brand-logo-input");
    var logoPreview = document.getElementById("brand-logo-preview");
    var titleInput = document.getElementById("brand-title-input");
    var bannerInput = document.getElementById("brand-banner-input");
    var bannerPreview = document.getElementById("brand-banner-preview");
    var sloganInput = document.getElementById("brand-slogan-input");
    var announcementInput = document.getElementById("brand-announcement-input");
    var saveBtn = document.getElementById("btnGuardarBrand");
    var resetBtn = document.getElementById("btnRestaurarBrand");
    var sessionNote = document.getElementById("brand-session-note");

    if (!menuBtn) return;

    function actualizarNotaSesion() {
      if (!sessionNote) return;
      if (haySesionDocenteActiva()) {
        sessionNote.textContent =
          "✅ Sesión de docente detectada: los cambios que guardes se verán para TODOS los visitantes del sitio.";
        sessionNote.style.color = "#1a7a3c";
      } else {
        sessionNote.textContent =
          "ℹ️ No has iniciado sesión en el Panel del Docente (03). Puedes previsualizar cambios en este " +
          'navegador, pero para que se vean en TODO el sitio primero entra a "Ver Registros (Docente)" ' +
          "y luego vuelve aquí.";
        sessionNote.style.color = "";
      }
    }

    menuBtn.addEventListener("click", function () {
      if (typeof switchView === "function") switchView("view-brand");
      actualizarNotaSesion();
    });

    if (backBtn) {
      backBtn.addEventListener("click", function () {
        if (typeof switchView === "function") switchView("view-menu");
      });
    }

    if (authForm) {
      authForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var val = passwordInput ? passwordInput.value : "";
        if (val === CONFIG.BRAND_PASSWORD) {
          authForm.style.display = "none";
          if (panel) { panel.classList.add("visible"); panel.style.display = "block"; }
          actualizarNotaSesion();

          if (titleInput) titleInput.value = marcaActual.titulo || "";
          if (sloganInput) sloganInput.value = marcaActual.eslogan || "";
          if (announcementInput) announcementInput.value = marcaActual.anuncio || "";
          if (marcaActual.logo_url && logoPreview) {
            logoPreview.innerHTML = '<img src="' + marcaActual.logo_url + '" alt="Logo actual" />';
          }
          if (marcaActual.banner_url && bannerPreview) {
            bannerPreview.innerHTML = '<img src="' + marcaActual.banner_url + '" alt="Imagen grande actual" />';
          }
        } else {
          showBrandAlert("Clave incorrecta.", "error");
        }
      });
    }

    if (logoInput) {
      logoInput.addEventListener("change", function () {
        var file = logoInput.files && logoInput.files[0];
        if (!file) return;
        if (!/^image\/(png|jpeg)$/.test(file.type)) {
          showBrandAlert("El logo debe ser PNG o JPG.", "error");
          return;
        }
        leerArchivoComoBase64(file).then(function (dataUrl) {
          if (logoPreview) logoPreview.innerHTML = '<img src="' + dataUrl + '" alt="Vista previa del logo" />';
          logoInput.dataset.base64 = dataUrl;
          logoInput.dataset.mime = file.type;
        });
      });
    }

    if (bannerInput) {
      bannerInput.addEventListener("change", function () {
        var file = bannerInput.files && bannerInput.files[0];
        if (!file) return;
        if (!/^image\/(png|jpeg)$/.test(file.type)) {
          showBrandAlert("La imagen grande debe ser PNG o JPG.", "error");
          return;
        }
        leerArchivoComoBase64(file).then(function (dataUrl) {
          if (bannerPreview) bannerPreview.innerHTML = '<img src="' + dataUrl + '" alt="Vista previa de la imagen grande" />';
          bannerInput.dataset.base64 = dataUrl;
          bannerInput.dataset.mime = file.type;
        });
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", function () {
        var titulo = titleInput ? titleInput.value.trim() : "";
        var eslogan = sloganInput ? sloganInput.value.trim() : "";
        var anuncio = announcementInput ? announcementInput.value.trim() : "";
        var logoBase64Full = logoInput ? logoInput.dataset.base64 : null;
        var bannerBase64Full = bannerInput ? bannerInput.dataset.base64 : null;

        if (logoBase64Full) localStorage.setItem(CONFIG.STORAGE_KEYS.logo, logoBase64Full);
        if (bannerBase64Full) localStorage.setItem(CONFIG.STORAGE_KEYS.banner, bannerBase64Full);
        if (titulo) localStorage.setItem(CONFIG.STORAGE_KEYS.title, titulo);
        if (eslogan) localStorage.setItem(CONFIG.STORAGE_KEYS.slogan, eslogan);
        if (anuncio) localStorage.setItem(CONFIG.STORAGE_KEYS.announcement, anuncio);

        if (!backendDisponible() || !haySesionDocenteActiva()) {
          if (titulo) marcaActual.titulo = titulo;
          if (eslogan) marcaActual.eslogan = eslogan;
          if (anuncio) marcaActual.anuncio = anuncio;
          if (logoBase64Full) marcaActual.logo_url = logoBase64Full;
          if (bannerBase64Full) marcaActual.banner_url = bannerBase64Full;
          aplicarMarcaAlDom();
          showBrandAlert(
            "Guardado como vista previa en este navegador. Para que se vea en TODO el sitio, inicia sesión " +
            "primero en el Panel del Docente (03) y vuelve a guardar.",
            "success"
          );
          return;
        }

        var params = new URLSearchParams();
        params.append("action", "guardar_marca");
        params.append("token", obtenerTokenSesionActual());
        if (titulo) params.append("titulo", titulo);
        if (eslogan) params.append("eslogan", eslogan);
        if (anuncio) params.append("anuncio", anuncio);
        if (logoBase64Full) {
          params.append("logo_base64", logoBase64Full.split(",")[1] || "");
          params.append("logo_mime", logoInput.dataset.mime || "image/png");
        }
        if (bannerBase64Full) {
          params.append("banner_base64", bannerBase64Full.split(",")[1] || "");
          params.append("banner_mime", bannerInput.dataset.mime || "image/png");
        }

        saveBtn.disabled = true;
        saveBtn.textContent = "Guardando...";

        fetch(obtenerUrlBackend(), { method: "POST", body: params })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            saveBtn.disabled = false;
            saveBtn.textContent = "💾 Guardar Cambios";
            if (data && data.result === "success") {
              marcaActual = data.marca || marcaActual;
              aplicarMarcaAlDom();
              showBrandAlert("✅ Guardado en el servidor. Ya se ve así para todos los visitantes.", "success");
            } else {
              showBrandAlert((data && data.message) || "No se pudo guardar en el servidor.", "error");
            }
          })
          .catch(function () {
            saveBtn.disabled = false;
            saveBtn.textContent = "💾 Guardar Cambios";
            showBrandAlert("Error de conexión con el servidor. Se guardó solo localmente.", "error");
          });
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        Object.keys(CONFIG.STORAGE_KEYS).forEach(function (k) {
          if (k !== "seenSession") localStorage.removeItem(CONFIG.STORAGE_KEYS[k]);
        });
        if (logoPreview) logoPreview.innerHTML = "";
        if (bannerPreview) bannerPreview.innerHTML = "";
        if (titleInput) titleInput.value = "";
        if (sloganInput) sloganInput.value = "";
        if (announcementInput) announcementInput.value = "";
        showBrandAlert(
          "Se limpió la vista previa local. Esto NO borra lo guardado en el servidor.",
          "success"
        );
      });
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    cargarMarcaDesdeBackend();
    initModal();
    initBrandPanel();
  });
})();
