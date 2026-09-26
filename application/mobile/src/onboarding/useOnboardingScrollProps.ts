import { useEffect, useRef } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from "react-native";
import { useOnboardingTargetRegistry } from "./OnboardingTargetContext";

// À spreader directement sur le <ScrollView> d'un écran ciblé par le
// tutoriel (`ref`, `onScroll`, `scrollEventThrottle`) — permet au tutoriel de
// faire défiler cette liste pour amener un élément caché plus bas dans le
// champ visible avant de le mettre en surbrillance (voir
// OnboardingOverlay.tsx). Sans effet sur le fonctionnement normal de l'écran.
export function useOnboardingScrollProps(id: string) {
  const ref = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const { registerScroll, unregisterScroll } = useOnboardingTargetRegistry();

  useEffect(() => {
    registerScroll(id, { ref, scrollY });
    return () => unregisterScroll(id);
  }, [id, registerScroll, unregisterScroll]);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    scrollY.current = e.nativeEvent.contentOffset.y;
  }

  return { ref, onScroll, scrollEventThrottle: 16 };
}
