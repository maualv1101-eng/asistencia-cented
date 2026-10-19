/* ================================================================
   rebranding.js (v3) — AULA DIGITAL
   Lee la marca y el aviso emergente que se configuran en EVA-DOC
   (pestaña "Config & Marca"). Sin contraseña y sin panel propio.

   - Aplica título, eslogan y logo institucional.
   - Muestra el aviso emergente SOLO si está activo en EVA-DOC.
   - El aviso aparece UNA vez por visitante y por versión: no vuelve
     a aparecer al recargar, salvo que el docente cambie el aviso o
     lo reactive (eso cambia "aviso_version").
   Requiere: SCRIPT_URL (declarado en script.js) y los ids del index.
   ================================================================ */
(function () {
  "use strict";

  var DEFAULT_TITLE = "GRUPO CENTED ACADEMY PRO EDUCATION";
  var DEFAULT_SLOGAN = "DEPARTAMENTO DE SISTEMAS INFORMÁTICOS";
  var KEY_PREFIX = "cented_aviso_visto_";

  function $(id) { return document.getElementById(id); }

  function backendUrl() {
    return (typeof SCRIPT_URL === "string") ? SCRIPT_URL : "";
  }

  function leerVisto(version) {
    try { return localStorage.getItem(KEY_PREFIX + version) === "1"; } catch (e) { return false; }
  }

  function marcarVisto(version) {
    try { localStorage.setItem(KEY_PREFIX + version, "1"); } catch (e) { /* navegador sin almacenamiento */ }
  }

  function aplicarMarca(m) {
    var h1 = document.querySelector(".main-header h1");
    if (h1) h1.textContent = m.titulo || DEFAULT_TITLE;

    var sub = document.querySelector(".main-header .subtitle");
    if (sub) sub.textContent = m.eslogan || DEFAULT_SLOGAN;

    if (m.logo_url) {
      var logo = $("brand-logo-img");
      if (logo) { logo.src = m.logo_url; logo.alt = "Logo institucional"; logo.style.display = "block"; }
      var fav = $("favicon-link");
      if (fav) fav.href = m.logo_url;
    }
  }

  function construirMedia(m, wrap) {
    wrap.innerHTML = "";
    wrap.classList.remove("visible");
    var tipo = m.aviso_tipo_media || "";
    var url = m.aviso_url_ext || "";
    var banner = m.banner_url || "";
    var vertical = m.banner_orient === "vertical";

    if ((tipo === "imagen" || tipo === "") && banner) {
      var img = document.createElement("img");
      img.className = "aviso-media-img" + (vertical ? " portrait" : "");
      img.alt = m.aviso_titulo || "Imagen del aviso";
      img.src = banner;
      wrap.appendChild(img);
    } else if (tipo === "video" && banner) {
      var v = document.createElement("video");
      v.className = "aviso-media-video";
      v.src = banner;
      v.controls = true;
      v.playsInline = true;
      wrap.appendChild(v);
    } else if (tipo === "url_ext" && url) {
      var emb = (typeof convertirYoutubeAEmbed === "function") ? convertirYoutubeAEmbed(url) : "";
      if (emb) {
        var frame = document.createElement("iframe");
        frame.className = "aviso-media-iframe" + (vertical ? " portrait-frame" : "");
        frame.src = emb.replace("autoplay=1&mute=1&", "");
        frame.allow = "encrypted-media; picture-in-picture";
        frame.setAttribute("allowfullscreen", "");
        frame.title = m.aviso_titulo || "Video del aviso";
        wrap.appendChild(frame);
      } else if (/^https:\/\//i.test(url)) {
        var a = document.createElement("a");
        a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
        a.textContent = "🔗 Abrir enlace del aviso";
        a.style.cssText = "display:block;padding:1rem;font-weight:700;text-align:center";
        wrap.appendChild(a);
      }
    }
    if (wrap.childNodes.length) wrap.classList.add("visible");
  }

  function cerrarAviso(version) {
    var ov = $("aviso-overlay");
    if (ov) ov.classList.remove("visible");
    var wrap = $("aviso-media-wrap");
    if (wrap) wrap.innerHTML = "";   // detiene video/iframe al cerrar
    marcarVisto(version);
  }

  function mostrarAviso(m, version) {
    var ov = $("aviso-overlay");
    if (!ov) return;

    $("aviso-titulo-txt").textContent = m.aviso_titulo || "Aviso institucional";
    $("aviso-texto-txt").textContent = m.aviso_texto || "";

    var logo = $("aviso-logo-img");
    if (logo) {
      if (m.logo_url) { logo.src = m.logo_url; logo.style.display = ""; }
      else { logo.style.display = "none"; }
    }

    var btn = $("aviso-btn-continuar");
    if (btn) btn.textContent = m.aviso_boton || "Entendido, continuar";

    construirMedia(m, $("aviso-media-wrap"));

    var cerrar = function () { cerrarAviso(version); };
    var x = $("aviso-close-x");
    if (x) x.onclick = cerrar;
    if (btn) btn.onclick = cerrar;
    ov.onclick = function (e) { if (e.target === ov) cerrar(); };
    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape" && ov.classList.contains("visible")) { cerrar(); document.removeEventListener("keydown", esc); }
    });

    ov.classList.add("visible");
  }

  function procesarAviso(m) {
    if (!m.aviso_activo) return;
    var version = m.aviso_version || ((m.aviso_titulo || "") + "|" + (m.aviso_texto || "")).slice(0, 120);
    if (leerVisto(version)) return;
    setTimeout(function () { mostrarAviso(m, version); }, 600);
  }

  function cargarMarca() {
    var url = backendUrl();
    if (!url) return;
    fetch(url + "?action=obtener_marca", { cache: "no-store" })
      .then(function (res) { return res.json(); })
      .then(function (d) {
        if (!d || d.result !== "success" || !d.marca) return;
        aplicarMarca(d.marca);
        procesarAviso(d.marca);
      })
      .catch(function () { /* sin conexión: se mantiene el contenido por defecto */ });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", cargarMarca);
  } else {
    cargarMarca();
  }
})();
