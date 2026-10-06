import { countWorkableDays, frenchPublicHolidays } from "../src/utils/frenchCalendar";

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("Calendrier français — jours fériés et jours ouvrables", () => {
  it("calcule les fériés mobiles (Pâques 2026 : 5 avril)", () => {
    const h = frenchPublicHolidays(2026);
    expect(h.has("2026-04-06")).toBe(true); // lundi de Pâques
    expect(h.has("2026-05-14")).toBe(true); // Ascension
    expect(h.has("2026-05-25")).toBe(true); // lundi de Pentecôte
    expect(h.size).toBe(11);
  });

  it("une semaine de congé = 6 jours ouvrables (lundi → samedi)", () => {
    expect(countWorkableDays(day("2026-10-05"), day("2026-10-11"))).toBe(6);
  });

  it("ne décompte ni le dimanche ni un jour férié", () => {
    // Du lundi 9 au dimanche 15 novembre 2026, le 11 (mercredi) est férié.
    expect(countWorkableDays(day("2026-11-09"), day("2026-11-15"))).toBe(5);
  });
});
