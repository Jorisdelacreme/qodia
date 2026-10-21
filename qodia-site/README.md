# Qodia, site public (v2)

Site statique généré par un petit script Node (sans dépendance), hébergé sur Vercel, avec une fonction serverless qui envoie les formulaires sur **hello@delacreme.pro** via Resend. Tout est prêt pour brancher le CRM plus tard.

## Arborescence

```
api/lead.js            Réception des formulaires (brief, rappel, candidature) → e-mail + CRM
data/members.json      Fiches membres publiques (sera remplacé par l'export du CRM)
data/site.json         Familles d'expertise, logos clients, e-mail de contact
src/pages/*.html       Pages (accueil, annuaire, brief, rejoindre, FAQ, blog, légal…)
src/blog/*.html        Articles du blog (un fichier = un article)
static/                Fichiers copiés tels quels (CSS, JS, logos, favicon)
static/assets/js/config.js   ← identifiants GA4, Clarity et lien Calendly
scripts/build.mjs      Génère dist/ (pages, fiches membres, sitemap, robots)
scripts/dev-server.mjs Serveur local avec URL propres et formulaires
scripts/test-api.mjs   Tests de la fonction de formulaires
vercel.json            Build, redirections (/talents → /rejoindre), en-têtes de sécurité
```

## Mettre en ligne sur Vercel

La fonction de formulaires impose un déploiement via Git ou la CLI (le glisser-déposer ne déploie pas les fonctions).

1. Créer un dépôt GitHub privé et y pousser ce dossier.
2. Sur vercel.com : **Add New → Project → Import** le dépôt. Vercel lit `vercel.json` : rien à régler (build `node scripts/build.mjs`, sortie `dist`).
3. **Settings → Environment Variables** : ajouter les variables de `.env.example` (voir ci-dessous), puis redéployer.
4. **Settings → Domains** : ajouter `qodia.pro` et `www.qodia.pro`, et suivre les enregistrements DNS indiqués.

## Formulaires → hello@delacreme.pro (Resend)

1. Créer un compte sur resend.com (offre gratuite : 3 000 e-mails par mois).
2. **Domains → Add domain** : `qodia.pro` (ou `delacreme.pro`). Ajouter chez le registrar les enregistrements DNS fournis (SPF, DKIM). Attendre le statut *Verified*.
3. **API Keys → Create** : copier la clé `re_…`.
4. Dans Vercel :
   - `RESEND_API_KEY` = la clé
   - `LEAD_FROM` = `Qodia <formulaires@qodia.pro>` (adresse du domaine vérifié)
   - `LEAD_TO` = `hello@delacreme.pro` (valeur par défaut ; plusieurs adresses séparées par des virgules possibles)
   - `SEND_ACK` = `true` pour envoyer un accusé de réception au demandeur (facultatif)
   - `ALLOWED_ORIGINS` = `https://qodia.pro,https://www.qodia.pro`

Chaque e-mail reprend tous les champs, la page d'origine et la source de la visite (utm, gclid). « Répondre » écrit directement au demandeur. Anti-spam : champ piège invisible et délai minimal de saisie.

Tester en local : `npm run test:api`.

## Analytics : GA4 + Microsoft Clarity

Ouvrir `static/assets/js/config.js` et renseigner :

- `GA4_ID` : Google Analytics → Admin → Flux de données → Web → « ID de mesure » (`G-…`).
- `CLARITY_ID` : clarity.microsoft.com → nouveau projet → Settings → Setup → ID du projet.
- `CALENDLY_URL` : lien de l'événement « appel de 20 minutes ». Vide = les boutons « Réserver un appel » mènent au formulaire de rappel.

Conformité CNIL : aucun script de mesure n'est chargé avant consentement. Le bandeau propose « Tout refuser » au même niveau que « Tout accepter », un choix par outil, et se réaffiche au bout de 6 mois. Le lien « Gérer les cookies » du pied de page permet de changer d'avis (les cookies sont alors supprimés). Signaux publicitaires Google désactivés.

Événements envoyés (après consentement) :

| Événement | Quand |
|---|---|
| `generate_lead` | formulaire envoyé (`form_type` = brief, rappel ou candidature ; `mode`, `member`, `contact_pref`) |
| `form_start` / `form_error` | premier champ touché / échec d'envoi |
| `brief_step` | passage d'une étape du brief |
| `click_calendly` / `click_rappel` | clic sur « Réserver un appel » |
| `contact_member`, `click_member_card`, `click_member_website`, `click_member_portfolio` | intérêt pour un membre |
| `search`, `filter_annuaire` | recherche dans l'annuaire |

Dans GA4 : Admin → Événements → marquer `generate_lead` comme **événement clé** (conversion). Pour Google Ads, l'importer ensuite depuis GA4.

## Modifier le contenu

- **Membres** : `data/members.json`. Seuls les membres `"visible": true` sont publiés ; `"featured": true` les place sur l'accueil (6 maximum). Champs média : `logo`, `photo`, `cover` (chemins d'images, ex. `/assets/membres/mothaiba-logo.png` à déposer dans `static/assets/membres/`), `projects` (`[{ "title", "client", "discipline", "image" }]`), `referenceLogos`, `reviews`, `budget`, `qodiaNote`. Un champ vide n'affiche rien.
- **Logos clients** : `data/site.json` → `brands`, fichiers dans `static/assets/logos/clients/`.
- **Article de blog** : copier un fichier de `src/blog/`, changer le bloc `<!--meta … -->` en tête (titre, résumé, catégorie, date, couleur : violet, rouge, cyan ou jaune) et le texte.
- **Pages** : `src/pages/`. Les commentaires `<!--@…-->` sont remplacés au build (cartes membres, logos, formulaire de rappel…).

Voir le résultat en local : `npm run dev` puis http://localhost:3000 (Node 18 ou plus).

## Brancher le CRM (deuxième temps)

Le site est déjà découplé :

1. **Demandes entrantes** : définir `CRM_WEBHOOK_URL` (et `CRM_WEBHOOK_SECRET`). Chaque formulaire est alors aussi envoyé en JSON au CRM, signé en HMAC SHA-256 dans l'en-tête `X-Qodia-Signature` : `{ type, receivedAt, data, page, attribution }`. L'e-mail continue de partir.
2. **Fiches membres** : définir `CRM_MEMBERS_URL` (et `CRM_TOKEN` si besoin). Au build, le site lit les membres depuis le CRM (même format que `data/members.json`), avec repli sur le fichier local si le CRM ne répond pas.
3. **Mise à jour automatique** : créer un *Deploy Hook* dans Vercel (Settings → Git → Deploy Hooks) et l'appeler depuis le CRM à chaque modification d'une fiche publiée.
4. **Images** : le CRM fournit des URL d'images publiques pour `logo`, `photo`, `cover` et `projects[].image`.

Le site publie aussi `/data/members.json` (version allégée) pour un futur widget ou une recherche côté client.

## À valider avant la mise en ligne

- Les fiches des 10 membres reprennent des informations publiques relevées sur leurs sites : à faire relire et approuver par chacun, avec leur logo ou photo.
- Les chiffres et engagements affichés : « une centaine » de membres, DeLaCrème « fondée en 2015, plus de 170 clients », rappel « dans la journée », réponse aux candidatures « sous dix jours ouvrés ».
- L'usage des logos clients (« Ils nous font confiance »).
- Les pages légales (mentions, confidentialité, cookies) : à relire, idéalement par un juriste.
- Les polices viennent de Google Fonts (mentionné dans la politique de confidentialité). Pour supprimer ce transfert, les auto-héberger dans `static/assets/fonts/`.
