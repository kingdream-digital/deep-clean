import { Role } from "@prisma/client";
import type { Express } from "express";
import request from "supertest";
import sharp from "sharp";
import { prisma } from "../src/db/prisma";
import { hashPassword } from "../src/utils/password";

export const TEST_PASSWORD = "CorrectHorse9!Battery";

export async function resetDatabase() {
  // Ordre inverse des dépendances pour respecter les contraintes de clé étrangère.
  await prisma.activityLog.deleteMany();
  // Explicite (comme mission/problem plus bas) plutôt que de compter sur la
  // cascade de `userId` : `createdById` est en onDelete: Restrict (traçabilité
  // de qui a enregistré la transaction), qui bloquerait sinon la suppression
  // groupée des comptes ci-dessous.
  await prisma.leaveTransaction.deleteMany();
  await prisma.absence.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.validation.deleteMany();
  await prisma.photo.deleteMany();
  await prisma.problemComment.deleteMany();
  await prisma.problem.deleteMany();
  await prisma.missionAssignment.deleteMany();
  await prisma.mission.deleteMany();
  await prisma.cleaningStandard.deleteMany();
  await prisma.siteMember.deleteMany();
  await prisma.site.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversationParticipant.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.pushToken.deleteMany();
  await prisma.session.deleteMany();
  // Module commercial : `createdById` est aussi en onDelete: Restrict sur
  // Prospect/Client/Quote/Invoice (même logique de traçabilité que
  // leaveTransaction/mission ci-dessus) — Invoice et Quote avant Client
  // (Invoice.clientId/Quote.clientId le référencent) ; Client avant Prospect
  // (Client.prospectId le référence). `quote.deleteMany()`/`invoice.deleteMany()`
  // cascadent automatiquement leurs lignes/historique (onDelete: Cascade),
  // inutile de les vider séparément.
  await prisma.invoice.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.client.deleteMany();
  await prisma.prospect.deleteMany();
  await prisma.user.deleteMany();
}

export async function createTestUser(
  overrides: Partial<{
    email: string;
    username: string;
    role: Role;
    isActive: boolean;
    hireDate: Date;
    leaveAccrualRate: number;
    leaveAccrualCap: number;
  }> = {}
) {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  return prisma.user.create({
    data: {
      // Identifiant de connexion — jamais dérivé de l'email dans les tests non
      // plus (même règle que la production, voir utils/username.ts) : un
      // suffixe aléatoire suffit ici, la lisibilité du nom vient de `email`
      // (toujours passé explicitement par les tests pour identifier un compte).
      username: overrides.username ?? `testuser${Date.now()}${Math.floor(Math.random() * 1_000_000)}`,
      email: overrides.email ?? `user-${Date.now()}-${Math.random().toString(36).slice(2)}@deepclean.test`,
      firstName: "Test",
      lastName: "User",
      role: overrides.role ?? Role.EMPLOYEE,
      isActive: overrides.isActive ?? true,
      mustChangePassword: false,
      passwordHash,
      ...(overrides.hireDate ? { hireDate: overrides.hireDate } : {}),
      ...(overrides.leaveAccrualRate !== undefined ? { leaveAccrualRate: overrides.leaveAccrualRate } : {}),
      ...(overrides.leaveAccrualCap !== undefined ? { leaveAccrualCap: overrides.leaveAccrualCap } : {}),
    },
  });
}

// Pointage (clock-in/clock-out) exige désormais une photo + une position
// (justificatif anti-fraude, voir timesheets.routes.ts) — générée à la volée
// avec `sharp` (déjà une dépendance de production, storage.ts) plutôt qu'un
// base64 codé en dur : évite tout risque de fixture corrompue que
// `sharp()` rejetterait côté serveur (storage.ts::storeImage revérifie les
// octets réels du fichier, pas seulement le Content-Type déclaré).
export async function tinyTestPhoto(): Promise<Buffer> {
  return sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .jpeg()
    .toBuffer();
}

// Noms distincts de "clockIn"/"clockOut" tout court : plusieurs tests de
// pointage différé déclarent déjà des variables locales `const clockIn = ...`
// / `const clockOut = ...` (des dates, pas des appels API) — éviter toute confusion.
export async function clockInViaApi(app: Express, token: string) {
  return request(app)
    .post("/api/v1/time-entries/clock-in")
    .set("Authorization", `Bearer ${token}`)
    .field("latitude", "48.8566")
    .field("longitude", "2.3522")
    .attach("photo", await tinyTestPhoto(), { filename: "proof.jpg", contentType: "image/jpeg" });
}

export async function clockOutViaApi(app: Express, token: string) {
  return request(app)
    .post("/api/v1/time-entries/clock-out")
    .set("Authorization", `Bearer ${token}`)
    .field("latitude", "48.8566")
    .field("longitude", "2.3522")
    .attach("photo", await tinyTestPhoto(), { filename: "proof.jpg", contentType: "image/jpeg" });
}

export async function createTestSite(
  overrides: Partial<{ name: string; managerId: string | null; supervisorId: string | null }> = {}
) {
  return prisma.site.create({
    data: {
      name: overrides.name ?? `Chantier ${Date.now()}-${Math.random().toString(36).slice(2)}`,
      address: "1 rue de Test, 75000 Paris",
      managerId: overrides.managerId ?? null,
      supervisorId: overrides.supervisorId ?? null,
    },
  });
}
