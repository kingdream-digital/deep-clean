import { defineConfig } from "tsup";

/**
 * Build de production : deux points d'entrée (API HTTP et worker), le code
 * de l'application et le paquet partagé regroupés ; les dépendances npm
 * restent dans node_modules (installées dans l'image Docker).
 */
export default defineConfig({
  entry: { server: "src/server.ts", worker: "src/worker.ts" },
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: true,
  noExternal: [/^@aussitot\//],
  // Certaines dépendances CommonJS utilisent require() : on le fournit au module ESM.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});
