// Adresses publiques de Deep Clean (domaine deep-clean.fr, retour explicite
// du client). Les pages légales sont servies par l'application web elle-même
// (dossier public/) : ce sont ces adresses qui sont déclarées sur l'App Store
// et Google Play (voir docs/PUBLICATION-STORES.md).
export const SITE_URL = "https://deep-clean.fr";
export const WEB_APP_URL = "https://app.deep-clean.fr";
export const PRIVACY_URL = `${WEB_APP_URL}/confidentialite.html`;
export const SUPPORT_URL = `${WEB_APP_URL}/support.html`;
export const ACCOUNT_DELETION_URL = `${WEB_APP_URL}/suppression-compte.html`;

// Coordonnées de DEEP CLEAN affichées dans l'espace public de l'application
// (mêmes que sur deep-clean.fr et dans les mentions légales).
export const COMPANY_CONTACT = {
  phone: "06 81 70 07 51",
  phoneE164: "+33681700751",
  email: "deepclean.contact.pro@gmail.com",
  address: "21 boulevard de la Plaine, 04100 Manosque",
} as const;
