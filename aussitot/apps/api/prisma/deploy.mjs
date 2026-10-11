/**
 * Préparation de la base à chaque déploiement (image « migrate ») :
 *
 * 1. Rôle PostgreSQL de l'API (« aussitot_app », SANS privilège, soumis à la
 *    RLS), créé AVANT les migrations qui lui accordent ses droits. Seulement
 *    si APP_DB_PASSWORD est fourni : utile quand la base est créée par
 *    l'hébergeur (Coolify…) sans script d'initialisation. Ailleurs, le rôle
 *    vient de infra/db/init ou infra/production/db-init.
 * 2. Migrations (prisma migrate deploy, rôle propriétaire DATABASE_ADMIN_URL).
 * 3. Jeu de démonstration, seulement si DEMO_SEED=1 et s'il n'est pas déjà
 *    chargé (serveur d'essai uniquement : mots de passe de démo publics).
 */
import { spawnSync } from "node:child_process";
import pg from "pg";

const adminUrl = process.env.DATABASE_ADMIN_URL;
if (!adminUrl) {
  console.error("DATABASE_ADMIN_URL est requis.");
  process.exit(1);
}

async function withAdmin(fn) {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", env: { ...process.env, ...extraEnv } });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// 1. Rôle applicatif
const appPassword = process.env.APP_DB_PASSWORD;
if (appPassword) {
  await withAdmin(async (db) => {
    const exists = (await db.query("SELECT 1 FROM pg_roles WHERE rolname = 'aussitot_app'")).rowCount > 0;
    const password = db.escapeLiteral(appPassword);
    if (exists) {
      await db.query(`ALTER ROLE aussitot_app PASSWORD ${password}`);
    } else {
      await db.query(`CREATE ROLE aussitot_app LOGIN PASSWORD ${password} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`);
      console.log("Rôle aussitot_app créé.");
    }
    const { database } = (await db.query("SELECT current_database() AS database")).rows[0];
    await db.query(`GRANT CONNECT ON DATABASE ${db.escapeIdentifier(database)} TO aussitot_app`);
  });
}

// 2. Migrations
run("npx", ["prisma", "migrate", "deploy"]);

// 3. Démonstration (facultative, une seule fois)
if (process.env.DEMO_SEED === "1" || process.env.DEMO_SEED === "true") {
  const loaded = await withAdmin(async (db) => (await db.query("SELECT id FROM app_org_by_slug('deep-clean')")).rowCount > 0);
  if (loaded) {
    console.log("Démonstration déjà chargée : rien à faire.");
  } else {
    run("npx", ["tsx", "prisma/seed.ts"], { DEMO_MODE: "1" });
  }
}
