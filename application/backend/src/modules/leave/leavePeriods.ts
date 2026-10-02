// ---------------------------------------------------------------------------
// Congés N-1 / N — répartition du solde par période de référence
// ---------------------------------------------------------------------------
//
// Période de référence K = 1er juin K → 31 mai K+1 (L3141-10 à défaut
// d'accord). Les jours acquis pendant la période K se prennent ensuite
// jusqu'au 31 mai K+2. Vu d'aujourd'hui (période P) :
//   - « congés N-1 » = acquis pendant la période P-1, à prendre avant le
//     31 mai P+1 (ce qui reste « de l'an dernier ») ;
//   - « congés N »   = acquis pendant la période P, en cours d'acquisition ;
//   - ce qui reste des périodes ≤ P-2 au 31 mai est perdu, sauf report
//     accordé par la RH (correction manuelle, créditée en N-1).
//
// Un congé pris est décompté d'abord sur les congés les plus anciens encore
// valables (N-1), puis sur l'année en cours (congés pris par anticipation).

export interface LeaveCredit {
  periodYear: number;
  days: number;
}

export interface LeaveDebit {
  /** Jour du congé (ou de la correction), « AAAA-MM-JJ ». */
  dateKey: string;
  days: number;
}

export interface PeriodBucket {
  periodYear: number;
  acquired: number;
  used: number;
}

export interface LeavePeriodSplit {
  /** Reliquat de l'an dernier (période P-1). */
  previous: PeriodBucket & { remaining: number };
  /** Année en cours (période P). */
  current: PeriodBucket & { remaining: number };
  /** Jours non pris des périodes ≤ P-2, perdus au 31 mai. */
  expired: number;
}

/** Période de référence (année de début) d'un jour ou d'un mois « AAAA-MM[-JJ] ». */
export function referencePeriodOf(key: string): number {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  return m >= 6 ? y : y - 1;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function splitLeaveByPeriod(credits: LeaveCredit[], debits: LeaveDebit[], todayKey: string): LeavePeriodSplit {
  const today = referencePeriodOf(todayKey);
  const buckets = new Map<number, PeriodBucket>();
  const bucket = (periodYear: number): PeriodBucket => {
    let b = buckets.get(periodYear);
    if (!b) {
      b = { periodYear, acquired: 0, used: 0 };
      buckets.set(periodYear, b);
    }
    return b;
  };
  for (const c of credits) bucket(c.periodYear).acquired += c.days;

  const sorted = [...debits].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  for (const d of sorted) {
    // Une demande datée d'une période future est décomptée sur les droits
    // connus aujourd'hui.
    const q = Math.min(referencePeriodOf(d.dateKey), today);
    let left = d.days;
    for (const k of [q - 1, q]) {
      const b = bucket(k);
      const take = Math.min(left, Math.max(0, b.acquired - b.used));
      b.used += take;
      left -= take;
      if (left <= 0) break;
    }
    // Au-delà des droits : solde négatif sur l'année de la prise.
    if (left > 0) bucket(q).used += left;
  }

  let expired = 0;
  let oldDebt = 0;
  for (const b of buckets.values()) {
    if (b.periodYear > today - 2) continue;
    const rest = b.acquired - b.used;
    if (rest > 0) expired += rest;
    else oldDebt += rest;
  }

  const prev = bucket(today - 1);
  const cur = bucket(today);
  // Les jours à venir (demande future, correction datée) au-delà de P sont
  // déjà ramenés à P ; une dette ancienne reste due sur le reliquat.
  return {
    previous: {
      periodYear: prev.periodYear,
      acquired: round2(prev.acquired),
      used: round2(prev.used - oldDebt),
      remaining: round2(prev.acquired - prev.used + oldDebt),
    },
    current: { periodYear: cur.periodYear, acquired: round2(cur.acquired), used: round2(cur.used), remaining: round2(cur.acquired - cur.used) },
    expired: round2(expired),
  };
}
