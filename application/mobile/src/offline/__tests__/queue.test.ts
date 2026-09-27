import AsyncStorage from "@react-native-async-storage/async-storage";
import { bumpAttempts, clearQueue, enqueueAction, getQueue, hasPendingActionOfType, removeFromQueue } from "../queue";

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("offline queue", () => {
  it("commence vide", async () => {
    expect(await getQueue()).toEqual([]);
  });

  it("ajoute une action avec un id unique et zéro tentative", async () => {
    const action = await enqueueAction("REPORT_PROBLEM", { missionId: "m1", type: "ISSUE", description: "test" });
    expect(action.type).toBe("REPORT_PROBLEM");
    expect(action.attempts).toBe(0);
    expect(action.id).toBeTruthy();

    const queue = await getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe(action.id);
  });

  it("conserve l'ordre d'ajout (FIFO)", async () => {
    await enqueueAction("REPORT_PROBLEM", { missionId: "m1", type: "ISSUE", description: "premier" });
    await enqueueAction("REPORT_PROBLEM", { missionId: "m2", type: "ISSUE", description: "second" });
    const queue = await getQueue();
    expect(queue.map((a) => (a.payload as { description: string }).description)).toEqual(["premier", "second"]);
  });

  it("détecte une action en attente d'un type donné", async () => {
    expect(await hasPendingActionOfType("REPORT_PROBLEM")).toBe(false);
    await enqueueAction("REPORT_PROBLEM", { missionId: "m1", type: "ISSUE", description: "test" });
    expect(await hasPendingActionOfType("REPORT_PROBLEM")).toBe(true);
  });

  it("retire une action précise sans toucher aux autres", async () => {
    const a = await enqueueAction("REPORT_PROBLEM", { missionId: "m1", type: "ISSUE", description: "premier" });
    const b = await enqueueAction("REPORT_PROBLEM", { missionId: "m2", type: "ISSUE", description: "second" });
    await removeFromQueue(a.id);
    const queue = await getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe(b.id);
  });

  it("incrémente les tentatives d'une action précise", async () => {
    const a = await enqueueAction("REPORT_PROBLEM", { missionId: "m1", type: "ISSUE", description: "test" });
    await bumpAttempts(a.id);
    await bumpAttempts(a.id);
    const queue = await getQueue();
    expect(queue[0].attempts).toBe(2);
  });

  it("vide entièrement la file", async () => {
    await enqueueAction("REPORT_PROBLEM", { missionId: "m1", type: "ISSUE", description: "premier" });
    await enqueueAction("REPORT_PROBLEM", { missionId: "m2", type: "ISSUE", description: "second" });
    await clearQueue();
    expect(await getQueue()).toEqual([]);
  });
});
