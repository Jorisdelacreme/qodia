/* Qodia : navigation, consentement cookies, analytics (GA4 + Clarity), formulaires */
(function () {
  "use strict";
  var CFG = window.QODIA_CONFIG || {};
  var doc = document.documentElement;
  doc.classList.remove("no-js");

  /* ---------- Stockage prudent (navigation privée, blocages) ---------- */
  function store(kind) {
    try { var s = window[kind]; var k = "__q"; s.setItem(k, "1"); s.removeItem(k); return s; } catch (e) { return null; }
  }
  var LS = store("localStorage"), SS = store("sessionStorage");
  function getJSON(s, k) { if (!s) return null; try { return JSON.parse(s.getItem(k) || "null"); } catch (e) { return null; } }
  function setJSON(s, k, v) { if (!s) return; try { s.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* ---------- Menu mobile ---------- */
  var burger = document.querySelector(".burger");
  var mnav = document.getElementById("mobile-nav");
  if (burger && mnav) {
    burger.addEventListener("click", function () {
      var open = burger.getAttribute("aria-expanded") === "true";
      burger.setAttribute("aria-expanded", String(!open));
      mnav.classList.toggle("is-open", !open);
    });
  }

  /* ---------- Attribution (UTM, gclid) pour les formulaires ---------- */
  (function captureAttribution() {
    var p = new URLSearchParams(location.search);
    var keys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "li_fat_id"];
    var found = {};
    keys.forEach(function (k) { if (p.get(k)) found[k] = p.get(k).slice(0, 200); });
    var existing = getJSON(SS, "qodia_attrib");
    if (Object.keys(found).length || !existing) {
      found.landing = location.pathname;
      found.referrer = document.referrer ? document.referrer.slice(0, 300) : "";
      setJSON(SS, "qodia_attrib", Object.keys(found).length > 2 || !existing ? found : existing);
    }
  })();

  /* ---------- Analytics ---------- */
  var loaded = { ga: false, clarity: false };
  function loadScript(src) { var s = document.createElement("script"); s.async = true; s.src = src; document.head.appendChild(s); }

  function loadGA() {
    if (loaded.ga || !CFG.GA4_ID) return;
    loaded.ga = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("consent", "default", {
      ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied",
      analytics_storage: "granted", functionality_storage: "granted", security_storage: "granted"
    });
    window.gtag("js", new Date());
    window.gtag("config", CFG.GA4_ID, { allow_google_signals: false, allow_ad_personalization_signals: false });
    loadScript("https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(CFG.GA4_ID));
  }

  function loadClarity() {
    if (loaded.clarity || !CFG.CLARITY_ID) return;
    loaded.clarity = true;
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, "clarity", "script", CFG.CLARITY_ID);
    window.clarity("consentv2", { ad_Storage: "denied", analytics_Storage: "granted" });
  }

  function deleteCookies(prefixes) {
    var host = location.hostname.split(".");
    var domains = ["", location.hostname];
    if (host.length > 1) domains.push("." + host.slice(-2).join("."));
    document.cookie.split(";").forEach(function (c) {
      var name = c.split("=")[0].trim();
      if (prefixes.some(function (p) { return name.indexOf(p) === 0; })) {
        domains.forEach(function (d) {
          document.cookie = name + "=; Max-Age=0; path=/" + (d ? "; domain=" + d : "");
        });
      }
    });
  }

  /* Suivi d'événements : n'envoie rien sans consentement */
  window.qodiaTrack = function (name, params) {
    params = params || {};
    if (loaded.ga && window.gtag) window.gtag("event", name, params);
    if (loaded.clarity && window.clarity) {
      window.clarity("event", name);
      if (params.form_type) window.clarity("set", "form_type", String(params.form_type));
    }
  };

  /* ---------- Consentement (CNIL : refuser aussi simple qu'accepter) ---------- */
  var CONSENT_KEY = "qodia_consent";
  var hasTrackers = !!(CFG.GA4_ID || CFG.CLARITY_ID);
  var banner = document.getElementById("consent");

  function readConsent() {
    var c = getJSON(LS, CONSENT_KEY);
    if (!c || c.v !== 1) return null;
    var maxAge = (CFG.CONSENT_MONTHS || 6) * 30.5 * 864e5;
    if (Date.now() - c.ts > maxAge) return null;
    return c;
  }
  function applyConsent(c) {
    if (c.analytics) loadGA(); else deleteCookies(["_ga", "_gid", "_gat"]);
    if (c.clarity) loadClarity(); else deleteCookies(["_clck", "_clsk", "CLID", "ANONCHK", "MR", "MUID", "SM"]);
  }
  function saveConsent(analytics, clarity) {
    var prev = readConsent();
    var c = { v: 1, ts: Date.now(), analytics: !!analytics, clarity: !!clarity };
    setJSON(LS, CONSENT_KEY, c);
    hideBanner();
    var revoked = prev && ((prev.analytics && !c.analytics) || (prev.clarity && !c.clarity));
    if (revoked) { applyConsent(c); location.reload(); return; }
    applyConsent(c);
  }
  function showBanner(withPrefs) {
    if (!banner) return;
    banner.hidden = false;
    var prefs = banner.querySelector(".consent__prefs");
    var c = readConsent();
    var ga = banner.querySelector("#consent-ga"), cl = banner.querySelector("#consent-clarity");
    if (ga) { ga.checked = !!(c && c.analytics); ga.closest(".toggle").hidden = !CFG.GA4_ID; }
    if (cl) { cl.checked = !!(c && c.clarity); cl.closest(".toggle").hidden = !CFG.CLARITY_ID; }
    if (prefs) prefs.hidden = !withPrefs;
    banner.querySelector("[data-consent-save]").hidden = !withPrefs;
    var first = banner.querySelector(".btn");
    if (first) first.focus({ preventScroll: true });
  }
  function hideBanner() { if (banner) banner.hidden = true; }

  if (banner) {
    banner.addEventListener("click", function (e) {
      var t = e.target.closest("button"); if (!t) return;
      if (t.hasAttribute("data-consent-accept")) saveConsent(true, true);
      else if (t.hasAttribute("data-consent-refuse")) saveConsent(false, false);
      else if (t.hasAttribute("data-consent-more")) showBanner(true);
      else if (t.hasAttribute("data-consent-save")) saveConsent(banner.querySelector("#consent-ga").checked, banner.querySelector("#consent-clarity").checked);
    });
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-consent-open]");
    if (t) { e.preventDefault(); if (hasTrackers) showBanner(true); else alertNoTrackers(t); }
  });
  function alertNoTrackers(el) {
    var note = document.createElement("span");
    note.className = "small"; note.setAttribute("role", "status");
    note.textContent = " Aucun cookie de mesure n'est utilisé pour le moment.";
    if (!el.nextElementSibling || !el.nextElementSibling.matches("[role=status]")) el.after(note);
  }

  if (hasTrackers) {
    var existing = readConsent();
    if (existing) applyConsent(existing); else showBanner(false);
  }

  /* ---------- Calendly ---------- */
  function calendlyHref(extra) {
    if (!CFG.CALENDLY_URL) return null;
    var u = new URL(CFG.CALENDLY_URL);
    u.searchParams.set("utm_source", "qodia.pro");
    Object.keys(extra || {}).forEach(function (k) { if (extra[k]) u.searchParams.set(k, extra[k]); });
    return u.toString();
  }
  document.querySelectorAll("[data-calendly]").forEach(function (a) {
    var href = calendlyHref();
    if (href) { a.href = href; a.target = "_blank"; a.rel = "noopener"; }
    else { a.href = a.getAttribute("data-fallback") || "/#rappel"; }
    a.addEventListener("click", function () { qodiaTrack(href ? "click_calendly" : "click_rappel", { location: a.getAttribute("data-calendly") || "" }); });
  });

  /* ---------- Formulaires ---------- */
  var MESSAGES = {
    valueMissing: "Ce champ est nécessaire.",
    typeMismatch: { email: "Indiquez une adresse e-mail valide, par exemple nom@entreprise.fr.", url: "Indiquez une adresse web complète, commençant par https://." },
    patternMismatch: "Le format n'est pas reconnu.",
    tooShort: "Ce texte est un peu court."
  };
  function fieldMessage(input) {
    var v = input.validity;
    if (v.valueMissing) return input.dataset.msgRequired || MESSAGES.valueMissing;
    if (v.typeMismatch) return MESSAGES.typeMismatch[input.type] || MESSAGES.patternMismatch;
    if (v.patternMismatch) return input.dataset.msgPattern || MESSAGES.patternMismatch;
    if (v.tooShort) return MESSAGES.tooShort;
    return "";
  }
  function validate(scope) {
    var firstBad = null;
    scope.querySelectorAll("input, select, textarea").forEach(function (input) {
      if (input.closest(".hp") || input.disabled || input.closest("[hidden]")) return;
      var field = input.closest(".field, .choices");
      if (!field) return;
      var ok = input.checkValidity();
      if (input.type === "radio" || input.type === "checkbox") {
        if (input.required) {
          var group = scope.querySelectorAll('input[name="' + input.name + '"]');
          ok = Array.prototype.some.call(group, function (i) { return i.checked; });
        } else ok = true;
      }
      var err = field.querySelector(".field__error");
      if (!ok) {
        field.classList.add("is-invalid");
        if (err) err.textContent = input.type === "radio" || input.type === "checkbox" ? (input.dataset.msgRequired || "Choisissez une option.") : fieldMessage(input);
        input.setAttribute("aria-invalid", "true");
        if (!firstBad) firstBad = input;
      } else {
        field.classList.remove("is-invalid");
        input.removeAttribute("aria-invalid");
      }
    });
    if (firstBad) firstBad.focus();
    return !firstBad;
  }
  window.qodiaValidate = validate;

  document.addEventListener("input", function (e) {
    var f = e.target.closest(".field.is-invalid, .choices.is-invalid");
    if (f && e.target.checkValidity()) { f.classList.remove("is-invalid"); e.target.removeAttribute("aria-invalid"); }
  });
  document.addEventListener("change", function (e) {
    var f = e.target.closest(".choices.is-invalid");
    if (f) f.classList.remove("is-invalid");
  });

  function serialize(form) {
    var data = {};
    new FormData(form).forEach(function (value, key) {
      if (typeof value !== "string") return;
      if (data[key] !== undefined) { data[key] = [].concat(data[key], value); }
      else data[key] = value;
    });
    form.querySelectorAll('input[type=checkbox][data-multi]').forEach(function (cb) {
      if (data[cb.name] !== undefined && !Array.isArray(data[cb.name])) data[cb.name] = [data[cb.name]];
    });
    return data;
  }

  document.querySelectorAll("form[data-lead-form]").forEach(function (form) {
    var started = Date.now();
    var startedTracked = false;
    form.addEventListener("focusin", function () {
      if (!startedTracked) { startedTracked = true; qodiaTrack("form_start", { form_type: form.dataset.leadForm }); }
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!validate(form)) return;
      var btn = form.querySelector("[type=submit]");
      var status = form.querySelector(".form__status");
      var label = btn ? btn.innerHTML : "";
      if (btn) { btn.disabled = true; btn.textContent = "Envoi en cours…"; }
      if (status) { status.className = "form__status"; status.textContent = ""; }

      var payload = serialize(form);
      payload.form_type = form.dataset.leadForm;
      payload.page = location.pathname;
      payload.elapsed_ms = Date.now() - started;
      payload.attribution = getJSON(SS, "qodia_attrib") || {};

      fetch(CFG.LEAD_ENDPOINT || "/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload)
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || !j.ok) throw new Error(j.error || "Erreur " + r.status); return j; });
      }).then(function () {
        form.classList.add("is-sent");
        var cal = form.querySelector("[data-calendly-prefill]");
        if (cal) {
          var name = [payload.prenom, payload.nom].filter(Boolean).join(" ");
          var href = calendlyHref({ name: name, email: payload.email });
          if (href && payload.contact === "calendly") { cal.href = href; cal.target = "_blank"; cal.rel = "noopener"; cal.hidden = false; }
          else cal.hidden = true;
        }
        var title = form.querySelector(".form__success h2, .form__success h3");
        if (title) { title.setAttribute("tabindex", "-1"); title.focus(); }
        qodiaTrack("generate_lead", { form_type: payload.form_type, mode: payload.mode || "", contact_pref: payload.contact || "", member: payload.membre || "" });
        if (form.closest(".form-card")) form.closest(".form-card").scrollIntoView({ behavior: "smooth", block: "start" });
      }).catch(function (err) {
        if (status) {
          status.className = "form__status is-error";
          status.innerHTML = "L'envoi n'a pas abouti (" + String(err.message).replace(/[<>&]/g, "") + "). Réessayez dans un instant, ou écrivez-nous à <a href=\"mailto:hello@delacreme.pro\">hello@delacreme.pro</a>.";
          status.setAttribute("tabindex", "-1");
          status.focus();
        }
        qodiaTrack("form_error", { form_type: payload.form_type });
      }).finally(function () {
        if (btn) { btn.disabled = false; btn.innerHTML = label; }
      });
    });
  });

  /* Clics sortants vers les sites des membres */
  document.addEventListener("click", function (e) {
    var a = e.target.closest("a[data-track]");
    if (a) qodiaTrack(a.dataset.track, { label: a.dataset.trackLabel || a.textContent.trim().slice(0, 80) });
  });
})();
