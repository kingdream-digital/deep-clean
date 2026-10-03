# Facture électronique (réforme 2026) — Super PDP

Deep Clean émet ses factures au format **Factur-X** (PDF lisible + données
structurées EN 16931) et les dépose sur la plateforme agréée **Super PDP**
(https://www.superpdp.tech), qui les achemine vers la plateforme du client.

## Calendrier légal

- **1er septembre 2026** : toutes les entreprises doivent pouvoir **recevoir**
  des factures électroniques ; les grandes entreprises et ETI les émettent.
- **1er septembre 2027** : les PME et micro-entreprises doivent les **émettre**.

## Mentions ajoutées par la réforme (présentes sur nos PDF et dans le XML)

- SIREN du client (saisi sur la fiche client, ou déduit de son SIRET) ;
- adresse de livraison / d'intervention (le chantier) ;
- catégorie d'opération : **prestations de services** (cadre S1) ;
- option pour le paiement de la TVA d'après les débits, si elle a été prise
  (`COMPANY_VAT_ON_DEBITS=true`).

S'y ajoutent les mentions déjà obligatoires : identité complète de
l'entreprise (forme, capital, RCS, SIRET, TVA intracommunautaire), échéance,
pénalités de retard, indemnité forfaitaire de 40 €, absence d'escompte, et
« Facture acquittée le … » une fois payée.

## Mise en service (à faire une fois)

1. Renseigner sur le serveur (Coolify → Backend → Environment Variables) :
   `COMPANY_LEGAL_NAME`, `COMPANY_LEGAL_FORM`, `COMPANY_SHARE_CAPITAL`,
   `COMPANY_ADDRESS`, `COMPANY_POSTAL_CODE`, `COMPANY_CITY`, `COMPANY_SIRET`
   (ou `COMPANY_SIREN`), `COMPANY_RCS`, `COMPANY_VAT_NUMBER`, `COMPANY_PHONE`,
   `COMPANY_EMAIL`, `COMPANY_IBAN`, `COMPANY_BIC`, et si besoin
   `COMPANY_VAT_ON_DEBITS`, `INVOICE_PAYMENT_DAYS` (30 par défaut).
2. Créer un compte sur https://www.superpdp.tech, puis une application
   « client credentials » : copier son identifiant et son secret dans
   `SUPERPDP_CLIENT_ID` et `SUPERPDP_CLIENT_SECRET`. Un compte **bac à sable**
   permet de tester sans valeur légale ; le compte réel envoie pour de vrai.
3. Redéployer le backend.

Sans ces identifiants, l'application le dit clairement sur chaque facture et
la facturation par email continue de fonctionner normalement.

## Dans l'application

Fiche facture → carte **Facture électronique** :

- facture à préparer : envoi possible une fois validée ;
- informations manquantes : la liste exacte s'affiche (SIREN client, adresse…) ;
- prête : bouton « Envoyer en facture électronique » (confirmation) ;
- envoyée : statut officiel en français (déposée, reçue, mise à disposition,
  approuvée, refusée, en litige, encaissée…), mis à jour automatiquement
  toutes les 30 minutes et à la demande. Un refus, un rejet ou un litige
  déclenche une notification à la direction et à la RH.

## Technique

- `backend/src/modules/einvoicing/enInvoice.ts` : facture au modèle EN 16931
  (JSON « en_invoice » de Super PDP), vérifiée contre le schéma officiel.
- `superpdp.client.ts` : jeton OAuth2 (client credentials), conversion
  `POST /v1.beta/invoices/convert?from=en16931&to=factur-x` (notre PDF + la
  facture structurée), dépôt `POST /v1.beta/invoices`, suivi
  `GET /v1.beta/invoice_events`.
- `einvoicing.service.ts` : contrôles avant envoi, libellés des statuts,
  tâche planifiée de suivi.
- Tests : `backend/tests/einvoicing.test.ts` (faux serveur Super PDP local).
