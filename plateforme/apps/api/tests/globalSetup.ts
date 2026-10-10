import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { Redis } from "ioredis";
import pg from "pg";

/**
 * Prépare la base de test : migrations appliquées par le rôle propriétaire,
 * puis tables vidées. Les tests eux-mêmes se connectent avec le rôle
 * applicatif restreint — l'isolation RLS est donc réellement éprouvée.
 */
export async function setup(): Promise<void> {
  const env = parseEnv(readFileSync(existsSync(".env.test") ? ".env.test" : ".env.test.example", "utf8")) as Record<string, string>;
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, ...env } });
  const admin = new pg.Client({ connectionString: env.DATABASE_ADMIN_URL });
  await admin.connect();
  const { rows } = await admin.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
  );
  await admin.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} CASCADE`);
  await admin.end();
  const redis = new Redis(env.REDIS_URL!);
  await redis.flushdb();
  await redis.quit();
}
