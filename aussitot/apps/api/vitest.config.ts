import { readFileSync, existsSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";

// Variables de test chargées AVANT tout import de l'application.
const envFile = existsSync(".env.test") ? ".env.test" : ".env.test.example";
const env = parseEnv(readFileSync(envFile, "utf8")) as Record<string, string>;

export default defineConfig({
  test: {
    env,
    globalSetup: ["tests/globalSetup.ts"],
    // Les suites partagent la base de test : exécution en série.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
