import React, { useEffect, useRef } from "react";
import { View, ViewProps } from "react-native";
import { useOnboardingTargetRegistry } from "./OnboardingTargetContext";

interface OnboardingTargetProps extends ViewProps {
  id: string;
  children: React.ReactNode;
}

// Enveloppe un élément réel de l'app pour le rendre "ciblable" par le
// tutoriel (voir OnboardingOverlay.tsx) — ne change rien au rendu ni au
// comportement de l'écran, seulement une inscription/désinscription dans le
// registre partagé. `collapsable={false}` est nécessaire sur Android : sans
// ça, le moteur natif peut aplatir cette vue dans son parent et
// `measureInWindow` renverrait alors la position du mauvais élément.
export function OnboardingTarget({ id, children, ...rest }: OnboardingTargetProps) {
  const ref = useRef<View>(null);
  const { register, unregister } = useOnboardingTargetRegistry();

  useEffect(() => {
    register(id, ref);
    return () => unregister(id);
  }, [id, register, unregister]);

  return (
    <View ref={ref} collapsable={false} {...rest}>
      {children}
    </View>
  );
}
