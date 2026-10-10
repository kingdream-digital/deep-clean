import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../theme/ThemeProvider";
import { CommercialHomeScreen } from "../commercial/CommercialHomeScreen";
import { EinvoicingScreen } from "../commercial/EinvoicingScreen";
import { getCommercialDashboard } from "../../api/commercialDashboard.api";
import type { CommercialDashboard } from "../../api/commercialDashboard.api";
import { getEinvoicingOverview, listEinvoices, testEinvoicingConnection } from "../../api/einvoicing.api";
import type { EinvoicingOverview } from "../../api/einvoicing.api";

// Espace commercial refondu : actions rapides, cartes Devis/Factures et
// espace Super PDP — visibles selon le rôle, avec l'état réel du serveur.

const mockNavigate = jest.fn();
let mockRole = "HR";

jest.mock("@react-navigation/native", () => {
  const actual = jest.requireActual("@react-navigation/native");
  const { useEffect } = jest.requireActual("react");
  return {
    ...actual,
    useRoute: () => ({ key: "test", name: "Test", params: {} }),
    useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()), getParent: jest.fn() }),
    useIsFocused: () => true,
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});

jest.mock("../../auth/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u-1", username: "x", email: null, firstName: "Marie", lastName: "Dupont", role: mockRole, mustChangePassword: false, hasAvatar: false },
  }),
}));

jest.mock("../../api/commercialDashboard.api");
jest.mock("../../api/einvoicing.api", () => ({
  ...jest.requireActual("../../api/einvoicing.api"),
  getEinvoicingOverview: jest.fn(),
  listEinvoices: jest.fn(),
  syncEinvoices: jest.fn(),
  testEinvoicingConnection: jest.fn(),
}));

const dashboard = (withInvoicing: boolean): CommercialDashboard => ({
  commercial: { activeProspects: 4, quotesInProgress: 6, quotesToFollowUp: 2, quotesAccepted: 3, quotesRejected: 1 },
  sites: { activeSites: 5, period: "2026-10", plannedVisits: 10, scheduledVisits: 8, completedVisits: 5, remainingVisits: 5, toScheduleVisits: 2, sitesNeedingAttention: [] },
  invoicing: withInvoicing ? { toPrepare: 2, validated: 1, sent: 4, paid: 7, projectedMonthlyRevenueHt: 12500 } : null,
});

const overview = (configured: boolean): EinvoicingOverview => ({
  connection: { configured, host: "api.superpdp.tech" },
  company: { name: "Deep Clean", missing: [] },
  counts: { toSend: 3, inProgress: 1, attention: 0, done: 5 },
  lastSyncAt: null,
  deadlines: { reception: "2026-09-01", emission: "2027-09-01" },
});

function renderScreen(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = "HR";
});

describe("Écran Commercial", () => {
  it("RH : actions rapides, devis, factures et accès à l'espace Super PDP", async () => {
    jest.mocked(getCommercialDashboard).mockResolvedValue(dashboard(true));
    jest.mocked(getEinvoicingOverview).mockResolvedValue(overview(true));

    renderScreen(<CommercialHomeScreen />);

    expect(await screen.findByText("2 devis à relancer")).toBeTruthy();
    expect(screen.getByText("Taux d'acceptation", { exact: false })).toBeTruthy();
    expect(screen.getByText("à préparer ou envoyer")).toBeTruthy();
    expect(await screen.findByText("Connectée")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Nouvelle facture"));
    expect(mockNavigate).toHaveBeenCalledWith("InvoiceForm", undefined);
    fireEvent.press(screen.getByLabelText("Ouvrir l'espace Super PDP"));
    expect(mockNavigate).toHaveBeenCalledWith("Einvoicing");
  });

  it("Superviseur : ni factures ni Super PDP", async () => {
    mockRole = "SUPERVISOR";
    jest.mocked(getCommercialDashboard).mockResolvedValue(dashboard(false));

    renderScreen(<CommercialHomeScreen />);

    expect(await screen.findByText("Mes devis")).toBeTruthy();
    expect(screen.queryByLabelText("Nouvelle facture")).toBeNull();
    expect(screen.queryByText("Facture électronique")).toBeNull();
    expect(getEinvoicingOverview).not.toHaveBeenCalled();
  });
});

describe("Espace Super PDP", () => {
  it("affiche les factures à transmettre et ce qui leur manque", async () => {
    jest.mocked(getEinvoicingOverview).mockResolvedValue(overview(true));
    jest.mocked(listEinvoices).mockResolvedValue({
      total: 1,
      items: [
        {
          id: "f-1",
          invoiceNumber: "FAC-2026-0012",
          status: "VALIDATED",
          issueDate: "2026-10-05T08:00:00.000Z",
          totalTtc: 1332,
          clientName: "Hôtel Belle Vue",
          pdpStatus: null,
          pdpStatusLabel: null,
          pdpError: null,
          pdpSentAt: null,
          pdpUpdatedAt: null,
          blockers: ["SIREN ou SIRET du client (fiche client)"],
        },
      ],
    });

    renderScreen(<EinvoicingScreen />);

    expect(await screen.findByText("Hôtel Belle Vue")).toBeTruthy();
    expect(screen.getByText("À compléter : SIREN ou SIRET du client (fiche client)")).toBeTruthy();
    fireEvent.press(screen.getByText("Hôtel Belle Vue"));
    expect(mockNavigate).toHaveBeenCalledWith("InvoiceDetail", { invoiceId: "f-1" });
  });

  it("teste la connexion et affiche le résultat", async () => {
    jest.mocked(getEinvoicingOverview).mockResolvedValue(overview(true));
    jest.mocked(listEinvoices).mockResolvedValue({ total: 0, items: [] });
    jest.mocked(testEinvoicingConnection).mockResolvedValue({ ok: true, host: "api.superpdp.tech", checkedAt: "2026-10-10T08:00:00.000Z" });

    renderScreen(<EinvoicingScreen />);

    fireEvent.press(await screen.findByText("Tester la connexion"));
    expect(await screen.findByText("Connexion réussie à api.superpdp.tech.")).toBeTruthy();
  });

  it("non activée : explique la mise en service sans bouton trompeur", async () => {
    jest.mocked(getEinvoicingOverview).mockResolvedValue(overview(false));
    jest.mocked(listEinvoices).mockResolvedValue({ total: 0, items: [] });

    renderScreen(<EinvoicingScreen />);

    expect(await screen.findByText("Non activée")).toBeTruthy();
    expect(screen.getByText("Site Super PDP")).toBeTruthy();
    expect(screen.getByText(/SUPERPDP_CLIENT_ID/)).toBeTruthy();
  });
});
