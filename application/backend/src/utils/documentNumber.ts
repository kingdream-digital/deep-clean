import { Prisma } from "@prisma/client";

// Numérotation continue des devis (DEV-AAAA-NNNN) et des factures
// (FAC-AAAA-NNNN). BUG CORRIGÉ (test de charge multi-utilisateurs) : le numéro
// était « nombre de documents de l'année + 1 », lu sans verrou — deux
// créations simultanées obtenaient le même numéro et la seconde échouait
// (contrainte d'unicité → « conflit », devis perdu pour l'utilisateur).
// Désormais : verrou PostgreSQL propre à la série (relâché à la fin de la
// transaction, donc après l'enregistrement du document), puis plus grand
// numéro existant + 1 — juste aussi au-delà de 9999 documents.
const SERIES = {
  quote: { table: "quotes", column: "quoteNumber" },
  invoice: { table: "invoices", column: "invoiceNumber" },
} as const;

export async function nextDocumentNumber(tx: Prisma.TransactionClient, kind: keyof typeof SERIES, prefix: string): Promise<string> {
  const { table, column } = SERIES[kind];
  // Position du premier chiffre : entier calculé ici, jamais une donnée reçue.
  const start = Prisma.raw(String(prefix.length + 1));
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`document-number:${prefix}`}))::text`;
  const rows = await tx.$queryRaw<{ max: number | null }[]>(
    Prisma.sql`SELECT MAX(CAST(SUBSTRING(${Prisma.raw(`"${column}"`)} FROM ${start}) AS INTEGER)) AS max
      FROM ${Prisma.raw(`"${table}"`)}
      WHERE ${Prisma.raw(`"${column}"`)} LIKE ${`${prefix}%`} AND SUBSTRING(${Prisma.raw(`"${column}"`)} FROM ${start}) ~ '^[0-9]+$'`
  );
  const next = Number(rows[0]?.max ?? 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}
