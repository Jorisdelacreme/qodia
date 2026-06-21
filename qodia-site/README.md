# Qodia — Site bêta

Site statique HTML/CSS, prêt à déployer sur Vercel.

## Pages incluses

- `index.html` — Accueil (acquisition clients)
- `talents.html` — Page de candidature pour les talents
- `faq.html` — Questions fréquentes (clients + talents)
- `mentions-legales.html` — Mentions légales & CGU

## Déployer sur Vercel (sans coder)

1. Va sur [vercel.com](https://vercel.com) et crée un compte (gratuit), de préférence en te connectant avec GitHub.
2. Clique sur **Add New → Project**.
3. Choisis **Deploy without Git** / glisse-dépose directement le dossier contenant ces fichiers (drag & drop dans l'interface Vercel).
4. Vercel détecte automatiquement qu'il s'agit d'un site statique — aucune configuration nécessaire.
5. En quelques secondes, le site est en ligne sur une URL du type `qodia-xxxx.vercel.app`.

## Connecter le nom de domaine qodia.fr (ou autre)

1. Dans le projet Vercel → **Settings → Domains**.
2. Ajoute ton nom de domaine.
3. Vercel donne les enregistrements DNS à ajouter chez ton registrar (souvent un simple enregistrement `A` ou `CNAME`).
4. Propagation en général sous quelques heures.

## Modifier le contenu plus tard

Chaque page est un fichier HTML autonome avec son CSS intégré. Pour modifier un texte ou une couleur :
- Ouvrir le fichier concerné dans un éditeur de code (VS Code recommandé).
- Les couleurs de la charte sont centralisées en haut de chaque fichier dans le bloc `:root { ... }` — modifier une couleur ici la change partout dans la page.
- Après modification, redéployer sur Vercel (glisser à nouveau le dossier, ou connecter un repo GitHub pour un déploiement automatique à chaque modification).

## Formulaires

Les formulaires (page d'accueil section bêta, page talents section candidature) affichent actuellement un message de confirmation côté navigateur uniquement — **aucune donnée n'est encore enregistrée**. Pour recevoir réellement les candidatures/leads, il faut connecter un service comme Tally, Typeform, ou un backend (Formspree, Make + Notion/Airtable).
