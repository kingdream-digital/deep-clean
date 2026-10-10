import { describe, expect, it } from "vitest";
import { assignableRoles, can, canManageAccount } from "../permissions";
import { isValidIban, isValidSiren, isValidSiret, passwordProblems } from "../validation";
import { classifyConfirmation } from "../assistant";
import { addDays, dayKey, formatDayLong, formatEuro, startOfWeek, timeKey, zonedDateTime } from "../format";
import { createMissionSchema, loginSchema } from "../schemas";

describe("permissions", () => {
  it("réserve la création de comptes à la RH et à l'administrateur", () => {
    expect(can("HR", "users.create")).toBe(true);
    expect(can("ADMIN", "users.create")).toBe(true);
    expect(can("DIRECTOR", "users.create")).toBe(false);
    expect(can("SUPERVISOR", "users.create")).toBe(false);
    expect(can("EMPLOYEE", "users.create")).toBe(false);
  });

  it("n'ouvre ni la facturation ni le planning complet à un employé", () => {
    for (const permission of ["invoices.read", "quotes.read", "planning.manage", "planning.readAll", "clients.read"] as const) {
      expect(can("EMPLOYEE", permission)).toBe(false);
    }
    expect(can("EMPLOYEE", "assistant.use")).toBe(true);
  });

  it("n'autorise jamais à attribuer un rang supérieur au sien", () => {
    expect(assignableRoles("HR")).toEqual(["HR", "SUPERVISOR", "TEAM_LEAD", "EMPLOYEE"]);
    expect(assignableRoles("DIRECTOR")).not.toContain("ADMIN");
    expect(assignableRoles("ADMIN")).toContain("ADMIN");
    expect(canManageAccount("HR", "DIRECTOR")).toBe(false);
    expect(canManageAccount("HR", "EMPLOYEE")).toBe(true);
    expect(canManageAccount("HR", "HR")).toBe(false);
  });
});

describe("identifiants français", () => {
  it("valide SIREN, SIRET et IBAN", () => {
    expect(isValidSiren("732 829 320")).toBe(true);
    expect(isValidSiren("732829321")).toBe(false);
    expect(isValidSiret("73282932000074")).toBe(true);
    expect(isValidSiret("73282932000075")).toBe(false);
    expect(isValidIban("FR76 3000 6000 0112 3456 7890 189")).toBe(true);
    expect(isValidIban("FR76 3000 6000 0112 3456 7890 188")).toBe(false);
  });

  it("applique la politique de mot de passe", () => {
    expect(passwordProblems("court")).not.toHaveLength(0);
    expect(passwordProblems("toutenminuscules")).toHaveLength(0); // phrase de passe de 16 caractères
    expect(passwordProblems("abcdefghijkl")).not.toHaveLength(0); // 12 caractères, une seule classe
    expect(passwordProblems("Soleil-2026!")).toHaveLength(0);
    expect(passwordProblems("Jdupont-2026!", ["jdupont"])).not.toHaveLength(0);
  });
});

describe("confirmation à la voix", () => {
  it("reconnaît les acquiescements et les refus courts", () => {
    expect(classifyConfirmation("Oui, vas-y")).toBe("confirm");
    expect(classifyConfirmation("ok")).toBe("confirm");
    expect(classifyConfirmation("Non merci")).toBe("cancel");
    expect(classifyConfirmation("annule")).toBe("cancel");
  });

  it("laisse passer les vraies demandes", () => {
    expect(classifyConfirmation("Fais un devis pour la boulangerie Martin")).toBeNull();
    expect(classifyConfirmation("ok mais change le prix à 40 euros de l'heure s'il te plaît")).toBeNull();
  });
});

describe("dates et fuseaux", () => {
  it("convertit l'heure murale de Paris, heure d'été comprise", () => {
    expect(zonedDateTime("2026-07-01", "08:00", "Europe/Paris").toISOString()).toBe("2026-07-01T06:00:00.000Z");
    expect(zonedDateTime("2026-12-01", "08:00", "Europe/Paris").toISOString()).toBe("2026-12-01T07:00:00.000Z");
    const instant = new Date("2026-10-25T00:30:00.000Z");
    expect(dayKey(instant, "Europe/Paris")).toBe("2026-10-25");
    expect(timeKey(instant, "Europe/Paris")).toBe("02:30");
  });

  it("formate les jours à la française", () => {
    expect(formatDayLong("2026-10-01")).toBe("jeudi 1er octobre 2026");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(startOfWeek("2026-10-11")).toBe("2026-10-05");
    expect(formatEuro(125050, { plain: true })).toBe("1 250,50 €");
  });
});

describe("schémas", () => {
  it("refuse une mission qui finit avant de commencer", () => {
    const result = createMissionSchema.safeParse({ title: "Vitres", date: "2026-10-12", startTime: "10:00", endTime: "09:00" });
    expect(result.success).toBe(false);
  });

  it("normalise le code entreprise", () => {
    const parsed = loginSchema.parse({ organization: "  Deep-Clean ", identifier: "jdupont", password: "x" });
    expect(parsed.organization).toBe("deep-clean");
    expect(parsed.rememberMe).toBe(false);
  });
});
