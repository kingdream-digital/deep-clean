import { dayOfMonthLabel, frenchDateFormat, withFirstOfMonth } from "../frenchDate";
import { formatMissionDay, formatWeekRange, isMissionOverdue } from "../missionFormat";
import { formatAbsencePeriod, formatDateRange } from "../frenchDate";
import { formatDays, formatDaysWithUnit } from "../leaveDays";

describe("frenchDateFormat", () => {
  it("écrit « 1er » pour le premier du mois", () => {
    const fmt = frenchDateFormat({ weekday: "long", day: "numeric", month: "long" });
    expect(fmt.format(new Date(2026, 9, 1))).toBe("jeudi 1er octobre");
  });

  it("garde le nombre seul pour les autres jours, y compris 11, 21 et 31", () => {
    const fmt = frenchDateFormat({ day: "numeric", month: "long" });
    expect(fmt.format(new Date(2026, 9, 2))).toBe("2 octobre");
    expect(fmt.format(new Date(2026, 9, 11))).toBe("11 octobre");
    expect(fmt.format(new Date(2026, 9, 21))).toBe("21 octobre");
    expect(fmt.format(new Date(2026, 9, 31))).toBe("31 octobre");
  });

  it("fonctionne avec les mois abrégés, l'année et l'heure", () => {
    expect(frenchDateFormat({ weekday: "short", day: "numeric", month: "short" }).format(new Date(2026, 9, 1))).toBe(
      "jeu. 1er oct."
    );
    expect(frenchDateFormat({ day: "numeric", month: "long", year: "numeric" }).format(new Date(2026, 0, 1))).toBe(
      "1er janvier 2026"
    );
    expect(
      frenchDateFormat({ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(
        new Date(2026, 9, 1, 1, 1)
      )
    ).toBe("1er oct., 01:01");
  });
});

describe("withFirstOfMonth / dayOfMonthLabel", () => {
  it("ne touche ni une année ni une date déjà correcte", () => {
    expect(withFirstOfMonth("12 janvier 2021")).toBe("12 janvier 2021");
    expect(withFirstOfMonth("1er mai")).toBe("1er mai");
  });

  it("libellé du jour seul", () => {
    expect(dayOfMonthLabel(1)).toBe("1er");
    expect(dayOfMonthLabel(14)).toBe("14");
  });
});

describe("dates du planning", () => {
  it("titre du jour : « Jeudi 1er octobre »", () => {
    expect(formatMissionDay(new Date(2026, 9, 1).toISOString())).toBe("Jeudi 1er octobre");
  });

  it("semaine qui commence le 1er", () => {
    expect(formatWeekRange(new Date(2026, 5, 1), new Date(2026, 5, 7))).toBe("1er – 7 juin");
  });

  it("semaine à cheval sur deux mois qui finit le 1er", () => {
    expect(formatWeekRange(new Date(2026, 8, 28), new Date(2026, 9, 4))).toBe("28 sept. – 4 oct.");
    expect(formatWeekRange(new Date(2026, 1, 23), new Date(2026, 2, 1))).toBe("23 févr. – 1er mars");
  });
});

describe("isMissionOverdue", () => {
  const now = new Date(2026, 9, 1, 14, 0).getTime();
  const at = (h: number) => new Date(2026, 9, 1, h, 0).toISOString();

  it("mission planifiée dont l'horaire est terminé : non démarrée", () => {
    expect(isMissionOverdue({ status: "SCHEDULED", endTime: at(9) }, now)).toBe(true);
  });

  it("mission planifiée encore à venir, ou en cours de créneau : pas en retard", () => {
    expect(isMissionOverdue({ status: "SCHEDULED", endTime: at(17) }, now)).toBe(false);
  });

  it("une mission démarrée, terminée ou annulée n'est jamais « non démarrée »", () => {
    expect(isMissionOverdue({ status: "IN_PROGRESS", endTime: at(9) }, now)).toBe(false);
    expect(isMissionOverdue({ status: "COMPLETED", endTime: at(9) }, now)).toBe(false);
    expect(isMissionOverdue({ status: "CANCELLED", endTime: at(9) }, now)).toBe(false);
  });
});

describe("formatDays (soldes de congés)", () => {
  it("virgule décimale, deux décimales au plus", () => {
    expect(formatDays(0.08)).toBe("0,08");
    expect(formatDays(12.5)).toBe("12,5");
    expect(formatDays(25)).toBe("25");
    expect(formatDays(2.0833333)).toBe("2,08");
  });

  it("pluriel à partir de deux jours", () => {
    expect(formatDaysWithUnit(1)).toBe("1 jour");
    expect(formatDaysWithUnit(1.5)).toBe("1,5 jour");
    expect(formatDaysWithUnit(2)).toBe("2 jours");
  });
});

describe("formatDateRange (périodes d'absence)", () => {
  it("même mois : le mois et l'année une seule fois", () => {
    expect(formatDateRange(new Date(2026, 9, 19), new Date(2026, 9, 23))).toBe("19 – 23 oct. 2026");
  });
  it("à cheval sur deux mois, et le 1er", () => {
    expect(formatDateRange(new Date(2026, 8, 28), new Date(2026, 9, 4))).toBe("28 sept. – 4 oct. 2026");
    expect(formatDateRange(new Date(2026, 9, 1), new Date(2026, 9, 2))).toBe("1er – 2 oct. 2026");
  });
  it("un seul jour, ou deux années différentes", () => {
    expect(formatDateRange(new Date(2026, 9, 5), new Date(2026, 9, 5))).toBe("5 oct. 2026");
    expect(formatDateRange(new Date(2026, 11, 28), new Date(2027, 0, 3))).toBe("28 déc. 2026 – 3 janv. 2027");
  });
});

describe("formatAbsencePeriod (fuseau horaire)", () => {
  const original = process.env.TZ;
  afterEach(() => {
    process.env.TZ = original;
  });

  it("une absence du 19 au 23 octobre reste du 19 au 23, même à l'heure de Paris", () => {
    process.env.TZ = "Europe/Paris";
    expect(formatAbsencePeriod("2026-10-19T00:00:00.000Z", "2026-10-23T23:59:59.999Z")).toBe("19 – 23 oct. 2026");
  });

  it("et en heure universelle", () => {
    process.env.TZ = "UTC";
    expect(formatAbsencePeriod("2026-10-05T00:00:00.000Z", "2026-10-05T23:59:59.999Z")).toBe("5 oct. 2026");
  });
});
