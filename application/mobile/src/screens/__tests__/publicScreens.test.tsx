import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../theme/ThemeProvider";
import { PublicHomeScreen } from "../public/PublicHomeScreen";
import { PublicNewsScreen } from "../public/PublicNewsScreen";
import { QuoteRequestScreen } from "../public/QuoteRequestScreen";
import { listPublicNews, submitQuoteRequest } from "../../api/public.api";
import { checkServiceArea } from "../../config/serviceArea";

// Accueil public (sans compte) : la « plongée » avec son menu, les actualités
// et la demande de devis.

const mockNavigate = jest.fn();
let mockRouteParams: Record<string, unknown> | undefined;

jest.mock("@react-navigation/native", () => {
  const actual = jest.requireActual("@react-navigation/native");
  const { useEffect } = jest.requireActual("react");
  return {
    ...actual,
    useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn(), setOptions: jest.fn() }),
    useRoute: () => ({ params: mockRouteParams }),
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
    useIsFocused: () => true,
  };
});

jest.mock("../../api/public.api", () => ({
  ...jest.requireActual("../../api/public.api"),
  submitQuoteRequest: jest.fn(),
  listPublicNews: jest.fn(),
}));

const NEWS = {
  id: "8f4c1e0a-0000-4000-8000-000000000001",
  title: "Nous recrutons à Manosque",
  body: "Deep Clean agrandit son équipe : envoyez-nous votre candidature.",
  publishedAt: "2026-10-14T08:00:00.000Z",
  hasCoverPhoto: false,
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
  mockRouteParams = undefined;
  jest.mocked(listPublicNews).mockResolvedValue({ items: [], total: 0 });
});

describe("Accueil public", () => {
  it("présente Deep Clean de la surface au fond, sans inscription", async () => {
    renderScreen(<PublicHomeScreen />);
    await waitFor(() => expect(listPublicNews).toHaveBeenCalled());
    expect(screen.getByLabelText("Deep Clean — Service de nettoyage")).toBeTruthy();
    expect(screen.getByText("On ne nettoie pas en surface.")).toBeTruthy();
    expect(screen.getByText("Nettoyage en profondeur")).toBeTruthy();
    expect(screen.getByText("Une méthode, pas une routine")).toBeTruthy();
    expect(screen.getByText("Parlons de votre projet")).toBeTruthy();
    expect(screen.queryByText(/inscri|créer un compte/i)).toBeNull();
    // Aucune actualité publiée : pas de partie vide.
    expect(screen.queryByText("Les nouvelles de Deep Clean")).toBeNull();

    fireEvent.press(screen.getAllByText("Demander un devis gratuit")[0]!);
    expect(mockNavigate).toHaveBeenCalledWith("QuoteRequest", undefined);
    fireEvent.press(screen.getByText("Conciergerie"));
    expect(mockNavigate).toHaveBeenCalledWith("QuoteRequest", { service: "Conciergerie" });
  });

  it("ouvre le menu « plongée » : parties, services, puis Espace équipe", async () => {
    renderScreen(<PublicHomeScreen />);
    await waitFor(() => expect(listPublicNews).toHaveBeenCalled());
    expect(screen.queryByText("−14 m")).toBeNull();

    fireEvent.press(screen.getByLabelText("Ouvrir le menu"));
    expect(screen.getByText("−14 m")).toBeTruthy();
    expect(screen.getByText("Contact & devis")).toBeTruthy();
    expect(screen.getByText("VOS SERVICES — DEVIS GRATUIT")).toBeTruthy();

    fireEvent.press(screen.getByText("Remise en état"));
    expect(mockNavigate).toHaveBeenCalledWith("QuoteRequest", { service: "Remise en état" });

    fireEvent.press(screen.getByLabelText("Ouvrir le menu"));
    fireEvent.press(screen.getByText("Connexion des collaborateurs Deep Clean"));
    expect(mockNavigate).toHaveBeenCalledWith("Login", undefined, { pop: true });
  });

  it("mène à la liste des actualités depuis le menu quand aucune n'est à la une", async () => {
    renderScreen(<PublicHomeScreen />);
    await waitFor(() => expect(listPublicNews).toHaveBeenCalled());
    fireEvent.press(screen.getByLabelText("Ouvrir le menu"));
    fireEvent.press(screen.getByText("Actualités"));
    expect(mockNavigate).toHaveBeenCalledWith("PublicNews");
  });

  it("affiche les actualités publiées par la RH ou la direction", async () => {
    jest.mocked(listPublicNews).mockResolvedValue({ items: [NEWS], total: 1 });
    renderScreen(<PublicHomeScreen />);
    expect(await screen.findByText("Nous recrutons à Manosque")).toBeTruthy();
    fireEvent.press(screen.getByText("Nous recrutons à Manosque"));
    expect(mockNavigate).toHaveBeenCalledWith("PublicNewsDetail", { newsId: NEWS.id });
    fireEvent.press(screen.getByText("Tout voir"));
    expect(mockNavigate).toHaveBeenCalledWith("PublicNews");
  });

  it("détaille pièce par pièce et répond à « Intervenez-vous chez moi ? »", async () => {
    renderScreen(<PublicHomeScreen />);
    await waitFor(() => expect(listPublicNews).toHaveBeenCalled());
    expect(screen.getByText("Plans de travail & crédence")).toBeTruthy();
    fireEvent.press(screen.getByText("Chambre"));
    expect(screen.getByText("Dépoussiérage complet")).toBeTruthy();

    fireEvent.changeText(screen.getByPlaceholderText("Code postal"), "04800");
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

describe("Actualités", () => {
  it("annonce simplement qu'il n'y a rien quand aucune actualité n'est publique", async () => {
    renderScreen(<PublicNewsScreen />);
    expect(await screen.findByText(/Les actualités de Deep Clean apparaîtront ici/)).toBeTruthy();
  });

  it("liste les actualités publiques", async () => {
    jest.mocked(listPublicNews).mockResolvedValue({ items: [NEWS], total: 1 });
    renderScreen(<PublicNewsScreen />);
    expect(await screen.findByText("Nous recrutons à Manosque")).toBeTruthy();
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

  it("reprend la prestation choisie depuis l'accueil", async () => {
    jest.mocked(submitQuoteRequest).mockResolvedValue("ok");
    mockRouteParams = { service: "Conciergerie" };
    renderScreen(<QuoteRequestScreen />);
    fireEvent.changeText(screen.getByPlaceholderText("06 12 34 56 78"), "06 12 34 56 78");
    const [firstName, lastName] = screen.getAllByDisplayValue("");
    fireEvent.changeText(firstName!, "Paul");
    fireEvent.changeText(lastName!, "Durand");
    fireEvent.changeText(screen.getByPlaceholderText("Surface, état, disponibilités…"), "Appartement loué en saisonnier, 45 m².");
    fireEvent.press(screen.getByText(/J'accepte que DEEP CLEAN/));
    fireEvent.press(screen.getByText("Envoyer ma demande"));
    await waitFor(() => expect(submitQuoteRequest).toHaveBeenCalled());
    expect(jest.mocked(submitQuoteRequest).mock.calls[0]![0].service).toBe("Conciergerie");
  });
});
