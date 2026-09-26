import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { markOnboardingSeen, readOnboardingSeen } from "./onboardingStorage";

interface OnboardingContextValue {
  visible: boolean;
  // Revoir le tutoriel à la demande (Profil → Aide) : rouvre l'overlay sans
  // toucher au marqueur "déjà vu", qui reste acquis pour l'affichage
  // automatique au prochain lancement.
  replay: () => void;
  dismiss: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);

  // Déclenchement automatique : uniquement une fois le mot de passe
  // définitif en place (voir RootNavigator — tant que `mustChangePassword`
  // est vrai, l'utilisateur est bloqué sur ForcePasswordChangeScreen, ce
  // n'est qu'après ça qu'il "arrive" réellement sur l'application).
  useEffect(() => {
    let cancelled = false;
    if (!user || user.mustChangePassword) return;
    (async () => {
      const seen = await readOnboardingSeen(user.id);
      if (!cancelled && !seen) setVisible(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.mustChangePassword]);

  function dismiss() {
    setVisible(false);
    if (user) void markOnboardingSeen(user.id);
  }

  function replay() {
    setVisible(true);
  }

  return <OnboardingContext.Provider value={{ visible, replay, dismiss }}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding doit être utilisé sous OnboardingProvider.");
  return ctx;
}
