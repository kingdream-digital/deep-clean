import { PrismaClient } from "@prisma/client";
import { env } from "../config/env";

// Instance unique du client Prisma, réutilisée dans toute l'application
// (évite l'épuisement du pool de connexions en développement avec le hot-reload).
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: env.isProduction ? ["error", "warn"] : ["error", "warn"],
  });

if (!env.isProduction) {
  global.__prisma = prisma;
}
