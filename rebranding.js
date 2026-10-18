/* ================================================================
   rebranding.js 
   Archivo de Vista de Anuncios y Marca.
   (La configuración ahora se realiza exclusivamente desde EVA-DOC)
   ================================================================ */

(function () {
  "use strict";

  var CONFIG = {
    STORAGE_KEYS: {
      seenSession: "cented_rebrand_seen_session"
    },
    DEFAULT_TITLE: "GRUPO CENTED ACADEMY PRO EDUCATION",
    DEFAULT_SLOGAN: "DEPARTAMENTO DE SISTEMAS INFORMATICOS"
  };

  function backendDisponible() {
    return typeof SCRIPT_URL === "string" && SCRIPT_URL.indexOf("http") === 0;
  }

  function cargarMarcaDesdeBackend() {
    if (!backendDisponible()) return;
    
    fetch(SCRIPT_URL + "?action=obtener_marca")
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.result === "success" && data.marca) {
          aplicarMarcaAlDom(data.marca);
        }
      })
      .catch(function (err) { console.warn("Error cargando marca: ", err); });
  }

  function aplicarMarcaAlDom(marca) {
    var h1 = document.getElementById("brand-title-text");
    if (h1 && marca.titulo) h1.textContent = marca.titulo;
    
    var sub = document.querySelector(".main-header .subtitle");
    if (sub && marca.eslogan) sub.textContent = marca.eslogan;

    if (marca.logo_url) {
      document
        .querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"], #aviso-logo-img')
        .forEach(function (el) {
          if (el.tagName === "LINK") el.setAttribute("href", marca.logo_url);
          else el.setAttribute("src", marca.logo_url);
        });
    }

    // Si el aviso está activo en EVA-DOC
    if (marca.aviso_activo) {
      var overlay = document.getElementById("aviso-overlay");
      var txtTitulo = document.getElementById("aviso-titulo-txt");
      var txtCuerpo = document.getElementById("aviso-texto-txt");
      var btnAccion = document.getElementById("aviso-btn-continuar");
      
      var wrapMedia = document.getElementById("aviso-media-wrap");
      var imgMedia = document.getElementById("aviso-media-img");
      
      if (txtTitulo) txtTitulo.textContent = marca.aviso_titulo || "Aviso Institucional";
      if (txtCuerpo) txtCuerpo.textContent = marca.aviso_texto || "";
      if (btnAccion) btnAccion.textContent = marca.aviso_boton || "Continuar";
      
      if (marca.banner_url && imgMedia) {
        imgMedia.src = marca.banner_url;
        imgMedia.style.display = "block";
        wrapMedia.classList.add("visible");
      }
      
      // Mostrar el modal si no ha sido visto en esta sesión
      if (!sessionStorage.getItem(CONFIG.STORAGE_KEYS.seenSession) && overlay) {
        setTimeout(function() {
          overlay.classList.add("visible");
        }, 500);
      }
    }
  }

  function closeModal() {
    var overlay = document.getElementById("aviso-overlay");
    if (!overlay) return;
    overlay.classList.remove("visible");
    try { sessionStorage.setItem(CONFIG.STORAGE_KEYS.seenSession, "1"); } catch(e){}
  }

  function initModalEvents() {
    var overlay = document.getElementById("aviso-overlay");
    var closeBtn = document.getElementById("aviso-close-x");
    var acceptBtn = document.getElementById("aviso-btn-continuar");
    
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (acceptBtn) acceptBtn.addEventListener("click", closeModal);
    if (overlay) overlay.addEventListener("click", function (e) { if (e.target === overlay) closeModal(); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initModalEvents();
    cargarMarcaDesdeBackend();
  });
})();
