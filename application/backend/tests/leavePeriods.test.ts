import { referencePeriodOf, splitLeaveByPeriod } from "../src/modules/leave/leavePeriods";

describe("Congés N-1 / N (période de référence 1er juin → 31 mai)", () => {
  it("rattache chaque jour à sa période de référence", () => {
    expect(referencePeriodOf("2026-05-31")).toBe(2025);
    expect(referencePeriodOf("2026-06-01")).toBe(2026);
    expect(referencePeriodOf("2027-01")).toBe(2026);
  });

  it("sépare le reliquat de l'an dernier et l'année en cours", () => {
    const split = splitLeaveByPeriod(
      [
        { periodYear: 2025, days: 30 },
        { periodYear: 2026, days: 10 },
      ],
      [],
      "2026-10-02"
    );
    expect(split.previous).toMatchObject({ periodYear: 2025, acquired: 30, used: 0, remaining: 30 });
    expect(split.current).toMatchObject({ periodYear: 2026, acquired: 10, used: 0, remaining: 10 });
    expect(split.expired).toBe(0);
  });

  it("décompte un congé d'abord sur l'an dernier, puis sur l'année en cours", () => {
    const split = splitLeaveByPeriod(
      [
        { periodYear: 2025, days: 5 },
        { periodYear: 2026, days: 10 },
      ],
      [{ dateKey: "2026-08-10", days: 8 }],
      "2026-10-02"
    );
    expect(split.previous.remaining).toBe(0);
    expect(split.current.remaining).toBe(7);
  });

  it("le reliquat non pris au 31 mai est perdu", () => {
    const split = splitLeaveByPeriod(
      [
        { periodYear: 2024, days: 30 },
        { periodYear: 2025, days: 30 },
      ],
      [{ dateKey: "2025-08-01", days: 24 }],
      "2026-06-02"
    );
    // 6 jours de 2024 non pris au 31 mai 2026 : perdus.
    expect(split.expired).toBe(6);
    expect(split.previous).toMatchObject({ periodYear: 2025, remaining: 30 });
    expect(split.current).toMatchObject({ periodYear: 2026, remaining: 0 });
  });

  it("un congé pris au-delà des droits rend le solde de l'année négatif", () => {
    const split = splitLeaveByPeriod([{ periodYear: 2026, days: 2.5 }], [{ dateKey: "2026-07-06", days: 5 }], "2026-10-02");
    expect(split.previous.remaining).toBe(0);
    expect(split.current.remaining).toBe(-2.5);
  });

  it("une demande future est décomptée sur les droits connus aujourd'hui", () => {
    const split = splitLeaveByPeriod([{ periodYear: 2025, days: 4 }, { periodYear: 2026, days: 10 }], [{ dateKey: "2027-07-01", days: 6 }], "2026-10-02");
    expect(split.previous.remaining).toBe(0);
    expect(split.current.remaining).toBe(8);
  });
});
