import {
  addDaysToKey,
  calendarDay,
  calendarDayKey,
  companyDateKey,
  companyDateTime,
  companyDayEnd,
  companyDayStart,
  companyTimeKey,
  companyWeekday,
} from "../src/utils/companyTime";

// Ces fonctions ne doivent jamais dépendre du fuseau du serveur : les mêmes
// résultats sont attendus que la suite tourne en UTC ou à Paris.
describe("Heure de l'entreprise (Paris), quel que soit le fuseau du serveur", () => {
  it("interprète 08:00 en heure de Paris, été comme hiver", () => {
    expect(companyDateTime("2026-10-02", "08:00").toISOString()).toBe("2026-10-02T06:00:00.000Z");
    expect(companyDateTime("2026-12-02", "08:00").toISOString()).toBe("2026-12-02T07:00:00.000Z");
  });

  it("gère les jours de changement d'heure", () => {
    // Passage à l'heure d'hiver le 25 octobre 2026 à 3 h.
    expect(companyDateTime("2026-10-25", "10:00").toISOString()).toBe("2026-10-25T09:00:00.000Z");
    // Passage à l'heure d'été le 29 mars 2026 à 2 h.
    expect(companyDateTime("2026-03-29", "10:00").toISOString()).toBe("2026-03-29T08:00:00.000Z");
  });

  it("relit l'heure et le jour de Paris à partir d'un instant", () => {
    const instant = new Date("2026-10-01T22:30:00.000Z"); // 2 octobre, 0 h 30 à Paris
    expect(companyDateKey(instant)).toBe("2026-10-02");
    expect(companyTimeKey(instant)).toBe("00:30");
    expect(companyWeekday(instant)).toBe(5); // vendredi
  });

  it("borne une journée de Paris", () => {
    expect(companyDayStart("2026-10-02").toISOString()).toBe("2026-10-01T22:00:00.000Z");
    expect(companyDayEnd("2026-10-02").toISOString()).toBe("2026-10-02T21:59:59.999Z");
  });

  it("stocke un jour calendaire à minuit UTC", () => {
    expect(calendarDay("2026-10-02").toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(calendarDayKey(calendarDay("2026-10-02"))).toBe("2026-10-02");
    expect(addDaysToKey("2026-10-31", 1)).toBe("2026-11-01");
  });
});
