import { describe, expect, it } from "vitest";
import { passwordChecks } from "../password";

describe("règles du mot de passe affichées", () => {
  it("valide un mot de passe conforme et confirmé", () => {
    expect(passwordChecks("Lavande-Bleue-2026!", "Lavande-Bleue-2026!", ["Ines", "Moreau", "imoreau"]).valid).toBe(true);
  });
  it("refuse un mot de passe trop court ou non confirmé", () => {
    expect(passwordChecks("Court1!", "Court1!", []).valid).toBe(false);
    expect(passwordChecks("Lavande-Bleue-2026!", "Lavande-Bleue-2025!", []).valid).toBe(false);
  });
  it("refuse un mot de passe contenant le nom de la personne", () => {
    const { valid, checks } = passwordChecks("Moreau-Ines-2026!", "Moreau-Ines-2026!", ["Ines", "Moreau", "imoreau"]);
    expect(valid).toBe(false);
    expect(checks[2]?.ok).toBe(false);
  });
});
