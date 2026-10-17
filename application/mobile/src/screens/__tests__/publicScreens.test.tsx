import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../theme/ThemeProvider";
import { PublicHomeScreen } from "../public/PublicHomeScreen";
import { PublicServiceScreen } from "../public/PublicServiceScreen";
import { QuoteRequestScreen } from "../public/QuoteRequestScreen";
import { submitQuoteRequest } from "../../api/public.api";
import { checkServiceArea } from "../../config/serviceArea";

// Accueil public (sans compte) : les services, leur page, et la demande de
// devis qui part dans les prospects.

const mockNavigate = jest.fn();
const mockPush = jest.fn();
let mockRouteParams: Record<string, unknown> | undefined;

jest.mock("@react-navigation/native", () => {
  const actual = jest.requireActual("@react-navigation/native");
  return {
    ...actual,
    useNavigation: () => ({ navigate: mockNavigate, push: mockPush, goBack: jest.fn(), setOptions: jest.fn() }),
    useRoute: () => ({ params: mockRouteParams }),
    useIsFocused: () => true,
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
  mockRouteParams = undefined;
});

describe("Accueil public", () => {
  it("présente les services et mène au devis, sans inscription ni numéro de téléphone", () => {
    renderScreen(<PublicHomeScreen />);
    expect(screen.getByLabelText("Deep Clean — Service de nettoyage")).toBeTruthy();
    expect(screen.getByText("Que pouvons-nous faire pour vous ?")).toBeTruthy();
    expect(screen.getByText("Votre devis en trois étapes")).toBeTruthy();
    expect(screen.queryByText(/inscri|créer un compte/i)).toBeNull();
    expect(screen.queryByText(/06 81 70 07 51|boulevard de la Plaine/)).toBeNull();

    fireEvent.press(screen.getAllByText("Demander un devis gratuit")[0]!);
    expect(mockNavigate).toHaveBeenCalledWith("QuoteRequest", undefined);
    fireEvent.press(screen.getByText("Conciergerie"));
    expect(mockNavigate).toHaveBeenCalledWith("PublicService", { service: "Conciergerie" });
    fireEvent.press(screen.getByText("Autre demande"));
    expect(mockNavigate).toHaveBeenCalledWith("QuoteRequest", { service: "Autre demande" });
  });

  it("ouvre le menu : tous les services, puis l'Espace équipe tout en bas", () => {
    renderScreen(<PublicHomeScreen />);
    expect(screen.queryByText("Connexion des collaborateurs Deep Clean")).toBeNull();
    fireEvent.press(screen.getByLabelText("Ouvrir le menu"));
    expect(screen.getByText("Connexion des collaborateurs Deep Clean")).toBeTruthy();
    // Page derrière masquée aux lecteurs d'écran : seul le « Matelas » du menu est accessible.
    fireEvent.press(screen.getByText("Matelas"));
    expect(mockNavigate).toHaveBeenCalledWith("PublicService", { service: "Matelas" });

    fireEvent.press(screen.getByLabelText("Ouvrir le menu"));
    fireEvent.press(screen.getByText("Connexion des collaborateurs Deep Clean"));
    expect(mockNavigate).toHaveBeenCalledWith("Login", undefined, { pop: true });
  });

  it("répond tout de suite à « Intervenez-vous chez moi ? »", () => {
    renderScreen(<PublicHomeScreen />);
    fireEvent.changeText(screen.getByPlaceholderText("Votre code postal"), "04800");
    fireEvent.press(screen.getByText("Vérifier"));
    expect(screen.getByText(/nous intervenons à Gréoux-les-Bains/)).toBeTruthy();
  });

  it("distingue communes desservies, voisines, éloignées et saisies invalides", () => {
    expect(checkServiceArea("04 100")).toEqual({ kind: "served", towns: ["Manosque"] });
    expect(checkServiceArea("04220")).toEqual({ kind: "served", towns: ["Sainte-Tulle", "Corbières"] });
    expect(checkServiceArea("84120")).toEqual({ kind: "maybe" });
    expect(checkServiceArea("75011")).toEqual({ kind: "outside" });
    expect(checkServiceArea("041")).toEqual({ kind: "invalid" });
  });
});

describe("Page d'un service", () => {
  it("présente le service et demande le devis avec ce service déjà choisi", () => {
    mockRouteParams = { service: "Nettoyage en profondeur" };
    renderScreen(<PublicServiceScreen />);
    expect(screen.getAllByText("Nettoyage en profondeur").length).toBeGreaterThan(0);
    expect(screen.getByText("Plans de travail & crédence")).toBeTruthy();
    fireEvent.press(screen.getByText("Chambre"));
    expect(screen.getByText("Dépoussiérage complet")).toBeTruthy();

    fireEvent.press(screen.getByText("Demander un devis pour ce service"));
    expect(mockNavigate).toHaveBeenCalledWith("QuoteRequest", { service: "Nettoyage en profondeur" });
  });
});

describe("Demande de devis", () => {
  it("part sans description : le service et de quoi recontacter suffisent", async () => {
    jest.mocked(submitQuoteRequest).mockResolvedValue("Votre demande a bien été envoyée. Nous revenons vers vous sous 24 à 48 h.");
    mockRouteParams = { service: "Matelas" };
    renderScreen(<QuoteRequestScreen />);
    expect(screen.getByText("Changer")).toBeTruthy();

    fireEvent.press(screen.getByText("Envoyer ma demande"));
    expect(await screen.findByText("Indiquez votre prénom et votre nom.")).toBeTruthy();
    expect(submitQuoteRequest).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByPlaceholderText("06 12 34 56 78"), "06 12 34 56 78");
    const [firstName, lastName] = screen.getAllByDisplayValue("").filter((input) => input.props.placeholder === undefined);
    fireEvent.changeText(firstName!, "Claire");
    fireEvent.changeText(lastName!, "Martin");
    fireEvent.press(screen.getByText(/J'accepte que DEEP CLEAN/));
    fireEvent.press(screen.getByText("Envoyer ma demande"));

    await waitFor(() => expect(submitQuoteRequest).toHaveBeenCalled());
    expect(jest.mocked(submitQuoteRequest).mock.calls[0]![0]).toMatchObject({
      customerType: "INDIVIDUAL",
      firstName: "Claire",
      lastName: "Martin",
      phone: "06 12 34 56 78",
      service: "Matelas",
      message: undefined,
      consent: true,
    });
    expect(await screen.findByText("Demande envoyée")).toBeTruthy();
    expect(screen.queryByText(/06 81 70 07 51/)).toBeNull();
  });

  it("fait choisir le service quand on arrive sans", async () => {
    renderScreen(<QuoteRequestScreen />);
    fireEvent.press(screen.getByText("Envoyer ma demande"));
    expect(await screen.findByText("Choisissez le service souhaité.")).toBeTruthy();
    fireEvent.press(screen.getByText("Conciergerie"));
    expect(screen.getByText("Un bien impeccable entre deux séjours")).toBeTruthy();
  });
});
