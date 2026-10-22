// Qodia : réception des formulaires (brief, rappel, candidature).
// Fonction Vercel (Node 18+). Envoie un e-mail via Resend à LEAD_TO
// (hello@delacreme.pro par défaut) et, si CRM_WEBHOOK_URL est défini,
// transmet la demande au CRM. Aucune donnée n'est stockée ici.
//
// Variables d'environnement (Vercel > Settings > Environment Variables) :
//   RESEND_API_KEY   obligatoire  clé API Resend (re_…)
//   LEAD_FROM        obligatoire  expéditeur vérifié dans Resend, ex. "Qodia <formulaires@qodia.pro>"
//   LEAD_TO          facultatif   destinataire(s), séparés par des virgules (défaut : hello@delacreme.pro)
//   SEND_ACK         facultatif   "true" pour envoyer un accusé de réception au demandeur
//   CRM_WEBHOOK_URL  facultatif   URL du CRM qui recevra chaque demande en JSON
//   CRM_WEBHOOK_SECRET facultatif secret envoyé dans l'en-tête X-Qodia-Signature (HMAC SHA-256)
//   ALLOWED_ORIGINS  facultatif   origines autorisées, ex. "https://qodia.pro,https://www.qodia.pro"

import crypto from "node:crypto";
import { promises as dns } from "node:dns";

const TYPES = {
  brief: { label: "Nouveau brief", required: ["mode", "description", "prenom", "nom", "entreprise", "email", "telephone"] },
  rappel: { label: "Demande de rappel", required: ["nom", "telephone"] },
  candidature: { label: "Candidature au cercle", required: ["statut", "nom", "email", "expertise", "ville", "metier", "portfolio"] },
  acces: { label: "Accès au cercle", required: ["prenom", "nom", "entreprise", "email"], b2b: true }
};

const LABELS = {
  mode: "Mode de collaboration", membre: "Membre demandé", expertises: "Expertises", description: "Projet",
  secteur: "Secteur", site: "Site actuel", budget: "Budget", delai: "Délai", prenom: "Prénom", nom: "Nom",
  entreprise: "Entreprise", fonction: "Fonction", email: "E-mail", telephone: "Téléphone", contact: "Préférence de contact",
  creneau: "Créneau", message: "Besoin", statut: "Statut", structure: "Structure", expertise: "Expertise principale",
  ville: "Ville", metier: "Métier", portfolio: "Portfolio", linkedin: "LinkedIn", references: "Références", parrain: "Recommandé par"
};
const VALUE_LABELS = {
  mode: { pilote: "Qodia pilote le projet", "mise-en-relation": "Mise en relation directe", conseil: "Ne sait pas encore, à conseiller" },
  contact: { rappel: "Être rappelé aujourd'hui", calendly: "Réserver un créneau (Calendly)", email: "Recevoir un e-mail d'abord" },
  statut: { freelance: "Freelance", agence: "Agence", employe: "Expert en agence membre" }
};

const MAX_FIELD = 4000;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clean = (v) => {
  if (Array.isArray(v)) return v.slice(0, 20).map(clean).filter(Boolean);
  if (v === null || v === undefined) return "";
  return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, MAX_FIELD);
};
const FREE_MAIL = /@(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|mac|aol|gmx|proton|protonmail|pm|yandex|mail|orange|wanadoo|free|sfr|neuf|laposte|bbox|numericable|club-internet|aliceadsl|libertysurf|voila|tutanota|zoho|hey)\.[a-z.]+$/i;
// Vérifie que le domaine de l'adresse reçoit des e-mails (enregistrement MX). En cas de lenteur DNS, on laisse passer.
async function domainReceivesMail(email) {
  const domain = email.split("@").pop();
  try {
    const mx = await Promise.race([dns.resolveMx(domain), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 2500))]);
    return Array.isArray(mx) && mx.length > 0;
  } catch (e) {
    return e.message === "timeout" ? true : false;
  }
}
const isEmail = (s) => /^[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}$/i.test(s);
const display = (key, v) => {
  const val = Array.isArray(v) ? v.join(", ") : v;
  return (VALUE_LABELS[key] && VALUE_LABELS[key][val]) || val;
};

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return parse(req.body, req.headers["content-type"]);
  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > 100_000) throw new Error("too_large"); chunks.push(c); }
  return parse(Buffer.concat(chunks).toString("utf8"), req.headers["content-type"]);
}
function parse(raw, type = "") {
  if (type.includes("application/json")) return JSON.parse(raw || "{}");
  return Object.fromEntries(new URLSearchParams(raw));
}

function buildEmail(type, data, meta) {
  const t = TYPES[type];
  const who = [data.prenom, data.nom].filter(Boolean).join(" ") || data.nom || "Anonyme";
  const org = data.entreprise || data.structure || "";
  const subject = `[Qodia] ${t.label} : ${org ? org + ", " : ""}${who}`.slice(0, 180);
  const rows = Object.keys(LABELS).filter((k) => data[k] && (!Array.isArray(data[k]) || data[k].length));
  const a = meta.attribution || {};
  const attribution = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "landing", "referrer"].filter((k) => a[k]).map((k) => `${k} : ${a[k]}`);

  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#F3F2F6;font-family:Arial,Helvetica,sans-serif;color:#1C0E3F">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F2F6;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="background:#350085;color:#fff;padding:24px 28px"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#C9C2DD">Qodia · formulaire ${esc(type)}</div><div style="font-size:22px;font-weight:bold;margin-top:6px">${esc(t.label)}</div><div style="font-size:15px;color:#C9C2DD;margin-top:4px">${esc(who)}${org ? " · " + esc(org) : ""}</div></td></tr>
<tr><td style="padding:8px 28px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${rows.map((k) => `<tr><td style="padding:10px 12px 10px 0;border-bottom:1px solid #E2DFEA;color:#5E5675;font-size:13px;vertical-align:top;width:170px">${esc(LABELS[k])}</td><td style="padding:10px 0;border-bottom:1px solid #E2DFEA;font-size:15px;white-space:pre-wrap">${k === "email" ? `<a href="mailto:${esc(data[k])}">${esc(data[k])}</a>` : k === "telephone" ? `<a href="tel:${esc(String(data[k]).replace(/[^0-9+]/g, ""))}">${esc(data[k])}</a>` : esc(display(k, data[k]))}</td></tr>`).join("")}
</table></td></tr>
<tr><td style="padding:16px 28px 24px;font-size:12px;color:#5E5675">Page : ${esc(meta.page || "")} · Reçu le ${esc(meta.receivedAt)}${attribution.length ? "<br>" + attribution.map(esc).join(" · ") : ""}</td></tr>
</table></td></tr></table></body></html>`;

  const text = `${t.label} : ${who}${org ? " (" + org + ")" : ""}\n\n` +
    rows.map((k) => `${LABELS[k]} : ${display(k, data[k])}`).join("\n") +
    `\n\nPage : ${meta.page || ""}\nReçu le ${meta.receivedAt}` + (attribution.length ? `\n${attribution.join("\n")}` : "");
  return { subject, html, text };
}

function ackEmail(type, data) {
  const first = data.prenom || String(data.nom || "").split(" ")[0] || "";
  const body = type === "candidature"
    ? "Merci pour votre candidature au cercle Qodia. Nous l'étudions et revenons vers vous sous dix jours ouvrés pour organiser un premier échange."
    : "Merci pour votre demande. Un membre de l'équipe Qodia vous recontacte dans la journée (le prochain jour ouvré si vous avez écrit le soir ou le week-end).";
  return {
    subject: type === "candidature" ? "Qodia : candidature bien reçue" : "Qodia : votre demande est bien reçue",
    text: `Bonjour ${first},\n\n${body}\n\nL'équipe Qodia, une initiative DeLaCrème\nhello@delacreme.pro`,
    html: `<p>Bonjour ${esc(first)},</p><p>${esc(body)}</p><p>L'équipe Qodia, une initiative DeLaCrème<br><a href="mailto:hello@delacreme.pro">hello@delacreme.pro</a></p>`
  };
}

async function resend(payload) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new Error(`resend_${r.status}: ${detail.slice(0, 300)}`);
  }
  return r.json();
}

async function forwardToCRM(record) {
  const url = process.env.CRM_WEBHOOK_URL;
  if (!url) return;
  const body = JSON.stringify(record);
  const headers = { "Content-Type": "application/json" };
  if (process.env.CRM_WEBHOOK_SECRET) {
    headers["X-Qodia-Signature"] = crypto.createHmac("sha256", process.env.CRM_WEBHOOK_SECRET).update(body).digest("hex");
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(url, { method: "POST", headers, body, signal: ctrl.signal });
    if (!r.ok) console.error("CRM webhook", r.status);
  } catch (e) {
    console.error("CRM webhook indisponible", e.message);
  } finally { clearTimeout(timer); }
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const allowed = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allowed.length && origin && !allowed.includes(origin)) return send(res, 403, { ok: false, error: "origine non autorisée" });

  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return send(res, 405, { ok: false, error: "méthode non autorisée" }); }

  let raw;
  try { raw = await readBody(req); } catch { return send(res, 400, { ok: false, error: "requête illisible" }); }

  const type = clean(raw.form_type);
  if (!TYPES[type]) return send(res, 400, { ok: false, error: "formulaire inconnu" });

  // Anti-spam : champ piège rempli, ou envoi en moins de 3 secondes. On répond « ok » sans rien envoyer.
  if (clean(raw.website) || (Number(raw.elapsed_ms) > 0 && Number(raw.elapsed_ms) < 3000)) {
    return send(res, 200, { ok: true });
  }

  const data = {};
  for (const k of Object.keys(LABELS)) if (raw[k] !== undefined) data[k] = clean(raw[k]);
  if (typeof data.expertises === "string") data.expertises = data.expertises ? [data.expertises] : [];

  const missing = TYPES[type].required.filter((k) => !data[k] || (Array.isArray(data[k]) && !data[k].length));
  if (missing.length) return send(res, 422, { ok: false, error: "champs manquants : " + missing.map((k) => LABELS[k]).join(", ") });
  if (data.email && !isEmail(data.email)) return send(res, 422, { ok: false, error: "adresse e-mail invalide" });
  if (TYPES[type].b2b) {
    if (FREE_MAIL.test(data.email)) return send(res, 422, { ok: false, error: "merci d'utiliser votre adresse e-mail professionnelle" });
    if (!(await domainReceivesMail(data.email))) return send(res, 422, { ok: false, error: "le domaine de cette adresse e-mail ne reçoit pas d'e-mails" });
  }

  if (!process.env.RESEND_API_KEY || !process.env.LEAD_FROM) {
    console.error("RESEND_API_KEY ou LEAD_FROM manquant");
    return send(res, 500, { ok: false, error: "envoi non configuré" });
  }

  const meta = {
    page: clean(raw.page).slice(0, 200),
    attribution: Object.fromEntries(Object.entries(raw.attribution && typeof raw.attribution === "object" ? raw.attribution : {}).slice(0, 12).map(([k, v]) => [clean(k).slice(0, 40), clean(v).slice(0, 300)])),
    receivedAt: new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "full", timeStyle: "short" })
  };
  const to = (process.env.LEAD_TO || "hello@delacreme.pro").split(",").map((s) => s.trim()).filter(Boolean);
  const mail = buildEmail(type, data, meta);

  try {
    await resend({ from: process.env.LEAD_FROM, to, reply_to: data.email && isEmail(data.email) ? data.email : undefined, subject: mail.subject, html: mail.html, text: mail.text, tags: [{ name: "form", value: type }] });
  } catch (e) {
    console.error(e.message);
    return send(res, 502, { ok: false, error: "le service d'envoi ne répond pas" });
  }

  const tasks = [forwardToCRM({ type, receivedAt: new Date().toISOString(), data, page: meta.page, attribution: meta.attribution })];
  if (process.env.SEND_ACK === "true" && data.email && isEmail(data.email)) {
    const ack = ackEmail(type, data);
    tasks.push(resend({ from: process.env.LEAD_FROM, to: [data.email], reply_to: to[0], ...ack }).catch((e) => console.error("accusé", e.message)));
  }
  await Promise.all(tasks);

  const wantsHtml = (req.headers.accept || "").includes("text/html") && !(req.headers["content-type"] || "").includes("json");
  if (wantsHtml) { res.statusCode = 303; res.setHeader("Location", "/merci"); return res.end(); }
  return send(res, 200, { ok: true });
}
