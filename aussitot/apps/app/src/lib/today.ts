import { useEffect, useState } from "react";
import { DEFAULT_TIME_ZONE, dayKey } from "@aussitot/shared";
import { useAuth } from "@/auth/AuthProvider";

/** Fuseau de l'entreprise (et non celui du téléphone) : les horaires affichés sont ceux du chantier. */
export function useOrgTimezone(): string {
  const { user } = useAuth();
  return user?.organization.timezone ?? DEFAULT_TIME_ZONE;
}

/** Jour courant « AAAA-MM-JJ » dans le fuseau de l'entreprise, mis à jour à minuit. */
export function useToday(): string {
  const timezone = useOrgTimezone();
  const [today, setToday] = useState(() => dayKey(new Date(), timezone));
  useEffect(() => {
    setToday(dayKey(new Date(), timezone));
    const timer = setInterval(() => setToday(dayKey(new Date(), timezone)), 60_000);
    return () => clearInterval(timer);
  }, [timezone]);
  return today;
}
