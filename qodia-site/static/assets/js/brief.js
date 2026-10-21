/* Déposer un brief : formulaire en 4 étapes, pré-rempli depuis une fiche membre */
(function () {
  "use strict";
  var form = document.getElementById("brief-form");
  if (!form) return;
  var steps = Array.prototype.slice.call(form.querySelectorAll(".step"));
  var nav = Array.prototype.slice.call(document.querySelectorAll(".steps-nav li"));
  var current = 0;
  var memberWrap = document.getElementById("member-wrap");
  var memberSelect = document.getElementById("b-membre");

  function show(i, focus) {
    current = Math.max(0, Math.min(i, steps.length - 1));
    steps.forEach(function (s, k) { s.classList.toggle("is-active", k === current); });
    nav.forEach(function (li, k) {
      li.classList.toggle("is-current", k === current);
      li.classList.toggle("is-done", k < current);
      if (k === current) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    if (focus) {
      var h = steps[current].querySelector("h2");
      if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
      form.closest(".form-card").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (window.qodiaTrack && focus) window.qodiaTrack("brief_step", { step: current + 1 });
  }

  form.addEventListener("click", function (e) {
    var next = e.target.closest("[data-next]"), prev = e.target.closest("[data-prev]");
    if (next) { e.preventDefault(); if (window.qodiaValidate(steps[current])) show(current + 1, true); }
    if (prev) { e.preventDefault(); show(current - 1, true); }
  });

  /* Le formulaire ne s'envoie qu'à la dernière étape */
  form.addEventListener("submit", function (e) {
    if (current < steps.length - 1) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (window.qodiaValidate(steps[current])) show(current + 1, true);
    }
  }, true);

  function syncMode() {
    var m = form.querySelector('input[name="mode"]:checked');
    var rel = m && m.value === "mise-en-relation";
    memberWrap.hidden = !rel;
  }
  form.addEventListener("change", function (e) { if (e.target.name === "mode") syncMode(); });

  var p = new URLSearchParams(location.search);
  var membre = p.get("membre");
  var mode = p.get("mode");
  if (membre && memberSelect.querySelector('option[value="' + CSS.escape(membre) + '"]')) {
    memberSelect.value = membre;
    if (!mode) mode = "mise-en-relation";
    var name = memberSelect.options[memberSelect.selectedIndex].text;
    var note = document.getElementById("brief-context");
    if (note) { note.textContent = "Votre demande concerne " + name + "."; note.hidden = false; }
  }
  if (mode) {
    var r = form.querySelector('input[name="mode"][value="' + CSS.escape(mode) + '"]');
    if (r) r.checked = true;
  }
  var exp = p.get("expertise");
  if (exp) {
    var cb = form.querySelector('input[name="expertises"][value="' + CSS.escape(exp) + '"]');
    if (cb) cb.checked = true;
  }
  if (p.get("contact") === "rappel") {
    var c = form.querySelector('input[name="contact"][value="rappel"]');
    if (c) c.checked = true;
  }
  syncMode();
  show(0, false);
})();
