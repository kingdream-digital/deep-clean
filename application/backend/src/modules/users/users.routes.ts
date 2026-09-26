import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { hrSensitiveRateLimiter } from "../../middleware/rateLimit.middleware";
import { validate } from "../../middleware/validate.middleware";
import { uploadPhoto } from "../../middleware/upload.middleware";
import {
  createUserSchema,
  exportEmployeeDossierQuerySchema,
  listUsersQuerySchema,
  updateUserSchema,
  userIdParamSchema,
} from "./users.validation";
import * as usersController from "./users.controller";

export const usersRouter = Router();

// Création de compte : strictement RH / admin technique, jamais la direction
// (retour explicite du client : « tout sauf créer les comptes »).
const CREATE_ACCOUNTS = [Role.HR, Role.ADMIN];
// Gérer un compte déjà créé (modifier, activer, désactiver, réinitialiser
// l'accès) : la direction rejoint désormais la RH et l'admin technique sur
// ces actions — seule la création lui reste fermée (voir CREATE_ACCOUNTS).
const MODIFY_ACCOUNTS = [Role.HR, Role.DIRECTOR, Role.ADMIN];

usersRouter.use(authenticate());

// Création de compte réservée à la RH / admin technique — aucune inscription publique.
usersRouter.post(
  "/",
  hrSensitiveRateLimiter,
  requireRole(...CREATE_ACCOUNTS),
  validate(createUserSchema),
  usersController.createUserHandler
);

// Annuaire interne : tout compte authentifié peut consulter la liste des
// collègues pour les contacter. Les champs sensibles liés à la gestion du
// compte (actif/inactif, changement de mot de passe requis, dernière
// connexion) restent réservés à la RH/Direction/Admin — filtrés côté
// service selon le rôle de l'appelant, jamais côté mobile.
usersRouter.get("/", validate(listUsersQuerySchema), usersController.listUsersHandler);

// Photo de profil — toujours en libre-service (jamais géré par la RH), voir
// users.service.ts::setAvatar/removeAvatar. La consultation du fichier, elle,
// est ouverte à tout compte authentifié (même niveau qu'un champ d'annuaire).
usersRouter.put("/me/avatar", uploadPhoto, usersController.setAvatarHandler);
usersRouter.delete("/me/avatar", usersController.removeAvatarHandler);
usersRouter.get("/:id/avatar/file", validate(userIdParamSchema), usersController.getAvatarFileHandler);

usersRouter.get("/:id", validate(userIdParamSchema), usersController.getUserHandler);
// Dossier employé (pointages, absences, missions, journal) — réservé à la RH
// et aux rôles de gestion (voir DOSSIER_VIEW_ROLES dans users.service.ts) ;
// un employé qui consulterait son propre id reçoit 403, il a déjà ses propres
// écrans (Mon historique, Mes heures) pour ces mêmes données.
usersRouter.get("/:id/dossier", validate(userIdParamSchema), usersController.getEmployeeDossierHandler);
// Export PDF du dossier complet (pointages détaillés + absences) sur une
// période explicite (semaine ou mois, choisie côté client) — pour
// l'archivage RH et la préparation de la fiche de paye. Même restriction de
// rôle que la consultation du dossier (voir users.export.ts).
usersRouter.get(
  "/:id/dossier/export.pdf",
  validate(exportEmployeeDossierQuerySchema),
  usersController.exportEmployeeDossierPdfHandler
);

usersRouter.patch(
  "/:id",
  requireRole(...MODIFY_ACCOUNTS),
  validate(updateUserSchema),
  usersController.updateUserHandler
);

usersRouter.post(
  "/:id/activate",
  hrSensitiveRateLimiter,
  requireRole(...MODIFY_ACCOUNTS),
  validate(userIdParamSchema),
  usersController.activateUserHandler
);
usersRouter.post(
  "/:id/deactivate",
  hrSensitiveRateLimiter,
  requireRole(...MODIFY_ACCOUNTS),
  validate(userIdParamSchema),
  usersController.deactivateUserHandler
);
usersRouter.post(
  "/:id/reset-access",
  hrSensitiveRateLimiter,
  requireRole(...MODIFY_ACCOUNTS),
  validate(userIdParamSchema),
  usersController.resetUserAccessHandler
);
