import React from "react";
import { Text } from "react-native";
import { render, waitFor } from "@testing-library/react-native";

// Démarrage de l'application avec une session « Rester connecté » : seule une
// réponse de refus du serveur ferme la session ; sans réseau, la session, le
// jeton persistant et les actions en attente sont conservés (bug corrigé :
// toute erreur effaçait tout au démarrage).

const mockStorage = {
  clearToken: jest.fn().mockResolvedValue(undefined),
  clearUser: jest.fn().mockResolvedValue(undefined),
  sessionUser: null as unknown,
};
const mockOffline = {
  clearQueue: jest.fn().mockResolvedValue(undefined),
  dropUnowned: jest.fn().mockResolvedValue(undefined),
  clearCache: jest.fn().mockResolvedValue(undefined),
};
const mockRefresh = jest.fn();

jest.mock("../secureStorage", () => ({
  readPersistedRefreshToken: jest.fn().mockResolvedValue("persisted-refresh-token"),
  clearPersistedRefreshToken: (...a: unknown[]) => mockStorage.clearToken(...a),
  clearSessionUser: (...a: unknown[]) => mockStorage.clearUser(...a),
  readSessionUser: jest.fn(() => Promise.resolve(mockStorage.sessionUser)),
  persistSessionUser: jest.fn().mockResolvedValue(undefined),
  isBiometricLoginEnabled: jest.fn().mockResolvedValue(false),
  setBiometricLoginEnabled: jest.fn().mockResolvedValue(undefined),
  persistRefreshToken: jest.fn().mockResolvedValue(undefined),
  persistLastUsername: jest.fn().mockResolvedValue(undefined),
  readLastUsername: jest.fn().mockResolvedValue(null),
}));
jest.mock("../biometrics", () => ({ getAvailableBiometricKind: jest.fn().mockResolvedValue(null), authenticateWithBiometrics: jest.fn() }));
jest.mock("../../offline/cache", () => ({ clearCache: (...a: unknown[]) => mockOffline.clearCache(...a) }));
jest.mock("../../offline/queue", () => ({
  clearQueue: (...a: unknown[]) => mockOffline.clearQueue(...a),
  dropUnownedActions: (...a: unknown[]) => mockOffline.dropUnowned(...a),
  setQueueOwner: jest.fn(),
}));
jest.mock("../../offline/syncManager", () => ({ startSyncManager: jest.fn(), stopSyncManager: jest.fn() }));
jest.mock("../../notifications/push", () => ({ registerForPushNotificationsAsync: jest.fn(), unregisterCurrentPushToken: jest.fn() }));
jest.mock("../../sync/liveSync", () => ({ subscribeToDataChanges: jest.fn(() => () => undefined) }));
jest.mock("@react-native-community/netinfo", () => ({ addEventListener: jest.fn(() => () => undefined) }));
jest.mock("../../api/auth.api", () => ({
  refreshSession: (...a: unknown[]) => mockRefresh(...a),
  login: jest.fn(),
  logout: jest.fn(),
  fetchCurrentUser: jest.fn(),
  changePassword: jest.fn(),
}));

import { AxiosError, AxiosHeaders } from "axios";
import { AuthProvider, useAuth } from "../AuthContext";

const USER = {
  id: "u-1",
  username: "mdupont",
  email: null,
  firstName: "Marie",
  lastName: "Dupont",
  role: "EMPLOYEE",
  mustChangePassword: false,
  hasAvatar: false,
};

function httpError(status: number, message?: string) {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError("Request failed", "ERR_BAD_RESPONSE", config as never, {}, {
    status,
    statusText: "",
    headers: {},
    config: config as never,
    data: { error: { message } },
  });
}

function Probe() {
  const { status, sessionExpired, offline, user, endMessage } = useAuth();
  return <Text testID="probe">{JSON.stringify({ status, sessionExpired, offline, userId: user?.id ?? null, endMessage: endMessage ?? null })}</Text>;
}

async function boot() {
  const screen = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
  await waitFor(() => expect(JSON.parse(screen.getByTestId("probe").props.children).status).not.toBe("booting"));
  return JSON.parse(screen.getByTestId("probe").props.children) as {
    status: string;
    sessionExpired: boolean;
    offline: boolean;
    userId: string | null;
    endMessage: string | null;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStorage.sessionUser = null;
});

describe("démarrage avec une session persistée", () => {
  it("sans réseau, ouvre l'application hors ligne avec le profil connu et ne perd rien", async () => {
    mockStorage.sessionUser = USER;
    mockRefresh.mockRejectedValue(new AxiosError("Network Error", "ERR_NETWORK"));
    const state = await boot();
    expect(state).toMatchObject({ status: "authenticated", offline: true, userId: "u-1" });
    expect(mockStorage.clearToken).not.toHaveBeenCalled();
    expect(mockOffline.clearQueue).not.toHaveBeenCalled();
    expect(mockOffline.clearCache).not.toHaveBeenCalled();
  });

  it("sans réseau ni profil connu, explique la situation sans effacer la session", async () => {
    mockRefresh.mockRejectedValue(new AxiosError("Network Error", "ERR_NETWORK"));
    const state = await boot();
    expect(state.status).toBe("unauthenticated");
    expect(state.offline).toBe(true);
    expect(state.endMessage).toMatch(/Pas de connexion internet/);
    expect(mockStorage.clearToken).not.toHaveBeenCalled();
    expect(mockOffline.clearQueue).not.toHaveBeenCalled();
  });

  it("serveur indisponible (503) : la session est gardée", async () => {
    mockStorage.sessionUser = USER;
    mockRefresh.mockRejectedValue(httpError(503));
    const state = await boot();
    expect(state).toMatchObject({ status: "authenticated", offline: true });
    expect(mockStorage.clearToken).not.toHaveBeenCalled();
  });

  it("session refusée (401) : retour à la connexion « session expirée », actions de l'utilisateur conservées", async () => {
    mockStorage.sessionUser = USER;
    mockRefresh.mockRejectedValue(httpError(401));
    const state = await boot();
    expect(state).toMatchObject({ status: "unauthenticated", sessionExpired: true, offline: false });
    expect(mockStorage.clearToken).toHaveBeenCalled();
    expect(mockStorage.clearUser).toHaveBeenCalled();
    expect(mockOffline.clearQueue).not.toHaveBeenCalled();
    expect(mockOffline.dropUnowned).toHaveBeenCalled();
  });

  it("compte désactivé (403) : message de la RH affiché et tout est effacé", async () => {
    mockRefresh.mockRejectedValue(httpError(403, "Ce compte est désactivé. Contactez la RH."));
    const state = await boot();
    expect(state).toMatchObject({ status: "unauthenticated", sessionExpired: false, endMessage: "Ce compte est désactivé. Contactez la RH." });
    expect(mockStorage.clearToken).toHaveBeenCalled();
    expect(mockOffline.clearQueue).toHaveBeenCalled();
  });

  it("session valide : connecté normalement", async () => {
    mockRefresh.mockResolvedValue({ accessToken: "a", refreshToken: "r", user: USER });
    const state = await boot();
    expect(state).toMatchObject({ status: "authenticated", offline: false, userId: "u-1" });
  });
});
