import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Les migrations s'exécutent avec le rôle PROPRIÉTAIRE du schéma
// (DATABASE_ADMIN_URL) ; l'API, elle, se connecte avec un rôle sans
// privilège qui subit les politiques RLS (DATABASE_URL).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_ADMIN_URL"),
  },
});
