/**
 * Outil de l'OPÉRATEUR de la plateforme (pas d'inscription publique) : ouvrir
 * le compte d'une nouvelle entreprise cliente et de son administrateur.
 *
 *   npm run platform -w @aussitot/api -- create-org \
 *     --slug proprete-martin --name "Propreté Martin" \
 *     --admin-first Claire --admin-last Martin [--admin-email claire@exemple.fr] \
 *     [--plan PRO] [--seats 25]
 *
 * Même service et mêmes règles que l'API opérateur (POST /v1/platform/organizations).
 * Le mot de passe temporaire n'est affiché qu'ici, une seule fois : à transmettre
 * à l'administrateur par un canal sûr ; il le changera à sa première connexion.
 */
import { parseArgs } from "node:util";
import { AppError } from "../lib/errors.ts";
import { prisma } from "../lib/db.ts";
import { createOrganization } from "../modules/platform/platform.service.ts";

const USAGE = `Usage : npm run platform -w @aussitot/api -- create-org --slug <code> --name <nom> --admin-first <prénom> --admin-last <nom> [--admin-email <email>] [--plan STARTER|PRO|BUSINESS] [--seats <n>]`;

async function main(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      slug: { type: "string" },
      name: { type: "string" },
      "admin-first": { type: "string" },
      "admin-last": { type: "string" },
      "admin-email": { type: "string" },
      plan: { type: "string" },
      seats: { type: "string" },
    },
  });
  if (positionals[0] !== "create-org") {
    console.error(USAGE);
    return 2;
  }
  try {
    const { organization, admin } = await createOrganization({
      slug: values.slug ?? "",
      name: values.name ?? "",
      ...(values.plan ? { plan: values.plan as "STARTER" | "PRO" | "BUSINESS" } : {}),
      ...(values.seats ? { seatLimit: Number(values.seats) } : {}),
      admin: {
        firstName: values["admin-first"] ?? "",
        lastName: values["admin-last"] ?? "",
        ...(values["admin-email"] ? { email: values["admin-email"] } : {}),
      },
    });
    console.log(
      [
        `Entreprise créée : ${organization.name}`,
        `  Code entreprise      : ${organization.slug}`,
        `  Administrateur       : ${admin.user.firstName} ${admin.user.lastName}`,
        `  Identifiant          : ${admin.user.username}`,
        `  Mot de passe temporaire (affiché une seule fois) : ${admin.temporaryPassword}`,
        "",
        "À transmettre par un canal sûr. Il sera changé à la première connexion ;",
        "l'administrateur crée ensuite lui-même les comptes de son équipe.",
      ].join("\n"),
    );
    return 0;
  } catch (err) {
    if (err instanceof AppError) {
      console.error(`Refusé : ${err.message}`);
      for (const [field, messages] of Object.entries(err.details ?? {})) console.error(`  ${field} : ${messages.join(", ")}`);
      console.error(USAGE);
      return 1;
    }
    throw err;
  }
}

main()
  .then(async (code) => {
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async (err: unknown) => {
    console.error(err);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  });
