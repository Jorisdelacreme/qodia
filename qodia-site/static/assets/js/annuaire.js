/* Annuaire : recherche par nom, besoin, expertise, secteur et type */
(function () {
  "use strict";
  var list = document.getElementById("members");
  if (!list) return;
  var cards = Array.prototype.slice.call(list.querySelectorAll("[data-member]"));
  var q = document.getElementById("f-q");
  var fam = document.getElementById("f-family");
  var sec = document.getElementById("f-sector");
  var team = document.getElementById("f-team");
  var kindBtns = Array.prototype.slice.call(document.querySelectorAll("button[data-kind]"));
  var statusBtns = Array.prototype.slice.call(document.querySelectorAll("button[data-status]"));
  var status = "";
  var count = document.getElementById("dir-count");
  var empty = document.getElementById("dir-empty");
  var reset = document.querySelectorAll("[data-reset]");
  var kind = "";
  var searchTimer = null;

  function norm(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  }
  cards.forEach(function (c) { c._text = norm(c.getAttribute("data-search")); });

  function apply(push) {
    var terms = norm(q.value).split(" ").filter(Boolean);
    var f = fam.value, s = sec.value, tm = team ? team.value : "", n = 0;
    cards.forEach(function (c) {
      var ok = (!f || c.dataset.family === f) &&
        (!s || (c.dataset.sectors || "").split("|").indexOf(s) > -1) &&
        (!kind || c.dataset.kind === kind) &&
        (!status || c.dataset.status === status) &&
        (!tm || c.dataset.team === tm || (c.querySelector("a") || {}).pathname === "/membres/" + tm) &&
        terms.every(function (t) { return c._text.indexOf(t) > -1; });
      c.hidden = !ok;
      if (ok) n++;
    });
    count.textContent = n + (n > 1 ? " profils" : " profil");
    empty.classList.toggle("is-visible", n === 0);
    if (push) {
      var p = new URLSearchParams();
      if (q.value.trim()) p.set("q", q.value.trim());
      if (f) p.set("expertise", f);
      if (s) p.set("secteur", s);
      if (kind) p.set("type", kind);
      if (status) p.set("statut", status);
      if (tm) p.set("equipe", tm);
      var url = location.pathname + (p.toString() ? "?" + p.toString() : "");
      history.replaceState(null, "", url);
    }
  }

  function setStatus(k) {
    status = k;
    statusBtns.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.status === k)); });
  }
  function setKind(k) {
    kind = k;
    kindBtns.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.kind === k)); });
  }

  var params = new URLSearchParams(location.search);
  if (params.get("q")) q.value = params.get("q");
  if (params.get("expertise")) fam.value = params.get("expertise");
  if (params.get("secteur")) sec.value = params.get("secteur");
  setKind(params.get("type") || "");
  setStatus(params.get("statut") || "");
  if (team && params.get("equipe")) team.value = params.get("equipe");
  apply(false);

  q.addEventListener("input", function () {
    apply(true);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      if (q.value.trim().length > 2 && window.qodiaTrack) window.qodiaTrack("search", { search_term: q.value.trim().slice(0, 60) });
    }, 1200);
  });
  [fam, sec, team].filter(Boolean).forEach(function (el) {
    el.addEventListener("change", function () {
      apply(true);
      if (window.qodiaTrack) window.qodiaTrack("filter_annuaire", { filter: el.id, value: el.value });
    });
  });
  kindBtns.forEach(function (b) {
    b.addEventListener("click", function () { setKind(b.dataset.kind); apply(true); });
  });
  statusBtns.forEach(function (b) {
    b.addEventListener("click", function () { setStatus(b.dataset.status); apply(true); });
  });
  reset.forEach(function (r) {
    r.addEventListener("click", function () { q.value = ""; fam.value = ""; sec.value = ""; if (team) team.value = ""; setKind(""); setStatus(""); apply(true); q.focus(); });
  });
  document.getElementById("dir-form").addEventListener("submit", function (e) { e.preventDefault(); apply(true); });
})();
