import axios from "axios";
import { checkMaintenance, getMaintenance, reportMaintenance, subscribeToMaintenance } from "../maintenance";
import { formatUntil } from "../../components/MaintenanceScreen";

jest.mock("axios");
const mockedGet = axios.get as jest.Mock;

describe("Mode maintenance : état partagé", () => {
  it("s'active sur un 503 MAINTENANCE et se lève quand /status rouvre", async () => {
    const listener = jest.fn();
    const stop = subscribeToMaintenance(listener);
    reportMaintenance({ message: "Mise à jour", until: "14:30" });
    expect(getMaintenance()).toEqual({ message: "Mise à jour", until: "14:30" });
    expect(listener).toHaveBeenLastCalledWith({ message: "Mise à jour", until: "14:30" });

    mockedGet.mockResolvedValueOnce({ data: { maintenance: false, message: null, until: null } });
    expect(await checkMaintenance()).toBeNull();
    expect(listener).toHaveBeenLastCalledWith(null);
    stop();
  });

  it("garde l'état connu si le serveur est injoignable", async () => {
    reportMaintenance({ message: null, until: null });
    mockedGet.mockRejectedValueOnce(new Error("réseau"));
    expect(await checkMaintenance()).toEqual({ message: null, until: null });
  });
});

describe("Heure de retour prévue", () => {
  const now = new Date(2026, 9, 14, 10, 0);
  it("formate une heure du jour, demain ou une date", () => {
    expect(formatUntil("14:30", now)).toBe("Retour prévu vers 14 h 30");
    expect(formatUntil("9:00", now)).toBe("Retour prévu vers 9 h");
    expect(formatUntil(new Date(2026, 9, 15, 8, 0).toISOString(), now)).toBe("Retour prévu demain vers 8 h");
    expect(formatUntil(new Date(2026, 9, 20, 7, 15).toISOString(), now)).toBe("Retour prévu le 20 octobre vers 7 h 15");
    expect(formatUntil(null, now)).toBeNull();
    expect(formatUntil("n'importe quoi", now)).toBeNull();
  });
});
