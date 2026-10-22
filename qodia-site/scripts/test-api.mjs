// Tests de la fonction api/lead.js sans réseau : l'appel à Resend est simulé.
// Usage : node scripts/test-api.mjs
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { promises as dnsp } from "node:dns";
// DNS simulé : seuls les domaines connus ont un serveur de messagerie
dnsp.resolveMx = async (d) => { if (["delacreme.pro", "acme.fr"].includes(d)) return [{ exchange: "mx." + d, priority: 1 }]; const e = new Error("queryMx ENOTFOUND " + d); e.code = "ENOTFOUND"; throw e; };

process.env.RESEND_API_KEY = "re_test";
process.env.LEAD_FROM = "Qodia <formulaires@qodia.pro>";
delete process.env.LEAD_TO;
const sent = [];
globalThis.fetch = async (url, opts) => {
  sent.push({ url, body: JSON.parse(opts.body) });
  return new Response(JSON.stringify({ id: "test" }), { status: 200, headers: { "Content-Type": "application/json" } });
};
const { default: handler } = await import("../api/lead.js");

function call(body, { method = "POST", type = "application/json", accept = "application/json" } = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const req = Readable.from([Buffer.from(raw)]);
  req.method = method;
  req.headers = { "content-type": type, accept };
  return new Promise((resolve) => {
    const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { resolve({ status: this.statusCode, headers: this.headers, body: b ? JSON.parse(b) : null }); } };
    handler(req, res);
  });
}

const brief = { form_type: "brief", mode: "pilote", description: "Refonte complète du site et de l'identité, lancement en mars.", prenom: "Camille", nom: "Durand", entreprise: "Acme", email: "camille@acme.fr", telephone: "06 12 34 56 78", expertises: ["branding", "web"], budget: "15 000 à 50 000 €", delai: "Dans 1 à 3 mois", contact: "rappel", elapsed_ms: 45000, page: "/brief", attribution: { utm_source: "linkedin", landing: "/" } };

let r = await call(brief);
assert.equal(r.status, 200); assert.equal(r.body.ok, true);
assert.equal(sent.length, 1);
assert.deepEqual(sent[0].body.to, ["hello@delacreme.pro"]);
assert.equal(sent[0].body.reply_to, "camille@acme.fr");
assert.match(sent[0].body.subject, /Nouveau brief : Acme, Camille Durand/);
assert.match(sent[0].body.html, /Qodia pilote le projet/);
assert.match(sent[0].body.text, /utm_source : linkedin/);
console.log("✓ brief envoyé à hello@delacreme.pro avec reply-to du client");

sent.length = 0;
r = await call({ ...brief, website: "http://spam" });
assert.equal(r.status, 200); assert.equal(sent.length, 0);
r = await call({ ...brief, elapsed_ms: 800 });
assert.equal(r.status, 200); assert.equal(sent.length, 0);
console.log("✓ robots ignorés (champ piège, envoi trop rapide)");

r = await call({ ...brief, email: "pas-un-email" });
assert.equal(r.status, 422);
r = await call({ form_type: "rappel", nom: "Jean" , elapsed_ms: 9000});
assert.equal(r.status, 422); assert.match(r.body.error, /Téléphone/);
r = await call({ form_type: "inconnu" });
assert.equal(r.status, 400);
r = await call({}, { method: "GET" });
assert.equal(r.status, 405);
console.log("✓ validations (e-mail, champs requis, type, méthode)");

r = await call({ form_type: "rappel", nom: "Jean <b>Martin</b>", telephone: "0612345678", creneau: "Ce matin", elapsed_ms: 9000 });
assert.equal(r.status, 200);
assert.ok(!sent.at(-1).body.html.includes("<b>Martin</b>"));
console.log("✓ rappel envoyé, HTML échappé");

r = await call("form_type=candidature&statut=freelance&nom=Lea&email=lea%40ex.fr&expertise=contenu&ville=Nantes&metier=Motion&portfolio=https%3A%2F%2Fex.fr&elapsed_ms=20000", { type: "application/x-www-form-urlencoded", accept: "text/html" });
assert.equal(r.status, 303);
assert.equal(r.headers.location, "/merci");
console.log("✓ envoi sans JavaScript redirigé vers /merci");

process.env.SEND_ACK = "true"; sent.length = 0;
r = await call(brief);
assert.equal(sent.length, 2); assert.deepEqual(sent[1].body.to, ["camille@acme.fr"]);
console.log("✓ accusé de réception optionnel");

process.env.CRM_WEBHOOK_URL = "https://crm.test/hook"; process.env.CRM_WEBHOOK_SECRET = "s"; process.env.SEND_ACK = "false"; sent.length = 0;
r = await call(brief);
assert.equal(sent.length, 2); assert.equal(sent[1].url, "https://crm.test/hook"); assert.equal(sent[1].body.type, "brief");
console.log("✓ transfert au CRM quand CRM_WEBHOOK_URL est défini");
delete process.env.CRM_WEBHOOK_URL; sent.length = 0;
r = await call({ form_type: "acces", prenom: "Léa", nom: "Martin", entreprise: "Acme", email: "lea@gmail.com", elapsed_ms: 9000 });
assert.equal(r.status, 422); assert.match(r.body.error, /professionnelle/);
r = await call({ form_type: "acces", prenom: "Léa", nom: "Martin", entreprise: "Acme", email: "lea@domaine-qui-n-existe-pas-qodia.fr", elapsed_ms: 9000 });
assert.equal(r.status, 422); assert.match(r.body.error, /domaine/);
r = await call({ form_type: "acces", prenom: "Léa", nom: "Martin", entreprise: "Acme", fonction: "CMO", email: "lea@delacreme.pro", elapsed_ms: 9000 });
assert.equal(r.status, 200); assert.match(sent.at(-1).body.subject, /Accès au cercle : Acme, Léa Martin/);
console.log("✓ accès au cercle : adresse professionnelle exigée, domaine vérifié");
console.log("\nTous les tests passent.");
