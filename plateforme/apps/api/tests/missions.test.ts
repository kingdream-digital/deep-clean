import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { api, createMember, createTestOrg, testApp, type Session, type TestOrg } from "./helpers.ts";
import { realtimeHub, type RealtimeEvent } from "../src/lib/realtime.ts";

let app: FastifyInstance;
let org: TestOrg;
let supervisor: Session;
let alice: Session;
let bruno: Session;
let chloe: Session;
let lead: Session;

beforeAll(async () => {
  app = await testApp();
  org = await createTestOrg(app, "plan");
  supervisor = await createMember(app, org, "SUPERVISOR", "Sam");
  alice = await createMember(app, org, "EMPLOYEE", "Alice");
  bruno = await createMember(app, org, "EMPLOYEE", "Bruno");
  chloe = await createMember(app, org, "EMPLOYEE", "Chloé");
  lead = await createMember(app, org, "TEAM_LEAD", "Léo");
});
afterAll(async () => {
  await realtimeHub.close();
  await app.close();
});

async function notificationsOf(session: Session): Promise<{ title: string; body: string }[]> {
  return (await api(app, session.token).get("/v1/notifications")).json().items;
}

describe("planning et notifications", () => {
  it("prévient en temps réel les seules personnes affectées", async () => {
    const received: RealtimeEvent[] = [];
    const unsubscribe = await realtimeHub.subscribe(alice.userId, (event) => received.push(event));
    const res = await api(app, supervisor.token).post("/v1/missions", {
      title: "Vitres — Agence Lumière",
      date: "2026-11-03",
      startTime: "07:30",
      endTime: "09:00",
      assigneeIds: [alice.userId, bruno.userId],
      teamLeadId: lead.userId,
      instructions: "Badge à récupérer à l'accueil.",
    });
    expect(res.statusCode).toBe(201);
    const mission = res.json();
    // Heure murale de Paris conservée, quel que soit le fuseau du serveur.
    expect(mission.startTime).toBe("07:30");
    expect(mission.startsAt).toBe("2026-11-03T06:30:00.000Z");

    await new Promise((resolve) => setTimeout(resolve, 150));
    await unsubscribe();
    expect(received.some((e) => e.type === "notification" && e.payload.title === "Une nouvelle mission vous a été attribuée.")).toBe(true);

    for (const person of [alice, bruno, lead]) {
      const items = await notificationsOf(person);
      expect(items[0]?.title).toBe("Une nouvelle mission vous a été attribuée.");
      expect(items[0]?.body).toContain("mardi 3 novembre, de 7 h 30 à 9 h");
    }
    expect(await notificationsOf(chloe)).toHaveLength(0);
  });

  it("envoie à chacun le message qui le concerne lors d'une modification", async () => {
    const mission = (
      await api(app, supervisor.token).post("/v1/missions", {
        title: "Bureaux Atlas",
        date: "2026-11-04",
        startTime: "18:00",
        endTime: "20:00",
        assigneeIds: [alice.userId, bruno.userId],
      })
    ).json();
    await api(app, alice.token).post("/v1/notifications/read", { all: true });
    await api(app, bruno.token).post("/v1/notifications/read", { all: true });

    const res = await api(app, supervisor.token).patch(`/v1/missions/${mission.id}`, {
      startTime: "19:00",
      endTime: "21:00",
      assigneeIds: [alice.userId, chloe.userId],
    });
    expect(res.statusCode).toBe(200);

    const unread = async (s: Session) =>
      (await api(app, s.token).get("/v1/notifications?unreadOnly=true")).json().items.map((n: { title: string }) => n.title);
    expect(await unread(alice)).toEqual(["L'horaire de votre mission a été modifié."]);
    expect(await unread(bruno)).toEqual(["Vous n'êtes plus affecté(e) à une mission."]);
    expect(await unread(chloe)).toContain("Une nouvelle mission vous a été attribuée.");
  });

  it("annonce l'annulation aux personnes affectées", async () => {
    const mission = (
      await api(app, supervisor.token).post("/v1/missions", {
        title: "Résidence Les Pins",
        date: "2026-11-05",
        startTime: "09:00",
        endTime: "11:00",
        assigneeIds: [bruno.userId],
      })
    ).json();
    const res = await api(app, supervisor.token).post(`/v1/missions/${mission.id}/cancel`, { reason: "Client absent" });
    expect(res.json().status).toBe("CANCELLED");
    expect((await notificationsOf(bruno))[0]?.title).toBe("Votre mission a été annulée.");
  });

  it("montre à l'employé son planning, et seulement le sien", async () => {
    const mine = await api(app, alice.token).get("/v1/missions?from=2026-11-01&to=2026-11-30");
    const titles = mine.json().map((m: { title: string }) => m.title);
    expect(titles).toContain("Vitres — Agence Lumière");
    expect(titles).not.toContain("Résidence Les Pins");
  });

  it("le chef d'équipe démarre, termine et valide sa mission", async () => {
    const mission = (
      await api(app, supervisor.token).post("/v1/missions", {
        title: "Cabinet Dentaire",
        date: "2026-11-06",
        startTime: "12:00",
        endTime: "13:00",
        assigneeIds: [alice.userId],
        teamLeadId: lead.userId,
      })
    ).json();
    expect((await api(app, lead.token).post(`/v1/missions/${mission.id}/start`)).json().status).toBe("IN_PROGRESS");
    expect((await api(app, lead.token).post(`/v1/missions/${mission.id}/finish`)).json().status).toBe("DONE");
    expect((await api(app, lead.token).post(`/v1/missions/${mission.id}/validate`)).json().status).toBe("VALIDATED");
  });

  it("une personne ne marque comme lues que ses propres notifications", async () => {
    const own = (await api(app, alice.token).get("/v1/notifications")).json().items[0];
    const res = await api(app, bruno.token).post("/v1/notifications/read", { ids: [own.id] });
    expect(res.json().updated).toBe(0);
  });
});
