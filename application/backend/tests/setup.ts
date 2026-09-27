import dotenv from "dotenv";
import path from "node:path";

// Charge .env.test si présent (voir .env.test.example) avant tout import de l'app,
// pour que la connexion Prisma pointe vers la base de test dédiée.
dotenv.config({ path: path.resolve(__dirname, "../.env.test") });
process.env.NODE_ENV = "test";

// Fixe le fuseau horaire du processus de test sur celui du déploiement documenté
// (France). Sans cela, les tests de dates/heures de mission passeraient par
// accident sur une machine dont l'horloge système est en UTC (offset 0), sans
// jamais détecter un bug de conversion de fuseau horaire.
process.env.TZ = "Europe/Paris";

// La création/modification d'un chantier géocode son adresse (voir
// sites.service.ts) — jamais de vrai appel réseau pendant les tests : ça les
// rendrait lents, non déterministes, et dépendants d'un accès Internet
// sortant que l'environnement d'exécution des tests ne garantit pas. Un test
// qui a besoin d'une position GPS de chantier précise l'écrit directement via
// Prisma (même convention que les autres champs non couverts par l'API).
jest.mock("../src/utils/geocoding", () => ({
  geocodeAddress: jest.fn().mockResolvedValue(null),
}));
