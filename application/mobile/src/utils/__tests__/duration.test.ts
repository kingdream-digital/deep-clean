import { formatDuration } from "../duration";

describe("formatDuration", () => {
  it("affiche des minutes seules en dessous d'une heure", () => {
    const start = "2026-01-01T08:00:00.000Z";
    const end = "2026-01-01T08:45:00.000Z";
    expect(formatDuration(start, end)).toBe("45 min");
  });

  it("affiche heures et minutes au-delà d'une heure", () => {
    const start = "2026-01-01T08:00:00.000Z";
    const end = "2026-01-01T10:15:00.000Z";
    expect(formatDuration(start, end)).toBe("2 h 15");
  });

  it("n'affiche jamais de durée négative pour une horloge décalée", () => {
    const start = "2026-01-01T10:00:00.000Z";
    const end = "2026-01-01T09:00:00.000Z";
    expect(formatDuration(start, end)).toBe("0 min");
  });

  it("calcule jusqu'à maintenant quand le pointage est encore ouvert", () => {
    const now = new Date("2026-01-01T09:30:00.000Z");
    jest.useFakeTimers().setSystemTime(now);
    const start = "2026-01-01T09:00:00.000Z";
    expect(formatDuration(start, null)).toBe("30 min");
    jest.useRealTimers();
  });
});
