import React, { createContext, useCallback, useContext, useRef } from "react";
import type { ScrollView, View } from "react-native";

export interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ScrollHandle {
  ref: React.RefObject<ScrollView | null>;
  // Suivi manuel (pas de state React) : mis à jour à chaque `onScroll`, lu de
  // façon synchrone au moment de défiler pour le tutoriel — un `useState`
  // provoquerait un rendu à chaque pixel défilé, inutile ici.
  scrollY: React.MutableRefObject<number>;
}

interface TargetRegistry {
  register: (id: string, ref: React.RefObject<View | null>) => void;
  unregister: (id: string) => void;
  measure: (id: string) => Promise<TargetRect | null>;
  registerScroll: (id: string, handle: ScrollHandle) => void;
  unregisterScroll: (id: string) => void;
  // Fait défiler la liste identifiée par `id` de `deltaY` pixels (positif =
  // vers le bas) à partir de sa position actuelle — ne fait rien si aucune
  // liste n'est inscrite sous cet identifiant (écran sans défilement, ou
  // élément déjà visible).
  scrollBy: (id: string, deltaY: number) => void;
}

const OnboardingTargetCtx = createContext<TargetRegistry | null>(null);

// Registre partagé des éléments réels de l'app que le tutoriel peut mettre
// en surbrillance — chaque écran s'y inscrit lui-même via <OnboardingTarget>
// (voir OnboardingTarget.tsx), l'overlay du tutoriel n'a besoin de connaître
// qu'un identifiant, jamais l'écran qui le porte. Les listes défilables
// s'inscrivent de la même façon (voir useOnboardingScrollProps.ts) pour que
// le tutoriel puisse amener un élément caché plus bas dans le champ visible.
export function OnboardingTargetProvider({ children }: { children: React.ReactNode }) {
  const refs = useRef(new Map<string, React.RefObject<View | null>>());
  const scrollRefs = useRef(new Map<string, ScrollHandle>());

  const register = useCallback((id: string, ref: React.RefObject<View | null>) => {
    refs.current.set(id, ref);
  }, []);

  const unregister = useCallback((id: string) => {
    refs.current.delete(id);
  }, []);

  const measure = useCallback((id: string): Promise<TargetRect | null> => {
    return new Promise((resolve) => {
      const ref = refs.current.get(id);
      if (!ref?.current) {
        resolve(null);
        return;
      }
      ref.current.measureInWindow((x, y, width, height) => {
        resolve(width > 0 && height > 0 ? { x, y, width, height } : null);
      });
    });
  }, []);

  const registerScroll = useCallback((id: string, handle: ScrollHandle) => {
    scrollRefs.current.set(id, handle);
  }, []);

  const unregisterScroll = useCallback((id: string) => {
    scrollRefs.current.delete(id);
  }, []);

  const scrollBy = useCallback((id: string, deltaY: number) => {
    const handle = scrollRefs.current.get(id);
    if (!handle?.ref.current) return;
    const nextY = Math.max(0, handle.scrollY.current + deltaY);
    handle.ref.current.scrollTo({ y: nextY, animated: true });
  }, []);

  const value = React.useMemo(
    () => ({ register, unregister, measure, registerScroll, unregisterScroll, scrollBy }),
    [register, unregister, measure, registerScroll, unregisterScroll, scrollBy]
  );

  return <OnboardingTargetCtx.Provider value={value}>{children}</OnboardingTargetCtx.Provider>;
}

export function useOnboardingTargetRegistry(): TargetRegistry {
  const ctx = useContext(OnboardingTargetCtx);
  if (!ctx) throw new Error("useOnboardingTargetRegistry doit être utilisé sous OnboardingTargetProvider.");
  return ctx;
}
