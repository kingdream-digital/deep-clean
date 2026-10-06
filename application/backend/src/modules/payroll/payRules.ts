// Majorations légales des heures — Convention collective nationale des
// entreprises de propreté et services associés (IDCC 3043, brochure 3173).
//
//   - Nuit (21 h → 6 h, art. 6.3) : +20 % pour un travail habituel, +100 %
//     pour un travail occasionnel / exceptionnel.
//   - Dimanche : +20 % pour un dimanche prévu au planning ou au contrat,
//     +25 % à partir du 1er juillet 2026 (avenant n° 23 du 18 décembre 2025),
//     +100 % pour un dimanche exceptionnel (non prévu).
//   - Jour férié (avenant n° 25) : +50 % prévu au planning ; +100 % s'il est
//     exceptionnel ou s'il s'agit du 1er janvier, 1er mai, 14 juillet ou
//     25 décembre.
//   - Les majorations ne se cumulent pas : pour chaque minute, on applique la
//     plus favorable au salarié.
//   - Travailleur de nuit (art. 6.3) : au moins 2 fois par semaine, selon son
//     horaire habituel, au moins 3 h entre 21 h et 6 h — ou 270 h de nuit sur
//     12 mois consécutifs (Code du travail, L3122-5 à défaut). Il acquiert un
//     repos compensateur de 2 % du travail effectif accompli entre 21 h et 6 h
//     dans le mois.
//
// Les taux sont centralisés ici, datés : un changement de convention se fait
// en ajoutant une ligne, sans toucher au calcul.

export interface DatedRate {
  from: string; // « AAAA-MM-JJ » inclus
  rate: number; // 0.25 = +25 %
}

export const NIGHT_START_HOUR = 21;
export const NIGHT_END_HOUR = 6;

export const PAY_RULES = {
  night: { regular: [{ from: "2000-01-01", rate: 0.2 }], exceptional: [{ from: "2000-01-01", rate: 1 }] },
  sunday: {
    regular: [
      { from: "2000-01-01", rate: 0.2 },
      { from: "2026-07-01", rate: 0.25 },
    ],
    exceptional: [{ from: "2000-01-01", rate: 1 }],
  },
  holiday: {
    regular: [{ from: "2000-01-01", rate: 0.5 }],
    exceptional: [{ from: "2000-01-01", rate: 1 }],
    // Jours fériés majorés à 100 % même prévus au planning (« MM-JJ »).
    alwaysFullDates: ["01-01", "05-01", "07-14", "12-25"],
  },
  nightWorker: {
    minNightMinutesPerDay: 3 * 60,
    minDaysPerWeek: 2,
    minNightHoursPer12Months: 270,
    compensatoryRestRatio: 0.02,
  },
} as const;

export function rateOn(rates: readonly DatedRate[], dateKey: string): number {
  let rate = 0;
  for (const r of rates) if (r.from <= dateKey) rate = r.rate;
  return rate;
}
