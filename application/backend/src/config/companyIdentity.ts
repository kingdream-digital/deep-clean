// Identité légale publique de Deep Clean (retour explicite du client, extrait
// Pappers / registre du commerce, octobre 2026). Ce sont des informations
// publiques — pas des secrets — imprimées sur chaque devis et facture : elles
// servent de valeur par défaut, et une variable d'environnement COMPANY_*
// renseignée reste prioritaire (voir einvoicing/companyProfile.ts).
//
// Les coordonnées bancaires (IBAN, BIC) ne sont volontairement PAS ici :
// elles restent uniquement dans les variables d'environnement du serveur.
export const DEEP_CLEAN_IDENTITY = {
  legalName: "DEEP CLEAN",
  legalForm: "SAS",
  shareCapital: "600 €",
  siren: "942773375",
  siret: "94277337500012",
  rcs: "RCS Manosque 942 773 375",
  vatNumber: "FR54942773375",
  // Site et domaine de l'entreprise.
  website: "https://deep-clean.fr",
} as const;
