import { computeWeekSummary, formatHoursMinutes } from "../timesheetSummary";
import type { TimeEntry } from "../../api/timesheets.api";

function makeEntry(overrides: Partial<TimeEntry>): TimeEntry {
  return {
    id: "entry-1",
    userId: "user-1",
    user: { id: "user-1", firstName: "Jean", lastName: "Dupont", role: "EMPLOYEE" },
    clockIn: "2026-01-05T08:00:00.000Z",
    clockOut: "2026-01-05T12:00:00.000Z",
    status: "PENDING",
    validatedById: null,
    validatedBy: null,
    validatedAt: null,
    comment: null,
    isRetroactive: false,
    createdAt: "2026-01-05T08:00:00.000Z",
    updatedAt: "2026-01-05T12:00:00.000Z",
    overtimeMinutes: null,
    ...overrides,
  } as TimeEntry;
}

describe("computeWeekSummary", () => {
  it("ignore les pointages encore ouverts (pas de clockOut)", () => {
    const summary = computeWeekSummary([makeEntry({ clockOut: null, status: "PENDING" })]);
    expect(summary).toEqual({ validatedMinutes: 0, pendingMinutes: 0, totalMinutes: 0 });
  });

  it("exclut les pointages refusés du total", () => {
    const summary = computeWeekSummary([makeEntry({ status: "REJECTED" })]);
    expect(summary.totalMinutes).toBe(0);
  });

  it("distingue les minutes validées des minutes en attente", () => {
    const validated = makeEntry({
      status: "VALIDATED",
      clockIn: "2026-01-05T08:00:00.000Z",
      clockOut: "2026-01-05T09:00:00.000Z", // 60 min
    });
    const pending = makeEntry({
      id: "entry-2",
      status: "PENDING",
      clockIn: "2026-01-06T08:00:00.000Z",
      clockOut: "2026-01-06T08:30:00.000Z", // 30 min
    });
    const summary = computeWeekSummary([validated, pending]);
    expect(summary).toEqual({ validatedMinutes: 60, pendingMinutes: 30, totalMinutes: 90 });
  });

  it("cumule plusieurs pointages du même statut", () => {
    const a = makeEntry({ id: "a", status: "VALIDATED", clockIn: "2026-01-05T08:00:00.000Z", clockOut: "2026-01-05T09:00:00.000Z" });
    const b = makeEntry({ id: "b", status: "VALIDATED", clockIn: "2026-01-06T08:00:00.000Z", clockOut: "2026-01-06T10:00:00.000Z" });
    const summary = computeWeekSummary([a, b]);
    expect(summary.validatedMinutes).toBe(180);
  });
});

describe("formatHoursMinutes", () => {
  it("affiche seulement les minutes en dessous d'une heure", () => {
    expect(formatHoursMinutes(45)).toBe("45 min");
  });

  it("omet les minutes quand elles sont nulles", () => {
    expect(formatHoursMinutes(120)).toBe("2 h");
  });

  it("affiche heures et minutes ensemble", () => {
    expect(formatHoursMinutes(135)).toBe("2 h 15");
  });

  it("gère zéro minute", () => {
    expect(formatHoursMinutes(0)).toBe("0 min");
  });
});
