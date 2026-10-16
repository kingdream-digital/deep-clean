import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../theme/ThemeProvider";
import { DiscoverScreen } from "../public/DiscoverScreen";
import { QuoteRequestScreen } from "../public/QuoteRequestScreen";
import { getWelcomeOffer, submitQuoteRequest } from "../../api/public.api";
import { checkServiceArea } from "../../config/serviceArea";

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
  getWelcomeOffer: jest.fn(),
}));

const OFFER = {
  id: "offre-1",
  rate: 10,
  title: "Offre de bienvenue",
  summary: "Demandez votre devis depuis l'application : la remise est déduite directement de votre devis.",
  conditions: "Réservée aux nouveaux clients, pour une première prestation demandée depuis l'application. Non cumulable.",
  startsAt: "2026-10-01T00:00:00.000Z",
  endsAt: "2026-12-31T22:59:59.000Z",
};

function renderScreen(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getWelcomeOffer).mockResolvedValue(null);
});

describe("Découvrir Deep Clean", () => {
  it("présente les prestations, la zone et mène à la demande de devis ou à l'espace équipe", async () => {
    renderScreen(<DiscoverScreen />);
    await waitFor(() => expect(getWelcomeOffer).toHaveBeenCalled());
    expect(screen.getByText("Le propre, en profondeur.")).toBeTruthy();
    expect(screen.getByText("Nettoyage en profondeur")).toBeTruthy();
    expect(screen.getByText("Conciergerie")).toBeTruthy();
    expect(screen.getByText("Gréoux-les-Bains")).toBeTruthy();
    expect(screen.queryByText(/inscri|créer un compte/i)).toBeNull();

    fireEvent.press(screen.getAllByText("Demander un devis gratuit")[0]!);
    expect(mockNavigate).toHaveBeenCalledWith("QuoteRequest");
    fireEvent.press(screen.getAllByText("Espace équipe")[0]!);
    expect(mockNavigate).toHaveBeenCalledWith("Login");
    fireEvent.press(screen.getByText("Mentions légales"));
    expect(mockNavigate).toHaveBeenCalledWith("Legal");
    // Aucune offre en cours : pas de carte.
    expect(screen.queryByText("-10 %")).toBeNull();
  });

  it("affiche l'offre de bienvenue en cours, conditions comprises", async () => {
    jest.mocked(getWelcomeOffer).mockResolvedValue(OFFER);
    renderScreen(<DiscoverScreen />);
    expect(await screen.findByText("-10 %")).toBeTruthy();
    expect(screen.queryByText(/Non cumulable/)).toBeNull();
    fireEvent.press(screen.getByText("Voir les conditions"));
    expect(screen.getByText(/Non cumulable/)).toBeTruthy();
    fireEvent.press(screen.getByText("En profiter"));
    expect(mockNavigate).toHaveBeenCalledWith("QuoteRequest");
  });

  it("répond tout de suite à « Intervenez-vous chez moi ? »", async () => {
    renderScreen(<DiscoverScreen />);
    await waitFor(() => expect(getWelcomeOffer).toHaveBeenCalled());
    fireEvent.changeText(screen.getByPlaceholderText("Code postal"), "04800");
    fireEvent.press(screen.getByText("Vérifier"));
    expect(screen.getByText(/nous intervenons à Gréoux-les-Bains/)).toBeTruthy();
  });
});

describe("Zone d'intervention", () => {
  it("distingue communes desservies, voisines, éloignées et saisies invalides", () => {
    expect(checkServiceArea("04 100")).toEqual({ kind: "served", towns: ["Manosque"] });
    expect(checkServiceArea("04220")).toEqual({ kind: "served", towns: ["Sainte-Tulle", "Corbières"] });
    expect(checkServiceArea("84120")).toEqual({ kind: "maybe" });
    expect(checkServiceArea("75011")).toEqual({ kind: "outside" });
    expect(checkServiceArea("041")).toEqual({ kind: "invalid" });
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

  it("affiche en entier les conditions de l'offre en cours avant l'envoi", async () => {
    jest.mocked(getWelcomeOffer).mockResolvedValue(OFFER);
    renderScreen(<QuoteRequestScreen />);
    expect(await screen.findByText(/Non cumulable/)).toBeTruthy();
    expect(screen.queryByText("Voir les conditions")).toBeNull();
  });
});
