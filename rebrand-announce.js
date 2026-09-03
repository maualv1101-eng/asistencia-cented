/* ================================================================
   Popup de anuncio de rebranding — Grupo Cented Academy Pro Educacion
   ------------------------------------------------------------------
   Se muestra UNA sola vez por navegador (usa localStorage) para avisar
   del cambio de nombre. Para eso usa la clave REBRAND_ANNOUNCE_KEY.

   CÓMO REUTILIZARLO PARA UN FUTURO AVISO:
   1) Cambia el texto/HTML dentro de #rebrand-announce-overlay en index.html.
   2) Cambia el valor de REBRAND_ANNOUNCE_KEY abajo (por ejemplo a "v2")
      para que vuelva a aparecer aunque el usuario ya haya visto el anterior.

   CÓMO DESACTIVARLO POR COMPLETO:
   - Borra este archivo, el <script src="rebrand-announce.js"> en index.html,
     el bloque HTML #rebrand-announce-overlay y el bloque CSS asociado.
   ================================================================ */
(function () {
  "use strict";

  var REBRAND_ANNOUNCE_KEY = "cented_rebrand_academy_v1";

  document.addEventListener("DOMContentLoaded", function () {
    var overlay = document.getElementById("rebrand-announce-overlay");
    if (!overlay) return;

    var alreadySeen = false;
    try {
      alreadySeen = window.localStorage.getItem(REBRAND_ANNOUNCE_KEY) === "1";
    } catch (e) {
      // Si localStorage no está disponible (modo privado, etc.), se muestra igual.
      alreadySeen = false;
    }

    if (alreadySeen) return;

    overlay.hidden = false;

    function closeAnnounce() {
      overlay.hidden = true;
      try {
        window.localStorage.setItem(REBRAND_ANNOUNCE_KEY, "1");
      } catch (e) {
        /* noop */
      }
    }

    var okBtn = document.getElementById("rebrand-announce-ok");
    var closeBtn = document.getElementById("rebrand-announce-close");
    if (okBtn) okBtn.addEventListener("click", closeAnnounce);
    if (closeBtn) closeBtn.addEventListener("click", closeAnnounce);

    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) closeAnnounce();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !overlay.hidden) closeAnnounce();
    });
  });
})();
