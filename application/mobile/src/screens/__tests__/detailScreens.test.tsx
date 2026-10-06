import React from "react";
import { render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../theme/ThemeProvider";
import { UserDetailScreen } from "../users/UserDetailScreen";
import { ProblemDetailScreen } from "../missions/ProblemDetailScreen";
import { getEmployeeDossier, getUser } from "../../api/users.api";
import { getProblem } from "../../api/problems.api";

// Fiche d'un salarié et détail d'un signalement : un hook appelé après le
// `return` de l'état « chargement » faisait planter ces deux écrans dès la
// fin du chargement (« Rendered more hooks than during the previous
// render »). Ces tests ouvrent chaque écran jusqu'à l'affichage des données.

let mockRouteParams: Record<string, unknown> = {};

jest.mock("@react-navigation/native", () => {
  const actual = jest.requireActual("@react-navigation/native");
  const { useEffect } = jest.requireActual("react");
  return {
    ...actual,
    useRoute: () => ({ key: "test", name: "Test", params: mockRouteParams }),
    useNavigation: () => ({
      navigate: jest.fn(),
      goBack: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      getParent: jest.fn(),
    }),
    useIsFocused: () => true,
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});

jest.mock("../../auth/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "rh-1",
      username: "mdupont",
      email: null,
      firstName: "Marie",
      lastName: "Dupont",
      role: "HR",
      mustChangePassword: false,
      hasAvatar: false,
    },
  }),
}));

jest.mock("../../api/users.api");
jest.mock("../../api/problems.api");

function renderScreen(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
    >
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>
  );
}

describe("Écrans de détail", () => {
  it("affiche la fiche d'un salarié une fois chargée", async () => {
    mockRouteParams = { userId: "u-1" };
    jest.mocked(getUser).mockResolvedValue({
      id: "u-1",
      username: "lpetit",
      email: null,
      firstName: "Lucas",
      lastName: "Petit",
      role: "EMPLOYEE",
      isActive: true,
      hasAvatar: false,
    });
    jest.mocked(getEmployeeDossier).mockRejectedValue(new Error("pas de dossier"));

    renderScreen(<UserDetailScreen />);

    expect(await screen.findByText(/Lucas Petit/)).toBeTruthy();
  });

  it("affiche le détail d'un signalement une fois chargé", async () => {
    mockRouteParams = { problemId: "p-1" };
    jest.mocked(getProblem).mockResolvedValue({
      id: "p-1",
      type: "ISSUE",
      description: "Tache de café sur la moquette de la salle de réunion",
      status: "NEW",
      createdAt: "2026-10-08T08:00:00.000Z",
      updatedAt: "2026-10-08T08:00:00.000Z",
      site: { id: "s-1", name: "Bureaux TechCorp", managerId: null },
      mission: null,
      reportedBy: { id: "u-1", firstName: "Lucas", lastName: "Petit", role: "EMPLOYEE" },
      photos: [],
      comments: [],
    });

    renderScreen(<ProblemDetailScreen />);

    expect(await screen.findByText("Tache de café sur la moquette de la salle de réunion")).toBeTruthy();
  });
});
