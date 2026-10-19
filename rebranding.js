/* ================================================================
   rebranding.js (v4) — AULA DIGITAL
   Lee la marca y el aviso emergente que se configuran en EVA-DOC
   (pestaña "Config & Marca"). Sin contraseña y sin panel propio.

   - Aplica título, eslogan y logo institucional.
   - Muestra el aviso emergente SOLO si está activo en EVA-DOC.
   - El aviso aparece una vez por sesión y versión; se vuelve a consultar
     sin caché al entrar y cambia de versión cuando se edita o reactiva.
   Requiere: SCRIPT_URL (declarado en script.js) y los ids del index.
   ================================================================ */
(function () {
  "use strict";

  var DEFAULT_TITLE = "GRUPO CENTED ACADEMY PRO EDUCATION";
  var DEFAULT_SLOGAN = "DEPARTAMENTO DE SISTEMAS INFORMÁTICOS";
  var KEY_PREFIX = "cented_aviso_sesion_";

  function $(id) { return document.getElementById(id); }

  function backendUrl() {
    return (typeof SCRIPT_URL === "string") ? SCRIPT_URL : "";
  }

  function leerVisto(version) {
    try { return sessionStorage.getItem(KEY_PREFIX + version) === "1"; } catch (e) { return false; }
  }

  function marcarVisto(version) {
    try { sessionStorage.setItem(KEY_PREFIX + version, "1"); } catch (e) { /* navegador sin almacenamiento */ }
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
    if (!wrap) return;
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

    var titulo = $("aviso-titulo-txt"); if (titulo) titulo.textContent = m.aviso_titulo || "Aviso institucional";
    var texto = $("aviso-texto-txt"); if (texto) texto.textContent = m.aviso_texto || "";

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

  function valorActivo(value) {
    return value === true || value === 1 || String(value).toLowerCase() === "true" || String(value) === "1";
  }

  function procesarAviso(m) {
    if (!valorActivo(m.aviso_activo)) return;
    var version = m.aviso_version || ((m.aviso_titulo || "") + "|" + (m.aviso_texto || "") + "|" + (m.banner_url || "")).slice(0, 180);
    if (leerVisto(version)) return;
    setTimeout(function () { mostrarAviso(m, version); }, 350);
  }

  function cargarMarca(intento) {
    intento = intento || 0;
    var url = backendUrl();
    if (!url) return;
    var sep = url.indexOf("?") === -1 ? "?" : "&";
    fetch(url + sep + "action=obtener_marca&_=" + Date.now(), { cache: "no-store", redirect: "follow" })
      .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(function (d) {
        if (!d || d.result !== "success" || !d.marca) throw new Error("Respuesta de marca vacía");
        aplicarMarca(d.marca);
        procesarAviso(d.marca);
      })
      .catch(function () {
        // Reintentos breves reducen los casos en que el aviso no llega al entrar al Aula.
        if (intento < 2) setTimeout(function () { cargarMarca(intento + 1); }, 900 * (intento + 1));
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", cargarMarca);
  } else {
    cargarMarca();
  }
})();
