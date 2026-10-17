import React from "react";
import { render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../theme/ThemeProvider";
import { RootNavigator } from "../RootNavigator";

// L'accueil public n'existe que dans l'application iPhone/Android : dans un
// navigateur (app.deep-clean.fr), on arrive directement sur la connexion.

let mockHasPublicSpace = true;
jest.mock("../../config/publicSpace", () => ({
  get HAS_PUBLIC_SPACE() {
    return mockHasPublicSpace;
  },
}));

jest.mock("../../auth/AuthContext", () => ({
  useAuth: () => ({
    status: "unauthenticated",
    user: null,
    sessionExpired: false,
    endMessage: null,
    login: jest.fn(),
    biometricEnabled: false,
    enableBiometricLogin: jest.fn(),
  }),
}));

function renderRoot() {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        <RootNavigator />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

describe("Premier écran hors connexion", () => {
  it("navigateur : directement la connexion, sans accueil public ni lien vers les services", async () => {
    mockHasPublicSpace = false;
    renderRoot();
    expect(await screen.findByText("Se connecter")).toBeTruthy();
    expect(screen.getByText("Pour tout problème de connexion ou de compte, contactez la RH.")).toBeTruthy();
    expect(screen.queryByText("Que pouvons-nous faire pour vous ?")).toBeNull();
    expect(screen.queryByText("Découvrir nos services et demander un devis")).toBeNull();
    expect(screen.queryByLabelText("Retour à l'accueil")).toBeNull();
  });

  it("application iPhone/Android : l'accueil public s'ouvre en premier", async () => {
    mockHasPublicSpace = true;
    renderRoot();
    expect(await screen.findByText("Que pouvons-nous faire pour vous ?")).toBeTruthy();
    expect(screen.queryByText("Se connecter")).toBeNull();
  });

  it("l'accueil public est réservé aux plateformes iPhone et Android", () => {
    for (const [os, expected] of [["web", false], ["ios", true], ["android", true]] as const) {
      jest.isolateModules(() => {
        jest.doMock("react-native", () => ({ Platform: { OS: os } }));
        const { HAS_PUBLIC_SPACE } = jest.requireActual<typeof import("../../config/publicSpace")>("../../config/publicSpace");
        expect(HAS_PUBLIC_SPACE).toBe(expected);
      });
    }
  });
});
