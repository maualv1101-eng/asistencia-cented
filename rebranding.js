/* ================================================================
   rebranding.js
   Archivo NUEVO e independiente. NO modifica ni depende de la
   lógica interna de script.js (solo reutiliza la función global
   switchView, ya existente, para navegar entre secciones).

   Contiene:
   1) Ventana emergente de anuncio de rebranding (se muestra cada
      vez que alguien entra al sitio).
   2) Aplicación de overrides locales de marca (logo / título /
      eslogan / texto del aviso) guardados en este navegador.
   3) Panel "Personalización de Marca" para el docente/admin.
   ================================================================ */

(function () {
  "use strict";

  // ---------------------------------------------------------------
  // CONFIGURACIÓN
  // ---------------------------------------------------------------
  var CONFIG = {
    // Cambia esta clave por la que tú quieras usar para entrar al
    // panel de Personalización de Marca (05).
    BRAND_PASSWORD: "cented2026",

    // "always"  -> el aviso aparece SIEMPRE que se entra al sitio
    //              (cada carga de página), tal como se pidió.
    // "session" -> aparece solo una vez por pestaña/sesión del navegador.
    SHOW_MODE: "always",

    STORAGE_KEYS: {
      logo: "cented_brand_logo",
      title: "cented_brand_title",
      slogan: "cented_brand_slogan",
      announcement: "cented_brand_announcement",
      seenSession: "cented_rebrand_seen_session"
    },

    DEFAULT_TITLE: "GRUPO CENTED ACADEMY PRO EDUCATION",
    DEFAULT_ANNOUNCEMENT:
      "A partir de hoy, <strong>Grupo Cented</strong> pasa a ser " +
      "<strong>Grupo Cented Academy Pro Education</strong>. Seguimos siendo el mismo " +
      "equipo, el mismo sistema de asistencia y la misma comunidad — solo con una " +
      "nueva identidad."
  };

  // ---------------------------------------------------------------
  // 1) VENTANA EMERGENTE DE REBRANDING
  // ---------------------------------------------------------------
  function shouldShowModal() {
    if (CONFIG.SHOW_MODE === "always") return true;
    try {
      return !sessionStorage.getItem(CONFIG.STORAGE_KEYS.seenSession);
    } catch (e) {
      return true;
    }
  }

  function markModalSeen() {
    try {
      sessionStorage.setItem(CONFIG.STORAGE_KEYS.seenSession, "1");
    } catch (e) {
      /* ignore */
    }
  }

  function openModal() {
    var overlay = document.getElementById("rebrand-modal-overlay");
    if (!overlay) return;
    overlay.classList.add("is-visible");
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
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeModal();
    });

    if (shouldShowModal()) {
      // Pequeño retraso para que no compita con el resto del render inicial.
      setTimeout(openModal, 300);
    }
  }

  // ---------------------------------------------------------------
  // 2) APLICAR OVERRIDES LOCALES DE MARCA (si el docente ya guardó cambios)
  // ---------------------------------------------------------------
  function applyStoredBrand() {
    var logo = localStorage.getItem(CONFIG.STORAGE_KEYS.logo);
    var title = localStorage.getItem(CONFIG.STORAGE_KEYS.title);
    var slogan = localStorage.getItem(CONFIG.STORAGE_KEYS.slogan);
    var announcement = localStorage.getItem(CONFIG.STORAGE_KEYS.announcement);

    if (logo) {
      var logoEls = document.querySelectorAll(
        'link[rel="icon"], link[rel="apple-touch-icon"], #rebrand-modal-logo'
      );
      logoEls.forEach(function (el) {
        if (el.tagName === "LINK") el.setAttribute("href", logo);
        else el.setAttribute("src", logo);
      });
    }

    if (title) {
      var h1 = document.querySelector(".main-header h1");
      if (h1) h1.textContent = title;
    }

    if (slogan) {
      var sub = document.querySelector(".main-header .subtitle");
      if (sub) sub.textContent = slogan;
    }

    var modalText = document.getElementById("rebrand-modal-text");
    if (modalText) {
      modalText.innerHTML = announcement || CONFIG.DEFAULT_ANNOUNCEMENT;
    }
  }

  // ---------------------------------------------------------------
  // 3) PANEL "PERSONALIZACIÓN DE MARCA"
  // ---------------------------------------------------------------
  function showBrandAlert(msg, type) {
    var box = document.getElementById("alertBrand");
    if (!box) return;
    box.textContent = msg;
    box.className = "alert-box " + (type || "info");
    box.style.display = "block";
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
    var sloganInput = document.getElementById("brand-slogan-input");
    var announcementInput = document.getElementById("brand-announcement-input");
    var saveBtn = document.getElementById("btnGuardarBrand");
    var resetBtn = document.getElementById("btnRestaurarBrand");

    if (!menuBtn) return; // sección no presente, no hacer nada

    menuBtn.addEventListener("click", function () {
      if (typeof switchView === "function") switchView("view-brand");
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
          if (panel) panel.classList.add("visible");
          if (panel) panel.style.display = "block";

          // Precargar valores actuales guardados (si existen)
          if (titleInput) titleInput.value = localStorage.getItem(CONFIG.STORAGE_KEYS.title) || "";
          if (sloganInput) sloganInput.value = localStorage.getItem(CONFIG.STORAGE_KEYS.slogan) || "";
          if (announcementInput)
            announcementInput.value = localStorage.getItem(CONFIG.STORAGE_KEYS.announcement) || "";
          var savedLogo = localStorage.getItem(CONFIG.STORAGE_KEYS.logo);
          if (savedLogo && logoPreview) {
            logoPreview.innerHTML = '<img src="' + savedLogo + '" alt="Logo actual" />';
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
          showBrandAlert("Solo se permiten imágenes PNG o JPG.", "error");
          return;
        }
        var reader = new FileReader();
        reader.onload = function (ev) {
          if (logoPreview) {
            logoPreview.innerHTML = '<img src="' + ev.target.result + '" alt="Vista previa" />';
          }
          logoInput.dataset.base64 = ev.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", function () {
        if (logoInput && logoInput.dataset.base64) {
          localStorage.setItem(CONFIG.STORAGE_KEYS.logo, logoInput.dataset.base64);
        }
        if (titleInput && titleInput.value.trim()) {
          localStorage.setItem(CONFIG.STORAGE_KEYS.title, titleInput.value.trim());
        }
        if (sloganInput && sloganInput.value.trim()) {
          localStorage.setItem(CONFIG.STORAGE_KEYS.slogan, sloganInput.value.trim());
        }
        if (announcementInput && announcementInput.value.trim()) {
          localStorage.setItem(CONFIG.STORAGE_KEYS.announcement, announcementInput.value.trim());
        }
        showBrandAlert("Cambios guardados en este navegador. Recarga la página para verlos aplicados.", "success");
        applyStoredBrand();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        Object.keys(CONFIG.STORAGE_KEYS).forEach(function (k) {
          if (k !== "seenSession") localStorage.removeItem(CONFIG.STORAGE_KEYS[k]);
        });
        if (logoPreview) logoPreview.innerHTML = "";
        if (titleInput) titleInput.value = "";
        if (sloganInput) sloganInput.value = "";
        if (announcementInput) announcementInput.value = "";
        showBrandAlert("Se restauraron los valores originales. Recarga la página.", "success");
      });
    }
  }

  // ---------------------------------------------------------------
  // INICIO
  // ---------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", function () {
    applyStoredBrand();
    initModal();
    initBrandPanel();
  });
})();
