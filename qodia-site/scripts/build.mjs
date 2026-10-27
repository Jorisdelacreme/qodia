// Qodia : générateur du site statique (Node 18+, sans dépendance).
// Lit data/*.json, src/pages/*.html et src/blog/*.html, écrit dist/.
// Les fiches membres viennent de data/members.json, ou du CRM si
// la variable d'environnement CRM_MEMBERS_URL est définie (voir README).
import { readFile, writeFile, mkdir, readdir, cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const BUILD_DATE = new Date().toISOString().slice(0, 10);
/* Version des CSS/JS : change à chaque modification, pour que les navigateurs ne gardent pas l'ancienne version en cache */
import { createHash } from "node:crypto";
const ASSET_V = await (async () => {
  const h = createHash("sha1");
  for (const dir of ["static/assets/css", "static/assets/js"]) for (const f of (await readdir(path.join(ROOT, dir))).sort()) h.update(await readFile(path.join(ROOT, dir, f)));
  return h.digest("hex").slice(0, 8);
})();
const v = (src) => (src.startsWith("/assets/") ? `${src}?v=${ASSET_V}` : src);

const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slugify = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, "et").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const initials = (name) => {
  const w = name.replace(/[^A-Za-zÀ-ÿ0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  if (/^\d/.test(w[0] || "")) return w[0].slice(0, 2);
  return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || "Q").slice(0, 2)).toUpperCase();
};
const KIND = { agence: "Agence", freelance: "Freelance", employe: "En poste" };
/* Statut de référencement : membre (a rejoint le cercle) ou recommandé (sélectionné par Qodia, sans adhésion) */
const STATUS = { membre: "Membre Qodia", recommande: "Recommandé par Qodia" };

async function json(p) { return JSON.parse(await readFile(path.join(ROOT, p), "utf8")); }

async function loadMembers() {
  const url = process.env.CRM_MEMBERS_URL;
  if (url) {
    try {
      const headers = process.env.CRM_TOKEN ? { Authorization: `Bearer ${process.env.CRM_TOKEN}` } : {};
      const r = await fetch(url, { headers });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      console.log(`Membres chargés depuis le CRM (${(data.members || data).length}).`);
      return data.members || data;
    } catch (e) {
      console.warn(`CRM indisponible (${e.message}) : repli sur data/members.json.`);
    }
  }
  return (await json("data/members.json")).members;
}

const site = await json("data/site.json");
const home = await json("data/home.json");
const FAM = Object.fromEntries(site.families.map((f) => [f.id, f]));
const rank = (m) => (m.sponsored ? 0 : 4) + (m.featured ? 0 : 2) + (m.status === "membre" ? 0 : 1);
const members = (await loadMembers()).filter((m) => m.visible !== false)
  .map((m) => ({ ...m, slug: m.slug || slugify(m.name), status: m.status === "membre" ? "membre" : "recommande", sponsored: !!m.sponsored }))
  .sort((a, b) => rank(a) - rank(b) || String(a.name).localeCompare(String(b.name), "fr"));
const BY_SLUG = Object.fromEntries(members.map((m) => [m.slug, m]));
/* Équipes : un expert « en poste » appartient à une agence du cercle (champ employer = slug de l'agence) */
const teamOf = (m) => (m.kind === "employe" && m.employer && BY_SLUG[m.employer]) || null;
const rosterOf = (a) => members.filter((o) => o.kind === "employe" && o.employer === a.slug);
/* Accès libre : profils à la une et profils sponsorisés */
const isOpen = (m) => !!(m.featured || m.sponsored);
const SECTORS = [...new Set(members.flatMap((m) => m.sectors || []))].sort((a, b) => a.localeCompare(b, "fr"));
const COLORS = { violet: "#350085", rouge: "#FF294A", jaune: "#FFD300", cyan: "#00F3E9" };

/* ------------------------------------------------------------------ */
/* Logos des agences : sans logo ajouté dans l'Éditeur, on récupère    */
/* l'icône du site de l'agence au moment du build (apple-touch-icon,   */
/* icône déclarée, puis service d'icônes Google), copiée sur qodia.pro */
/* ------------------------------------------------------------------ */
const LOGO_FILES = [];
const LOGO_REPORT = [];
const UA = { "User-Agent": "Mozilla/5.0 (compatible; QodiaBot/1.0; +https://qodia.pro)", Accept: "*/*" };
async function get(url, ms = 7000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { headers: UA, redirect: "follow", signal: ctl.signal }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r; }
  finally { clearTimeout(t); }
}
function imageSize(buf, type) {
  if (type.includes("svg")) return 999;
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return Math.min(buf.readUInt32BE(16), buf.readUInt32BE(20));
  if (buf.length > 6 && buf.readUInt16LE(0) === 0 && buf.readUInt16LE(2) === 1) { let m = 0; for (let i = 0; i < buf.readUInt16LE(4); i++) { const w = buf[6 + i * 16] || 256; m = Math.max(m, w); } return m; }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) { let i = 2; while (i < buf.length - 9) { if (buf[i] !== 0xff) { i++; continue; } const mk = buf[i + 1]; if (mk >= 0xc0 && mk <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(mk)) return Math.min(buf.readUInt16BE(i + 5), buf.readUInt16BE(i + 7)); i += 2 + buf.readUInt16BE(i + 2); } }
  if (buf.length > 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return 128;
  return 0;
}
function iconCandidates(html, base) {
  const out = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const rel = (tag.match(/\brel=["']?([^"'>]+)/i) || [])[1] || "";
    const href = (tag.match(/\bhref=["']?([^"'\s>]+)/i) || [])[1];
    if (!href || !/icon/i.test(rel) || /mask-icon/i.test(rel)) continue;
    const sizes = (tag.match(/\bsizes=["']?([^"'>]+)/i) || [])[1] || "";
    const size = Math.max(0, ...sizes.split(/\s+/).map((x) => parseInt(x, 10) || 0));
    const svg = /\.svg(\?|$)/i.test(href) || /svg/i.test(tag);
    let score = /apple-touch/i.test(rel) ? 1000 + (size || 180) : svg ? 900 : size;
    try { out.push({ url: new URL(href.replace(/&amp;/g, "&"), base).href, score }); } catch {}
  }
  return out.sort((a, b) => b.score - a.score);
}
async function fetchLogo(m) {
  const site = m.website;
  let html = "", base = site;
  try { const r = await get(site); html = await r.text(); base = r.url || site; } catch (e) { LOGO_REPORT.push({ slug: m.slug, error: "site " + e.message }); }
  const host = (() => { try { return new URL(base).hostname; } catch { return ""; } })();
  const cands = [...iconCandidates(html, base).map((c) => c.url)];
  if (host) cands.push(`https://${host}/apple-touch-icon.png`, `https://www.google.com/s2/favicons?domain=${host}&sz=256`);
  for (const url of [...new Set(cands)]) {
    try {
      const r = await get(url);
      const type = (r.headers.get("content-type") || "").toLowerCase();
      const buf = Buffer.from(await r.arrayBuffer());
      const svgText = buf.slice(0, 400).toString("utf8");
      const isSvg = type.includes("svg") || /<svg[\s>]/i.test(svgText);
      if (!isSvg && !type.startsWith("image/")) continue;
      if (buf.length < 100 || buf.length > 1_500_000) continue;
      const size = imageSize(buf, isSvg ? "svg" : type);
      if (size && size < 64) continue;
      const ext = isSvg ? "svg" : type.includes("png") ? "png" : type.includes("jpeg") || type.includes("jpg") ? "jpg" : type.includes("webp") ? "webp" : type.includes("icon") ? "ico" : "png";
      const rel = `/assets/logos/membres/${m.slug}.${ext}`;
      LOGO_FILES.push([rel, buf]);
      LOGO_REPORT.push({ slug: m.slug, source: url, size: size || null });
      return rel;
    } catch {}
  }
  LOGO_REPORT.push({ slug: m.slug, error: "aucune icône exploitable" });
  return "";
}
async function resolveLogos(list) {
  const todo = list.filter((m) => m.kind === "agence" && !m.logo && m.website);
  if (!todo.length || process.env.QODIA_SKIP_LOGOS) return;
  let i = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (i < todo.length) { const m = todo[i++]; const logo = await fetchLogo(m); if (logo) { m.logo = logo; m.logoAuto = true; } }
  }));
  console.log(`Logos d'agences récupérés : ${todo.filter((m) => m.logo).length}/${todo.length}.`);
}
await resolveLogos(members);

/* ------------------------------------------------------------------ */
/* Éléments communs                                                    */
/* ------------------------------------------------------------------ */
const ICON = {
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  ext: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline"><path d="M7 17 17 7M9 7h8v8"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5 10 17 19 7"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>'
};

function head(meta) {
  const url = site.url + (meta.path === "/" ? "/" : meta.path);
  const title = meta.path === "/" ? meta.title : `${meta.title} · Qodia`;
  const og = meta.ogImage || "/assets/img/og-qodia.png";
  return `<!doctype html>
<html lang="fr" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(meta.description)}">
<link rel="canonical" href="${esc(url)}">
${meta.noindex ? '<meta name="robots" content="noindex">' : ""}
<meta property="og:type" content="${meta.ogType || "website"}">
<meta property="og:site_name" content="Qodia">
<meta property="og:locale" content="fr_FR">
<meta property="og:title" content="${esc(meta.ogTitle || meta.title)}">
<meta property="og:description" content="${esc(meta.description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${site.url}${og}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#350085">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600;700&family=JetBrains+Mono:wght@500&display=swap">
<link rel="stylesheet" href="${v("/assets/css/qodia.css")}">
<script>try{if(localStorage.getItem("qodia_access"))document.documentElement.classList.add("has-access")}catch(e){}</script>
<script src="${v("/assets/js/config.js")}"></script>
<script src="${v("/assets/js/site.js")}" defer></script>
${(meta.scripts || []).map((s) => `<script src="${v(s)}" defer></script>`).join("\n")}
${meta.jsonld ? `<script type="application/ld+json">${JSON.stringify(meta.jsonld)}</script>` : ""}
</head>
<body>
<a class="skip" href="#contenu">Aller au contenu</a>`;
}

function header(active) {
  const links = [
    ["annuaire", "/annuaire", "Explorer le cercle"],
    ["comment", "/#comment-ca-marche", "Comment ça marche"],
    ["rejoindre", "/rejoindre", "Rejoindre le cercle"],
    ["blog", "/blog", "Blog"],
    ["faq", "/faq", "FAQ"]
  ];
  const nav = links.map(([id, href, label]) => `<a href="${href}"${id === active ? ' aria-current="page"' : ""}>${label}</a>`).join("");
  const mnav = links.map(([, href, label]) => `<a class="mnav" href="${href}">${label}</a>`).join("");
  return `<header class="site-header">
  <div class="wrap site-header__inner">
    <a class="site-header__logo" href="/" aria-label="Qodia, accueil"><img src="/assets/img/qodia-logo.svg" alt="Qodia" width="146" height="28"></a>
    <nav class="nav" aria-label="Navigation principale">${nav}</nav>
    <div class="site-header__ctas">
      <a class="btn btn--secondary btn--sm" href="/#rappel" data-calendly="header">Réserver un appel</a>
      <a class="btn btn--primary btn--sm" href="/brief">Déposer un brief</a>
    </div>
    <button class="burger" type="button" aria-expanded="false" aria-controls="mobile-nav"><span class="bars"></span><span class="sr-only">Menu</span></button>
  </div>
  <div class="wrap mobile-nav" id="mobile-nav">
    <nav aria-label="Navigation mobile">${mnav}</nav>
    <div class="btns">
      <a class="btn btn--primary btn--block" href="/brief">Déposer un brief</a>
      <a class="btn btn--secondary btn--block" href="/#rappel" data-calendly="menu-mobile">Réserver un appel</a>
    </div>
  </div>
</header>`;
}

function footer() {
  return `<footer class="site-footer on-brand">
  <div class="wrap">
    <div class="site-footer__grid">
      <div class="site-footer__brand">
        <img src="/assets/img/qodia-signature-blanc.svg" alt="Qodia, beyond the code" width="190" height="56">
        <p>Le cercle fermé des spécialistes du branding et du marketing digital. Une initiative DeLaCrème.</p>
        <p><a href="mailto:${site.email}">${site.email}</a></p>
      </div>
      <div>
        <h2>Clients</h2>
        <ul>
          <li><a href="/annuaire">Explorer le cercle</a></li>
          <li><a href="/brief">Déposer un brief</a></li>
          <li><a href="/#comment-ca-marche">Comment ça marche</a></li>
          <li><a href="/#rappel" data-calendly="footer">Réserver un appel</a></li>
        </ul>
      </div>
      <div>
        <h2>Membres</h2>
        <ul>
          <li><a href="/rejoindre">Rejoindre le cercle</a></li>
          <li><a href="/faq#membres">FAQ membres</a></li>
        </ul>
      </div>
      <div>
        <h2>Qodia</h2>
        <ul>
          <li><a href="/blog">Blog</a></li>
          <li><a href="/faq">FAQ</a></li>
          <li><a href="https://www.delacreme.pro" rel="noopener">DeLaCrème</a></li>
        </ul>
      </div>
    </div>
    <div class="site-footer__bottom">
      <span>© ${new Date().getFullYear()} Qodia, une initiative DeLaCrème</span>
      <span style="display:flex;gap:20px;flex-wrap:wrap">
        <a href="/mentions-legales">Mentions légales et CGU</a>
        <a href="/confidentialite">Confidentialité</a>
        <a href="/cookies">Cookies</a>
        <button type="button" class="linklike" data-consent-open>Gérer les cookies</button>
      </span>
    </div>
  </div>
</footer>
<div class="consent" id="consent" role="dialog" aria-labelledby="consent-title" aria-describedby="consent-desc" hidden>
  <h2 id="consent-title">Vos choix de cookies</h2>
  <p id="consent-desc">Avec votre accord, nous mesurons l'audience du site (Google Analytics) et analysons la navigation de façon anonymisée (Microsoft Clarity) pour l'améliorer. Rien n'est déposé si vous refusez. Vous pouvez changer d'avis à tout moment depuis le pied de page. <a href="/cookies">En savoir plus</a></p>
  <div class="consent__prefs" hidden>
    <div class="toggle"><span><strong>Nécessaires</strong><small>Mémorisent votre choix de cookies. Toujours actifs.</small></span><input type="checkbox" checked disabled aria-label="Cookies nécessaires, toujours actifs"></div>
    <label class="toggle"><span><strong>Mesure d'audience</strong><small>Google Analytics 4 : pages vues, sources de trafic, conversions.</small></span><input type="checkbox" id="consent-ga"></label>
    <label class="toggle"><span><strong>Analyse de navigation</strong><small>Microsoft Clarity : cartes de clics et sessions anonymisées.</small></span><input type="checkbox" id="consent-clarity"></label>
  </div>
  <div class="consent__actions">
    <button type="button" class="btn btn--secondary" data-consent-refuse>Tout refuser</button>
    <button type="button" class="btn btn--primary" data-consent-accept>Tout accepter</button>
    <button type="button" class="btn btn--primary" data-consent-save hidden style="grid-column:1/-1">Enregistrer mes choix</button>
    <button type="button" class="consent__more" data-consent-more>Personnaliser</button>
  </div>
</div>
</body>
</html>`;
}

function page(meta, body) {
  return `${head(meta)}\n${header(meta.nav)}\n<main id="contenu">\n${body}\n</main>\n${footer()}`;
}

/* ------------------------------------------------------------------ */
/* Composants                                                          */
/* ------------------------------------------------------------------ */
function avatar(m, size = "") {
  const cls = `avatar ${size ? "avatar--" + size : ""}`;
  if (m.logo) return `<span class="${cls} ${m.logoAuto ? "avatar--icon" : "avatar--logo"}"><img src="${esc(m.logo)}" alt="" loading="lazy"></span>`;
  if (m.photo) return `<span class="${cls} avatar--photo"><img src="${esc(m.photo)}" alt="" loading="lazy"></span>`;
  return `<span class="${cls} avatar--${m.color || "violet"}" aria-hidden="true">${esc(initials(m.name))}</span>`;
}
function coverStyle(m) { return m.cover ? "" : ` cov--${m.color || "violet"} cov-motif`; }
const memberUrl = (m) => `/membres/${m.slug}`;

function card(m, headingLevel = "h3") {
  const refs = (m.references || []).slice(0, 3);
  const search = [m.name, m.headline, (m.skills || []).join(" "), (m.tools || []).join(" "), (m.sectors || []).join(" "), (m.references || []).join(" "), m.city, FAM[m.family]?.label, KIND[m.kind]].join(" ");
  const locked = !isOpen(m);
  const t = teamOf(m);
  return `<article class="card${locked ? " is-locked" : ""}${m.sponsored ? " card--sponsored" : ""}"${locked ? " data-locked" : ""} data-member data-family="${esc(m.family)}" data-kind="${esc(m.kind)}" data-status="${m.status}"${t ? ` data-team="${esc(t.slug)}"` : ""} data-sectors="${esc((m.sectors || []).join("|"))}" data-search="${esc(search + (t ? " " + t.name : ""))}"${t ? ` style="--team:${COLORS[t.color] || COLORS.violet}"` : ""}>
  <div class="card__cover${coverStyle(t && !m.cover ? { ...m, color: t.color } : m)}">${m.cover ? `<img class="cover-img" src="${esc(m.cover)}" alt="" loading="lazy">` : ""}<span class="card__badges">${m.sponsored ? '<span class="badge badge--jaune">Sponsorisé</span>' : ""}${statusBadge(m, true)}</span></div>
  <div class="card__avatar">${avatar(m)}</div>
  <div class="card__body">
    ${teamLine(m)}
    <${headingLevel} class="card__name"><a href="${memberUrl(m)}" data-track="click_member_card" data-track-label="${esc(m.name)}">${esc(m.name)}</a></${headingLevel}>
    <p class="card__meta">${esc([FAM[m.family]?.label, m.city].filter(Boolean).join(" · "))}</p>
    <p class="card__role">${esc(m.headline)}</p>
    ${refs.length ? `<div class="card__refs"><span class="label">A travaillé pour</span><p>${esc(refs.join(", "))}</p></div>` : ""}
  </div>
</article>`;
}

/* Statut et « maillot » d'équipe */
function statusBadge(m, onCover = false) {
  if (m.status === "membre") return `<span class="badge ${onCover ? "badge--onlight" : "badge--brand"}" title="A rejoint le cercle Qodia">Membre</span>`;
  return `<span class="badge ${onCover ? "badge--onlight badge--outline" : "badge--neutral"}" title="Sélectionné par l'équipe Qodia, n'a pas encore rejoint le cercle">Recommandé</span>`;
}
function teamMark(t, size = "xs") { return avatar(t, size); }
function teamLine(m, big = false) {
  const t = teamOf(m);
  if (t) return `<p class="team${big ? " team--lg" : ""}" style="--team:${COLORS[t.color] || COLORS.violet}">${teamMark(t)}<span><span class="team__label">En poste chez</span> ${big ? `<a href="${memberUrl(t)}">${esc(t.name)}</a>` : esc(t.name)}</span></p>`;
  if (m.kind === "employe") return `<p class="team${big ? " team--lg" : ""}"><span class="team__dot" aria-hidden="true"></span><span><span class="team__label">En poste</span>${m.employerName ? " chez " + esc(m.employerName) : ""}</span></p>`;
  if (m.kind === "freelance") return `<p class="team team--free${big ? " team--lg" : ""}"><span class="team__dot" aria-hidden="true"></span><span class="team__label">Indépendant</span></p>`;
  const n = rosterOf(m).length;
  return `<p class="team team--agency${big ? " team--lg" : ""}"><span class="team__dot" aria-hidden="true"></span><span><span class="team__label">Agence</span>${n ? ` · ${n} expert${n > 1 ? "s" : ""} sur Qodia` : ""}</span></p>`;
}

function logosGrid() {
  return `<ul class="logos__grid">${site.brands.map((b) => {
    const tall = /ffr|lnv|paris-basketball|caves/.test(b.logo);
    return `<li><img src="${b.logo}" alt="${esc(b.name)}" loading="lazy"${tall ? ' class="is-tall"' : ""}></li>`;
  }).join("")}</ul>`;
}

function familyCards() {
  const dots = ["var(--violet)", "var(--rouge)", "var(--cyan)", "var(--jaune)", "var(--rouge)", "var(--violet)"];
  return site.families.map((f, i) => {
    const n = members.filter((m) => m.family === f.id).length;
    return `<a class="family" href="/annuaire?expertise=${f.id}"><span class="family__dot" style="background:${dots[i]}" aria-hidden="true"></span><h3>${esc(f.label)}</h3><p>${esc(f.desc)}</p><span class="family__count">${n ? `${n} ${n > 1 ? "membres visibles" : "membre visible"}` : "Sur brief"}</span></a>`;
  }).join("");
}

function callbackForm(id = "rappel") {
  return `<form class="form" data-lead-form="rappel" action="/api/lead" method="post" novalidate><input type="hidden" name="form_type" value="rappel">
  <div class="form__success" role="status">
    <div class="form__success-icon">${ICON.check}</div>
    <h3>C'est noté, on vous rappelle.</h3>
    <p class="muted">Un membre de l'équipe vous appelle aujourd'hui, ou le prochain jour ouvré si votre demande arrive après 17 h.</p>
  </div>
  <h3>Être rappelé aujourd'hui</h3>
  <div class="row">
    <div class="field"><label class="field__label" for="${id}-prenom">Prénom et nom</label><input class="field__input" id="${id}-prenom" name="nom" autocomplete="name" required><span class="field__error"></span></div>
    <div class="field"><label class="field__label" for="${id}-tel">Téléphone</label><input class="field__input" id="${id}-tel" name="telephone" type="tel" autocomplete="tel" required pattern="[0-9 +\-\.\(\)]{8,20}" data-msg-pattern="Indiquez un numéro de téléphone, par exemple 06 12 34 56 78."><span class="field__error"></span></div>
  </div>
  <div class="row">
    <div class="field"><label class="field__label" for="${id}-societe">Entreprise <span class="opt">(facultatif)</span></label><input class="field__input" id="${id}-societe" name="entreprise" autocomplete="organization"></div>
    <div class="field"><label class="field__label" for="${id}-creneau">Le meilleur moment</label><select class="field__input" id="${id}-creneau" name="creneau"><option>Dès que possible</option><option>Ce matin</option><option>Cet après-midi</option><option>En fin de journée</option></select></div>
  </div>
  <div class="field"><label class="field__label" for="${id}-sujet">En une phrase, votre besoin <span class="opt">(facultatif)</span></label><input class="field__input" id="${id}-sujet" name="message" maxlength="300"></div>
  <div class="hp" aria-hidden="true"><label>Ne pas remplir <input name="website" tabindex="-1" autocomplete="off"></label></div>
  <p class="form__status" aria-live="polite"></p>
  <button class="btn btn--primary btn--block" type="submit">Être rappelé ${ICON.arrow}</button>
  <p class="form__legal">Vos coordonnées servent uniquement à vous rappeler et à suivre votre demande. <a href="/confidentialite">Confidentialité</a></p>
</form>`;
}

function blogArt(seed, color) {
  // Illustration abstraite tirée du symbole Qodia (chevrons), unique par article
  const pal = [COLORS.rouge, COLORS.jaune, COLORS.cyan];
  const bg = COLORS[color] || COLORS.violet;
  let s = 0; for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  let shapes = "";
  for (let i = 0; i < 5; i++) {
    const x = 40 + rnd() * 520, y = 20 + rnd() * 300, k = 0.5 + rnd() * 0.9;
    const c = pal[(i + Math.floor(rnd() * 3)) % 3] === bg ? COLORS.violet : pal[(i + Math.floor(rnd() * 3)) % 3];
    shapes += `<path transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) scale(${k.toFixed(2)})" d="M0 0 L60 60 L0 120 L-22 98 L16 60 L-22 22 Z" fill="${c}"/>`;
  }
  return `<svg viewBox="0 0 640 400" preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true"><rect width="640" height="400" fill="${bg}"/>${shapes}</svg>`;
}

/* ------------------------------------------------------------------ */
/* Blog                                                                */
/* ------------------------------------------------------------------ */
function parseMeta(src) {
  const m = src.match(/^<!--meta\s*([\s\S]*?)-->\s*/);
  if (!m) return [{}, src];
  return [JSON.parse(m[1]), src.slice(m[0].length)];
}

/* Markdown minimal (articles écrits dans l'éditeur) : titres, paragraphes, listes, citations, tableaux, gras, italique, liens */
function mdInline(t) {
  return esc(t)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)([^*]+?)\*/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, url) => `<a href="${url}">${txt}</a>`);
}
function markdown(src) {
  const lines = String(src).replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;
  const isBlockStart = (l) => /^(#{2,4}\s|>\s?|[-*]\s|\d+\.\s|\|)/.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{2,4})\s+(.*)$/))) { out.push(`<h${m[1].length}>${mdInline(m[2])}</h${m[1].length}>`); i++; continue; }
    if (/^>\s?/.test(l)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote>${markdown(buf.join("\n"))}</blockquote>`); continue;
    }
    if (/^[-*]\s/.test(l) || /^\d+\.\s/.test(l)) {
      const ordered = /^\d+\.\s/.test(l), re = ordered ? /^\d+\.\s+/ : /^[-*]\s+/, items = [];
      while (i < lines.length && re.test(lines[i])) {
        let item = lines[i++].replace(re, "");
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !re.test(lines[i].trim())) item += " " + lines[i++].trim();
        items.push(`<li>${mdInline(item)}</li>`);
      }
      out.push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`); continue;
    }
    if (/^\|/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(rows[0]), body = rows.slice(/^\|\s*:?-{2,}/.test(rows[1] || "") ? 2 : 1);
      out.push(`<div class="table-scroll"><table><thead><tr>${head.map((c) => `<th>${mdInline(c)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${mdInline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !(para.length && isBlockStart(lines[i]))) para.push(lines[i++].trim());
    out.push(`<p>${mdInline(para.join(" "))}</p>`);
  }
  return out.join("\n");
}

const fmtDate = (d) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

const posts = [];
for (const f of (await readdir(path.join(ROOT, "src/blog"))).filter((f) => /\.(html|md)$/.test(f))) {
  const [meta, raw] = parseMeta(await readFile(path.join(ROOT, "src/blog", f), "utf8"));
  if (meta.draft) continue;
  posts.push({ ...meta, slug: f.replace(/\.(html|md)$/, ""), body: f.endsWith(".md") ? markdown(raw) : raw });
}
posts.sort((a, b) => b.date.localeCompare(a.date));

function postCard(p) {
  return `<a class="post-card" href="/blog/${p.slug}"><div class="post-card__media">${blogArt(p.slug, p.color)}</div><span class="label">${esc(p.category)} · ${fmtDate(p.date)}</span><h3>${esc(p.title)}</h3><p>${esc(p.excerpt)}</p></a>`;
}

/* ------------------------------------------------------------------ */
/* Fiche membre                                                        */
/* ------------------------------------------------------------------ */
function memberPage(m) {
  const fam = FAM[m.family];
  const others = members.filter((o) => o.slug !== m.slug && !(m.kind === "agence" && o.employer === m.slug)).sort((a, b) => ((b.employer && b.employer === m.employer) - (a.employer && a.employer === m.employer)) || ((b.family === m.family) - (a.family === m.family))).slice(0, 3);
  const refLogos = m.referenceLogos || {};
  const open = isOpen(m), t = teamOf(m), roster = m.kind === "agence" ? rosterOf(m) : [];
  const site_ = m.website ? `<a${open ? "" : ' class="needs-access"'} href="${esc(m.website)}" rel="noopener" target="_blank" data-track="click_member_website" data-track-label="${esc(m.name)}">${esc(m.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))} ${ICON.ext}</a>` : "";
  const projects = (m.projects || []).filter((p) => p.image);
  const brief = (mode) => `/brief?membre=${m.slug}&mode=${mode}`;
  const jsonld = {
    "@context": "https://schema.org",
    "@type": m.kind === "agence" ? "Organization" : "Person",
    name: m.name, description: m.headline, url: site.url + memberUrl(m),
    ...(m.website ? { sameAs: [m.website] } : {}),
    ...(m.kind === "agence" ? {} : { jobTitle: m.headline }),
    ...(t ? { worksFor: { "@type": "Organization", name: t.name, url: site.url + memberUrl(t) } } : {}),
    ...(roster.length ? { employee: roster.map((e) => ({ "@type": "Person", name: e.name, jobTitle: e.headline, url: site.url + memberUrl(e) })) } : {})
  };
  const optOut = `mailto:${site.email}?subject=${encodeURIComponent("Fiche Qodia : " + m.name)}`;
  const body = `
<div class="profile-cover${coverStyle(t && !m.cover ? { ...m, color: t.color } : m)}">${m.cover ? `<img class="cover-img" src="${esc(m.cover)}" alt="">` : ""}</div>
<div class="wrap">
  <div class="profile-head">
    ${avatar(m, "lg")}
    <div class="profile-head__text">
      <div style="display:flex;gap:8px;flex-wrap:wrap">${statusBadge(m)}${m.sponsored ? '<span class="badge badge--jaune">Sponsorisé</span>' : ""}<span class="badge badge--neutral">${KIND[m.kind]}</span></div>
      <h1 class="display">${esc(m.name)}</h1>
      ${teamLine(m, true)}
      <p class="profile-head__meta"><span>${esc(m.headline)}</span>${m.city ? `<span>${esc(m.city)}</span>` : ""}${site_}</p>
    </div>
  </div>
  <ol class="crumbs" aria-label="Fil d'Ariane"><li><a href="/annuaire">Le cercle</a></li><li><a href="/annuaire?expertise=${m.family}">${esc(fam?.label || "")}</a></li><li aria-current="page">${esc(m.name)}</li></ol>
  ${m.status === "recommande" ? `<div class="notice notice--reco"><p><strong>Profil recommandé par Qodia.</strong> ${esc(m.name)} n'a pas encore rejoint le cercle : cette fiche est rédigée par l'équipe Qodia à partir d'informations publiques. La mise en relation passe par Qodia.</p><p class="small">Vous êtes ${esc(m.name)} ? <a href="${optOut}">Demander une modification ou le retrait</a> · <a href="/rejoindre">Rejoindre le cercle</a></p></div>` : ""}
  ${m.sponsored ? `<p class="small muted" style="margin-top:var(--space-3)">Sponsorisé : ${esc(m.name)} rémunère Qodia pour la mise en avant de ce profil.</p>` : ""}
  <div class="profile${open ? "" : " gated"}" style="padding-top:var(--space-4)">
    ${open ? "" : accessWall(`Le profil complet de ${m.name}`)}
    <div class="profile__main">
      <section aria-labelledby="apropos">
        <h2 class="h2" id="apropos">À propos</h2>
        <div class="prose">${(m.bio || []).map((p) => `<p>${esc(p)}</p>`).join("")}</div>
        ${(m.skills || []).length ? `<ul class="tags" aria-label="Expertises">${m.skills.map((s) => `<li class="tag tag--static">${esc(s)}</li>`).join("")}</ul>` : ""}
        ${(m.tools || []).length ? `<p class="small muted">Outils : ${esc(m.tools.join(", "))}</p>` : ""}
      </section>

      ${roster.length ? `<section aria-labelledby="equipe">
        <h2 class="h2" id="equipe">L'équipe sur Qodia</h2>
        <p class="muted">${roster.length > 1 ? "Ces experts de " + esc(m.name) + " sont mobilisables" : "Cet expert de " + esc(m.name) + " est mobilisable"} via Qodia, en renfort ou en mise à disposition sur votre projet.</p>
        <ul class="roster">${roster.map((e) => `<li><a class="roster__item" href="${memberUrl(e)}">${avatar(e)}<span><strong>${esc(e.name)}</strong><span class="small muted">${esc(e.headline)}</span></span></a></li>`).join("")}</ul>
      </section>` : ""}

      <section aria-labelledby="realisations">
        <div class="section-head" style="margin:0"><h2 class="h2" id="realisations">Réalisations</h2>${m.portfolio ? `<a class="link-arrow" href="${esc(m.portfolio)}" rel="noopener" target="_blank" data-track="click_member_portfolio" data-track-label="${esc(m.name)}">Tout le portfolio ${ICON.ext}</a>` : ""}</div>
        ${projects.length ? `<div class="projects">${projects.map((p) => `<figure class="project" style="margin:0"><div class="project__media"><img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy"></div><figcaption><span class="label">${esc([p.client, p.discipline].filter(Boolean).join(" · "))}</span><p class="project__title">${esc(p.title)}</p></figcaption></figure>`).join("")}</div>`
        : `<div class="portfolio-cta"><span class="avatar avatar--${m.color || "violet"}" aria-hidden="true">${ICON.arrow}</span><div><p style="font-weight:600;color:var(--ink-brand)">Les projets de ${esc(m.name)} arrivent bientôt sur cette fiche.</p><p class="small muted">${m.portfolio || m.website ? "En attendant, le portfolio complet est en ligne." : "Demandez une sélection de réalisations lors de la mise en relation."}</p></div>${m.portfolio || m.website ? `<a class="btn btn--secondary btn--sm" href="${esc(m.portfolio || m.website)}" rel="noopener" target="_blank" data-track="click_member_portfolio" data-track-label="${esc(m.name)}">Voir le portfolio</a>` : ""}</div>`}
      </section>

      ${(m.references || []).length ? `<section aria-labelledby="refs">
        <h2 class="h2" id="refs">${m.kind === "agence" ? "Ils leur ont fait confiance" : "Ils lui ont fait confiance"}</h2>
        <ul class="refs">${m.references.map((r) => `<li>${refLogos[r] ? `<img src="${esc(refLogos[r])}" alt="${esc(r)}" loading="lazy">` : esc(r)}</li>`).join("")}</ul>
        ${m.referencesNote ? `<p class="muted">${esc(m.referencesNote)}</p>` : ""}
        <p class="small muted">${m.status === "membre" ? "Références publiées par " + esc(m.name) + "." : "Références publiques relevées par Qodia (site, portfolio ou réseaux de " + esc(m.name) + ")."}</p>
      </section>` : ""}

      <section aria-labelledby="avis">
        <h2 class="h2" id="avis">Avis clients</h2>
        ${(m.reviews || []).length ? m.reviews.map((r) => `<blockquote class="reviews-empty" style="margin:0"><p>« ${esc(r.text)} »</p><p class="small muted">${esc(r.author)}${r.company ? ", " + esc(r.company) : ""} · mission ${esc(r.date || "")}</p></blockquote>`).join("")
        : `<div class="reviews-empty"><p style="font-weight:600;color:var(--ink-brand)">Les premiers avis arrivent après la première mission Qodia.</p><p class="small muted">Chaque avis est recueilli par Qodia auprès du client en fin de mission, jamais auprès du membre.</p></div>`}
      </section>
    </div>

    <aside class="side" aria-label="Contacter ${esc(m.name)}">
      <div class="contact-box on-brand">
        <h2>Travailler avec ${esc(m.name)}</h2>
        <fieldset class="choices">
          <legend class="sr-only">Comment voulez-vous collaborer ?</legend>
          <label class="choice"><input type="radio" name="mode-${m.slug}" value="mise-en-relation" checked data-href="${brief("mise-en-relation")}"><strong>Je travaille en direct</strong><span>Qodia vous présente, vous pilotez la mission.</span></label>
          <label class="choice"><input type="radio" name="mode-${m.slug}" value="pilote" data-href="${brief("pilote")}"><strong>Qodia pilote le projet</strong><span>Un interlocuteur, une seule facture.</span></label>
        </fieldset>
        <a class="btn btn--accent btn--block" id="contact-cta" href="${brief("mise-en-relation")}" data-track="contact_member" data-track-label="${esc(m.name)}">Être mis en relation ${ICON.arrow}</a>
        <p class="small" style="color:var(--on-brand-muted)">On vous rappelle dans la journée pour cadrer le besoin.</p>
      </div>
      <div class="facts"><dl>
        <div><dt>Statut</dt><dd>${STATUS[m.status]}${m.sponsored ? " · sponsorisé" : ""}</dd></div>
        <div><dt>Type</dt><dd>${m.kind === "freelance" ? "Freelance indépendant" : KIND[m.kind]}</dd></div>
        ${t ? `<div><dt>Équipe</dt><dd><a href="${memberUrl(t)}">${esc(t.name)}</a></dd></div>` : m.employerName ? `<div><dt>Équipe</dt><dd>${esc(m.employerName)}</dd></div>` : ""}
        ${roster.length ? `<div><dt>Effectif sur Qodia</dt><dd>${roster.length} expert${roster.length > 1 ? "s" : ""}</dd></div>` : ""}
        <div><dt>Expertise</dt><dd>${esc(fam?.label || "")}</dd></div>
        ${m.city ? `<div><dt>Basé à</dt><dd>${esc(m.city)}</dd></div>` : ""}
        ${(m.sectors || []).length ? `<div><dt>Secteurs</dt><dd>${esc(m.sectors.join(", "))}</dd></div>` : ""}
        ${m.budget ? `<div><dt>Budget indicatif</dt><dd>${esc(m.budget)}</dd></div>` : ""}
        <div><dt>Réponse</dt><dd>Dans la journée</dd></div>
      </dl></div>
      ${m.qodiaNote ? `<div class="reviews-empty"><span class="label">Le mot de Qodia</span><p>${esc(m.qodiaNote)}</p></div>` : ""}
    </aside>
  </div>
</div>

<section class="section section--alt">
  <div class="wrap">
    <div class="section-head"><div><span class="label">À découvrir aussi dans le cercle</span><h2 class="h2">D'autres membres à connaître.</h2></div><a class="link-arrow" href="/annuaire">Explorer tout le cercle ${ICON.arrow}</a></div>
    <div class="cards">${others.map((o) => card(o)).join("")}</div>
  </div>
</section>
<section class="brand-band cta-band">
  <div class="brand-band__motif" aria-hidden="true"></div>
  <div class="wrap stack-6" style="max-width:var(--wrap)">
    <h2 class="display" style="max-width:720px">Un projet en tête ? Parlons-en aujourd'hui.</h2>
    <div style="display:flex;gap:12px;flex-wrap:wrap"><a class="btn btn--accent" href="${brief("mise-en-relation")}" data-track="contact_member" data-track-label="${esc(m.name)}">Être mis en relation avec ${esc(m.name)}</a><a class="btn btn--ghost-light" href="/#rappel" data-calendly="fiche-membre">Réserver un appel</a></div>
  </div>
</section>
<script>
document.querySelectorAll('input[name="mode-${m.slug}"]').forEach(function(r){r.addEventListener('change',function(){var a=document.getElementById('contact-cta');a.href=r.dataset.href;a.firstChild.textContent=r.value==='pilote'?'Confier le projet à Qodia ':'Être mis en relation ';});});
</script>`;
  return page({
    title: `${m.name}, ${m.headline.charAt(0).toLowerCase() + m.headline.slice(1)}`.slice(0, 90),
    ogTitle: `${m.name} · ${m.status === "membre" ? "membre du cercle Qodia" : "recommandé par Qodia"}`,
    description: `${m.name} (${(t ? "en poste chez " + t.name : KIND[m.kind]).toLowerCase()}${m.city ? ", " + m.city : ""}) : ${m.headline}. ${m.status === "membre" ? "Membre du cercle Qodia" : "Recommandé par Qodia"}, mise en relation sous 24 h.`.slice(0, 160),
    path: memberUrl(m), nav: "annuaire", ogType: "profile", jsonld
  }, body);
}

/* ------------------------------------------------------------------ */
/* Directives des pages                                                */
/* ------------------------------------------------------------------ */
const opts = (arr, sel) => arr.map(([v, l]) => `<option value="${esc(v)}"${v === sel ? " selected" : ""}>${esc(l)}</option>`).join("");

/* Accès au cercle : formulaire professionnel qui déverrouille les profils hors « à la une » */
function accessForm(id) {
  return `<form class="form" data-lead-form="acces" action="/api/lead" method="post" novalidate><input type="hidden" name="form_type" value="acces">
  <div class="form__success" role="status">
    <div class="form__success-icon">${ICON.check}</div>
    <h3>C'est ouvert, bonne exploration.</h3>
    <p class="muted">Tous les profils du cercle sont maintenant visibles sur cet appareil.</p>
  </div>
  <div class="row">
    <div class="field"><label class="field__label" for="${id}-prenom">Prénom</label><input class="field__input" id="${id}-prenom" name="prenom" autocomplete="given-name" required><span class="field__error"></span></div>
    <div class="field"><label class="field__label" for="${id}-nom">Nom</label><input class="field__input" id="${id}-nom" name="nom" autocomplete="family-name" required><span class="field__error"></span></div>
  </div>
  <div class="row">
    <div class="field"><label class="field__label" for="${id}-email">E-mail professionnel</label><input class="field__input" id="${id}-email" name="email" type="email" autocomplete="email" required data-b2b><span class="field__error"></span></div>
    <div class="field"><label class="field__label" for="${id}-entreprise">Entreprise</label><input class="field__input" id="${id}-entreprise" name="entreprise" autocomplete="organization" required><span class="field__error"></span></div>
  </div>
  <div class="field"><label class="field__label" for="${id}-poste">Poste <span class="opt">(facultatif)</span></label><input class="field__input" id="${id}-poste" name="fonction" autocomplete="organization-title"></div>
  <div class="hp" aria-hidden="true"><label>Ne pas remplir <input name="website" tabindex="-1" autocomplete="off"></label></div>
  <p class="form__status" aria-live="polite"></p>
  <button class="btn btn--primary btn--block" type="submit">Voir tous les profils ${ICON.arrow}</button>
  <p class="form__legal">Réservé aux professionnels : une adresse d'entreprise est demandée (pas de Gmail, Outlook…). Vos coordonnées permettent à l'équipe Qodia de vous recontacter au sujet de vos projets. <a href="/confidentialite">Confidentialité</a></p>
</form>`;
}
let accessCount = 0;
function accessWall(title) {
  const id = `acces-${++accessCount}`;
  return `<div class="access-wall" data-access-wall>
  <div class="access-wall__card form-card">
    <span class="badge badge--brand" style="justify-self:start">Accès réservé aux professionnels</span>
    <h2 class="h3">${esc(title)} est réservé aux entreprises.</h2>
    <p class="muted">Renseignez vos coordonnées professionnelles pour consulter tous les profils, agences et freelances du cercle. C'est gratuit et immédiat.</p>
    ${accessForm(id)}
  </div>
</div>`;
}

const directives = {
  "access-panel": () => accessWall("Le reste du cercle"),
  "free-count": () => String(members.filter(isOpen).length),
  "locked-count": () => String(members.filter((m) => !isOpen(m)).length),
  "membre-count": () => String(members.filter((m) => m.status === "membre").length),
  "reco-count": () => String(members.filter((m) => m.status === "recommande").length),
  "team-options": () => opts(members.filter((m) => m.kind === "agence" && rosterOf(m).length).map((m) => [m.slug, m.name])),
  "logos": () => logosGrid(),
  "cards-featured": () => members.filter((m) => m.featured).sort((a, b) => (a.featuredOrder ?? 99) - (b.featuredOrder ?? 99)).slice(0, 6).map((m) => card(m)).join(""),
  "cards-all": () => members.map((m) => card(m, "h2")).join(""),
  "member-count": () => String(members.length),
  "families": () => familyCards(),
  "family-options": () => opts(site.families.map((f) => [f.id, f.label])),
  "sector-options": () => opts(SECTORS.map((s) => [s, s])),
  "sector-tags": () => SECTORS.map((s) => `<a class="tag" href="/annuaire?secteur=${encodeURIComponent(s)}">${esc(s)}</a>`).join(""),
  "family-chips": () => site.families.map((f) => `<label class="chip"><input type="checkbox" name="expertises" value="${f.id}" data-multi><span>${esc(f.label)}</span></label>`).join(""),
  "member-options": () => opts(members.map((m) => [m.slug, m.name])),
  "posts-3": () => posts.slice(0, 3).map(postCard).join(""),
  "posts-all": () => posts.map(postCard).join(""),
  "callback-form": () => callbackForm(),
  "icon-arrow": () => ICON.arrow,
  "icon-search": () => ICON.search,
  "icon-check": () => ICON.check,
  "email": () => site.email,
  "build-date": () => fmtDate(BUILD_DATE)
};
function homeText(pathStr) {
  const v = pathStr.split(".").reduce((o, k) => (o == null ? undefined : o[k]), home);
  if (typeof v !== "string") throw new Error(`Texte d'accueil manquant : ${pathStr}`);
  return esc(v.replace(/\{n\}/g, String(members.length))).replace(/\n/g, "<br>");
}
function render(src) {
  src = src.replace(/<!--@t:([a-zA-Z0-9_.]+)-->/g, (all, p) => homeText(p));
  return src.replace(/<!--@([a-z0-9-]+)-->/g, (all, name) => {
    if (!directives[name]) throw new Error(`Directive inconnue : ${name}`);
    return directives[name]();
  });
}

/* ------------------------------------------------------------------ */
/* Écriture                                                            */
/* ------------------------------------------------------------------ */
async function out(rel, html) {
  const file = path.join(DIST, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, html);
}

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
await cp(path.join(ROOT, "static"), DIST, { recursive: true });
for (const [rel, buf] of LOGO_FILES) { await mkdir(path.dirname(path.join(DIST, rel)), { recursive: true }); await writeFile(path.join(DIST, rel), buf); }
await writeFile(path.join(DIST, "data-logos.json"), JSON.stringify({ generated: new Date().toISOString(), logos: LOGO_REPORT }, null, 2)).catch(() => {});

const urls = [];
for (const f of (await readdir(path.join(ROOT, "src/pages"))).filter((f) => f.endsWith(".html"))) {
  const [meta, body] = parseMeta(await readFile(path.join(ROOT, "src/pages", f), "utf8"));
  const name = f.replace(/\.html$/, "");
  meta.path = meta.path || (name === "index" ? "/" : "/" + name);
  await out(`${name}.html`, page(meta, render(body)));
  if (!meta.noindex) urls.push(meta.path);
}
for (const m of members) { await out(`membres/${m.slug}.html`, memberPage(m)); urls.push(memberUrl(m)); }

for (const p of posts) {
  const more = posts.filter((o) => o.slug !== p.slug).slice(0, 2);
  const body = `
<article>
  <header class="article-head"><div class="wrap"><div class="article-head__inner">
    <ol class="crumbs" style="padding:0" aria-label="Fil d'Ariane"><li><a href="/blog">Blog</a></li><li>${esc(p.category)}</li></ol>
    <h1 class="h1" style="font-size:clamp(32px,5vw,48px)">${esc(p.title)}</h1>
    <p class="lead">${esc(p.excerpt)}</p>
    <p class="label">${fmtDate(p.date)} · ${esc(p.readingTime || "")} · L'équipe Qodia</p>
  </div></div></header>
  <div class="wrap"><div class="article-cover">${blogArt(p.slug, p.color)}</div></div>
  <div class="wrap wrap--narrow rich">${render(p.body)}</div>
</article>
<section class="section"><div class="wrap wrap--narrow"><div class="join"><div class="stack-2"><h2 class="h2">Besoin du bon expert ?</h2><p>Déposez un brief en cinq minutes : on vous rappelle dans la journée avec une sélection de membres du cercle.</p></div><a class="btn btn--primary" href="/brief">Déposer un brief</a></div></div></section>
<section class="section section--alt"><div class="wrap"><div class="section-head"><h2 class="h2">À lire aussi</h2><a class="link-arrow" href="/blog">Tous les articles ${ICON.arrow}</a></div><div class="grid grid--2">${more.map(postCard).join("")}</div></div></section>`;
  await out(`blog/${p.slug}.html`, page({
    title: p.title, description: p.excerpt, path: `/blog/${p.slug}`, nav: "blog", ogType: "article",
    jsonld: { "@context": "https://schema.org", "@type": "BlogPosting", headline: p.title, description: p.excerpt, datePublished: p.date, author: { "@type": "Organization", name: "Qodia" }, publisher: { "@type": "Organization", name: "Qodia" }, mainEntityOfPage: site.url + `/blog/${p.slug}` }
  }, body));
  urls.push(`/blog/${p.slug}`);
}

await out("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${site.url}${u === "/" ? "/" : u}</loc><lastmod>${BUILD_DATE}</lastmod></url>`).join("\n")}\n</urlset>\n`);
await out("robots.txt", `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${site.url}/sitemap.xml\n`);
await out("data/members.json", JSON.stringify({ generated: BUILD_DATE, members: members.map(({ slug, name, kind, status, sponsored, employer, family, headline, city, sectors, skills, logo, photo, color }) => ({ slug, name, kind, status, sponsored, employer: employer || undefined, family, headline, city, sectors, skills, logo, photo, color, url: memberUrl({ slug }) })) }, null, 2));

console.log(`Site généré dans dist/ : ${urls.length} pages, ${members.length} membres, ${posts.length} articles.`);
