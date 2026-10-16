import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../theme/ThemeProvider";
import { PublicHomeScreen } from "../public/PublicHomeScreen";
import { PublicServicesScreen } from "../public/PublicServicesScreen";
import { PublicNewsScreen } from "../public/PublicNewsScreen";
import { PublicContactScreen } from "../public/PublicContactScreen";
import { QuoteRequestScreen } from "../public/QuoteRequestScreen";
import { listPublicNews, submitQuoteRequest } from "../../api/public.api";
import { checkServiceArea } from "../../config/serviceArea";

// Accueil public (sans compte) : onglets Accueil, Services, Actualités,
// Contact, et demande de devis.

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
  it("présente Deep Clean et mène au devis ou à l'espace équipe, sans inscription", async () => {
    renderScreen(<PublicHomeScreen />);
    await waitFor(() => expect(listPublicNews).toHaveBeenCalled());
    expect(screen.getByText("Le propre, en profondeur.")).toBeTruthy();
    expect(screen.getByText("Une entreprise de Manosque")).toBeTruthy();
    expect(screen.getByText("Conciergerie")).toBeTruthy();
    expect(screen.queryByText(/inscri|créer un compte/i)).toBeNull();
    // Aucune actualité publiée : pas de section vide.
    expect(screen.queryByText("Les nouvelles de Deep Clean")).toBeNull();

    fireEvent.press(screen.getByText("Demander un devis gratuit"));
    expect(mockNavigate).toHaveBeenCalledWith("QuoteRequest");
    fireEvent.press(screen.getAllByText("Espace équipe")[0]!);
    expect(mockNavigate).toHaveBeenCalledWith("Login", undefined, { pop: true });
    fireEvent.press(screen.getByText("Mentions légales"));
    expect(mockNavigate).toHaveBeenCalledWith("Legal");
  });

  it("affiche les actualités publiées par la RH ou la direction", async () => {
    jest.mocked(listPublicNews).mockResolvedValue({ items: [NEWS], total: 1 });
    renderScreen(<PublicHomeScreen />);
    expect(await screen.findByText("Nous recrutons à Manosque")).toBeTruthy();
    fireEvent.press(screen.getByText("Nous recrutons à Manosque"));
    expect(mockNavigate).toHaveBeenCalledWith("PublicNewsDetail", { newsId: NEWS.id });
    fireEvent.press(screen.getByText("Tout voir"));
    expect(mockNavigate).toHaveBeenCalledWith("PublicTabs", { screen: "PublicNews" });
  });
});

describe("Services", () => {
  it("détaille les prestations et ouvre un devis déjà présélectionné", () => {
    renderScreen(<PublicServicesScreen />);
    expect(screen.getByText("Plans de travail & crédence")).toBeTruthy();
    fireEvent.press(screen.getByText("Chambre"));
    expect(screen.getByText("Dépoussiérage complet")).toBeTruthy();
    // « Matelas » : la carte de soin spécifique (avant le détail pièce par pièce).
    fireEvent.press(screen.getAllByText("Matelas")[0]!);
    expect(mockNavigate).toHaveBeenCalledWith("QuoteRequest", { service: "Matelas" });
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

describe("Contact et zone d'intervention", () => {
  it("répond tout de suite à « Intervenez-vous chez moi ? »", () => {
    renderScreen(<PublicContactScreen />);
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

  it("reprend la prestation choisie dans l'onglet Services", async () => {
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
