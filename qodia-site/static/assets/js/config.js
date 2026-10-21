/* =========================================================
   Qodia : réglages à compléter
   C'est le seul fichier à modifier pour brancher les outils.
   ========================================================= */
window.QODIA_CONFIG = {
  // Google Analytics 4 : identifiant de flux, de la forme "G-XXXXXXXXXX".
  // Laisser vide tant qu'il n'existe pas : aucun script n'est chargé.
  GA4_ID: "",

  // Microsoft Clarity : identifiant du projet (10 caractères environ,
  // visible dans Clarity > Settings > Setup). Laisser vide sinon.
  CLARITY_ID: "",

  // Lien de prise de rendez-vous Calendly (appel de 20 minutes).
  // Exemple : "https://calendly.com/delacreme/qodia-20min".
  // Vide : les boutons « Réserver un appel » mènent au formulaire de rappel.
  CALENDLY_URL: "",

  // Point d'envoi des formulaires (fonction Vercel /api/lead).
  LEAD_ENDPOINT: "/api/lead",

  // Durée de validité du choix cookies, en mois (CNIL : 6 mois recommandés).
  CONSENT_MONTHS: 6
};
