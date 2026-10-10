import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AccessibilityInfo, useColorScheme, useWindowDimensions } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { breakpoints, dark, light, radius, space, type, type Palette } from "./tokens";

export type ThemePreference = "system" | "light" | "dark";

interface ThemeValue {
  colors: Palette;
  space: typeof space;
  radius: typeof radius;
  type: typeof type;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  /** Mouvements réduits demandés par le système : animations coupées. */
  reduceMotion: boolean;
}

const STORAGE_KEY = "aussitot.theme";
const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (value === "light" || value === "dark" || value === "system") setPreferenceState(value);
      })
      .catch(() => undefined);
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    AsyncStorage.setItem(STORAGE_KEY, p).catch(() => undefined);
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const mode = preference === "system" ? (system === "dark" ? "dark" : "light") : preference;
    return { colors: mode === "dark" ? dark : light, space, radius, type, preference, setPreference, reduceMotion };
  }, [preference, system, setPreference, reduceMotion]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme doit être utilisé dans ThemeProvider");
  return value;
}

export type Breakpoint = "compact" | "medium" | "wide";

export function useBreakpoint(): { bp: Breakpoint; width: number; isWide: boolean; isCompact: boolean } {
  const { width } = useWindowDimensions();
  const bp: Breakpoint = width >= breakpoints.wide ? "wide" : width >= breakpoints.medium ? "medium" : "compact";
  return { bp, width, isWide: bp === "wide", isCompact: bp === "compact" };
}
