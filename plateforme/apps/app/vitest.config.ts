import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests de la logique pure de l'app (calculs, règles) ; l'interface est vérifiée dans le navigateur.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/__tests__/**/*.test.ts"] },
});
