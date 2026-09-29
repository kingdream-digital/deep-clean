import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { createLeaveAdjustmentSchema, leaveBalanceQuerySchema, leaveTransactionsQuerySchema } from "./leave.validation";
import * as leaveController from "./leave.controller";

export const leaveRouter = Router();

// Pas de restriction de rôle au niveau des routes : la portée exacte (soi-même,
// son équipe pour un chef d'équipe, ou globale RH/direction/superviseur/admin)
// est entièrement vérifiée dans leave.service.ts, même pattern que absences.
leaveRouter.use(authenticate());

leaveRouter.get("/:userId/balance", validate(leaveBalanceQuerySchema), leaveController.getLeaveBalanceHandler);
leaveRouter.get("/:userId/transactions", validate(leaveTransactionsQuerySchema), leaveController.listLeaveTransactionsHandler);
leaveRouter.post("/:userId/adjustments", validate(createLeaveAdjustmentSchema), leaveController.createLeaveAdjustmentHandler);
