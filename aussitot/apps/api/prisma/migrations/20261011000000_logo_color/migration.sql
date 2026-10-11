-- Couleur dominante du logo de l'entreprise, proposée dans les réglages
-- comme couleur de ses devis, factures et emails.
ALTER TABLE "organizations" ADD COLUMN "logoColor" TEXT;
