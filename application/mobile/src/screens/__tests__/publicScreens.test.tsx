import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../theme/ThemeProvider";
import { DiscoverScreen } from "../public/DiscoverScreen";
import { QuoteRequestScreen } from "../public/QuoteRequestScreen";
import { submitQuoteRequest } from "../../api/public.api";

// Espace public (sans compte) : présentation de DEEP CLEAN et demande de devis.

const mockNavigate = jest.fn();

jest.mock("@react-navigation/native", () => {
  const actual = jest.requireActual("@react-navigation/native");
  return {
    ...actual,
    useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn(), setOptions: jest.fn() }),
  };
});

jest.mock("../../api/public.api", () => ({
  ...jest.requireActual("../../api/public.api"),
  submitQuoteRequest: jest.fn(),
}));

function renderScreen(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Découvrir Deep Clean", () => {
  it("présente les prestations, la zone et mène à la demande de devis ou à la connexion", () => {
    renderScreen(<DiscoverScreen />);
    expect(screen.getByText("Le propre, en profondeur.")).toBeTruthy();
    expect(screen.getByText("Nettoyage en profondeur")).toBeTruthy();
    expect(screen.getByText("Conciergerie")).toBeTruthy();
    expect(screen.getByText("Gréoux-les-Bains")).toBeTruthy();
    expect(screen.queryByText(/inscri|créer un compte/i)).toBeNull();

    fireEvent.press(screen.getAllByText("Demander un devis gratuit")[0]!);
    expect(mockNavigate).toHaveBeenCalledWith("QuoteRequest");
    fireEvent.press(screen.getByText("Se connecter"));
    expect(mockNavigate).toHaveBeenCalledWith("Login");
  });
});

describe("Demande de devis", () => {
  it("guide la saisie puis envoie la demande et confirme", async () => {
    jest.mocked(submitQuoteRequest).mockResolvedValue("Votre demande a bien été envoyée. Nous revenons vers vous sous 24 à 48 h.");
    renderScreen(<QuoteRequestScreen />);

    fireEvent.press(screen.getByText("Envoyer ma demande"));
    expect(await screen.findByText("Indiquez votre prénom et votre nom.")).toBeTruthy();
    expect(submitQuoteRequest).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByPlaceholderText("06 12 34 56 78"), "06 12 34 56 78");
    const [firstName, lastName] = screen.getAllByDisplayValue("");
    fireEvent.changeText(firstName!, "Claire");
    fireEvent.changeText(lastName!, "Martin");
    fireEvent.press(screen.getByText("Matelas"));
    fireEvent.changeText(screen.getByPlaceholderText("Surface, état, disponibilités…"), "Deux matelas à traiter en profondeur.");

    fireEvent.press(screen.getByText("Envoyer ma demande"));
    expect(await screen.findByText(/Votre accord est nécessaire/)).toBeTruthy();

    fireEvent.press(screen.getByText(/J'accepte que DEEP CLEAN/));
    fireEvent.press(screen.getByText("Envoyer ma demande"));

    await waitFor(() => expect(submitQuoteRequest).toHaveBeenCalled());
    expect(jest.mocked(submitQuoteRequest).mock.calls[0]![0]).toMatchObject({
      customerType: "INDIVIDUAL",
      firstName: "Claire",
      lastName: "Martin",
      phone: "06 12 34 56 78",
      service: "Matelas",
      consent: true,
    });
    expect(await screen.findByText("Demande envoyée")).toBeTruthy();
  });
});
