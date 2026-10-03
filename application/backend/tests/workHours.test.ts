import { compensatoryRestMinutes, computePayBreakdown, isNightWorker } from "../src/modules/payroll/workHours";
import { companyDateTime } from "../src/utils/companyTime";

const at = (date: string, time: string) => companyDateTime(date, time);

describe("Heures majorées (convention collective de la propreté)", () => {
  it("une journée de semaine en journée n'a aucune majoration", () => {
    const b = computePayBreakdown([{ clockIn: at("2026-10-07", "08:00"), clockOut: at("2026-10-07", "12:00") }]);
    expect(b.totalMinutes).toBe(240);
    expect(b.minutesByCategory.normal).toBe(240);
    expect(b.premiumMinutes).toBe(0);
  });

  it("heures de nuit (21 h → 6 h) majorées de 20 %, découpage exact", () => {
    // Mercredi 19 h → jeudi 2 h : 2 h de jour, 5 h de nuit.
    const b = computePayBreakdown([{ clockIn: at("2026-10-07", "19:00"), clockOut: at("2026-10-08", "02:00") }]);
    expect(b.minutesByCategory.normal).toBe(120);
    expect(b.minutesByCategory.night).toBe(300);
    expect(b.nightMinutes).toBe(300);
    expect(b.premiumMinutes).toBe(60); // 300 × 20 %
    expect(b.nightMinutesByWorkDay).toEqual({ "2026-10-07": 300 });
  });

  it("dimanche prévu : +20 % avant le 1er juillet 2026, +25 % ensuite", () => {
    const before = computePayBreakdown([{ clockIn: at("2026-06-07", "08:00"), clockOut: at("2026-06-07", "10:00") }]);
    expect(before.minutesByCategory.sunday).toBe(120);
    expect(before.premiumMinutes).toBe(24);
    const after = computePayBreakdown([{ clockIn: at("2026-10-04", "08:00"), clockOut: at("2026-10-04", "10:00") }]);
    expect(after.premiumMinutes).toBe(30);
  });

  it("jour férié prévu +50 %, 1er mai et 25 décembre +100 %", () => {
    const armistice = computePayBreakdown([{ clockIn: at("2026-11-11", "08:00"), clockOut: at("2026-11-11", "10:00") }]);
    expect(armistice.minutesByCategory.holiday).toBe(120);
    expect(armistice.premiumMinutes).toBe(60);
    const mai = computePayBreakdown([{ clockIn: at("2026-05-01", "08:00"), clockOut: at("2026-05-01", "10:00") }]);
    expect(mai.premiumMinutes).toBe(120);
  });

  it("pas de cumul : un dimanche de nuit prend la majoration la plus favorable", () => {
    // Dimanche 4 octobre 2026 22 h → 23 h : nuit 20 %, dimanche 25 % → 25 %.
    const b = computePayBreakdown([{ clockIn: at("2026-10-04", "22:00"), clockOut: at("2026-10-04", "23:00") }]);
    expect(b.minutesByCategory.sunday).toBe(60);
    expect(b.minutesByCategory.night).toBe(0);
    expect(b.nightMinutes).toBe(60);
    expect(b.premiumMinutes).toBe(15);
  });

  it("intervention exceptionnelle : +100 % la nuit, le dimanche et les jours fériés", () => {
    const b = computePayBreakdown([{ clockIn: at("2026-10-07", "22:00"), clockOut: at("2026-10-07", "23:00"), exceptional: true }]);
    expect(b.premiumMinutes).toBe(60);
  });

  it("changement d'heure : la nuit du passage à l'heure d'hiver compte bien 1 h de plus", () => {
    // Nuit du 24 au 25 octobre 2026 : 22 h → 6 h = 9 h réelles.
    const b = computePayBreakdown([{ clockIn: at("2026-10-24", "22:00"), clockOut: at("2026-10-25", "06:00") }]);
    expect(b.totalMinutes).toBe(9 * 60);
    expect(b.nightMinutes).toBe(9 * 60);
  });

  it("travailleur de nuit : 2 nuits de 3 h par semaine, ou 270 h sur 12 mois", () => {
    const nights = ["2026-10-05", "2026-10-07", "2026-10-12", "2026-10-14"].map((d) => ({ clockIn: at(d, "21:00"), clockOut: at(d, "23:59") }));
    const b = computePayBreakdown(nights.map((n) => ({ ...n, clockOut: new Date(n.clockIn.getTime() + 3 * 3_600_000) })));
    expect(isNightWorker(b, ["2026-10-05", "2026-10-07", "2026-10-12", "2026-10-14"], 0)).toBe(true);
    const oneNight = computePayBreakdown([{ clockIn: at("2026-10-05", "21:00"), clockOut: at("2026-10-06", "00:00") }]);
    expect(isNightWorker(oneNight, ["2026-10-05", "2026-10-06", "2026-10-07"], 0)).toBe(false);
    expect(isNightWorker(oneNight, ["2026-10-05"], 270 * 60)).toBe(true);
  });

  it("repos compensateur : 2 % des heures de nuit", () => {
    expect(compensatoryRestMinutes(100 * 60)).toBe(120);
  });
});
