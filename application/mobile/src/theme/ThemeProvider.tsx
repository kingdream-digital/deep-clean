import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Palette, palettes } from "./colors";
import { spacing, radius } from "./spacing";
import { type as typeScale } from "./typography";
import { persistThemePreference, readThemePreference } from "./themePreference";

interface ThemeValue {
  colors: Palette;
  spacing: typeof spacing;
  radius: typeof radius;
  type: typeof typeScale;
  isDark: boolean;
  /** Change et persiste la préférence d'apparence (Profil → Apparence). */
  setDarkMode: (value: boolean) => void;
}

const ThemeContext = createContext<ThemeValue | undefined>(undefined);

// Identité de marque volontairement claire et colorée par défaut (retour
// explicite du client : un fond sombre "fait bas de gamme" pour un outil
// vendu comme premium) — mais l'utilisateur peut activer le sombre lui-même
// depuis Profil → Apparence (retour explicite du client, ajouté ensuite) ;
// ce choix est un simple réglage d'affichage local à l'appareil, jamais une
// donnée de compte, donc persistant via AsyncStorage plutôt que synchronisé
// avec le serveur.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readThemePreference().then((mode) => {
      if (!cancelled && mode === "dark") setIsDark(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function setDarkMode(value: boolean) {
    setIsDark(value);
    void persistThemePreference(value ? "dark" : "light");
  }

  const value = useMemo<ThemeValue>(
    () => ({
      colors: isDark ? palettes.dark : palettes.light,
      spacing,
      radius,
      type: typeScale,
      isDark,
      setDarkMode,
    }),
    [isDark]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme doit être utilisé à l'intérieur de <ThemeProvider>.");
  }
  return ctx;
}
