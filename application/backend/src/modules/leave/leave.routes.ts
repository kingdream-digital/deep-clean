import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import {
  createLeaveAdjustmentSchema,
  leaveBalanceQuerySchema,
  leaveTransactionsQuerySchema,
  listAccrualsQuerySchema,
  validateAccrualSchema,
  validateMonthSchema,
} from "./leave.validation";
import * as leaveController from "./leave.controller";

export const leaveRouter = Router();

// Pas de restriction de rôle au niveau des routes : la portée exacte (soi-même,
// son équipe pour un chef d'équipe, ou globale RH/direction/superviseur/admin)
// est entièrement vérifiée dans leave.service.ts, même pattern que absences.
leaveRouter.use(authenticate());

// AVANT "/:userId/..." : sinon « accruals » serait lu comme un identifiant.
leaveRouter.get("/accruals", validate(listAccrualsQuerySchema), leaveController.listAccrualsHandler);
leaveRouter.post("/accruals/validate-month", validate(validateMonthSchema), leaveController.validateMonthHandler);
leaveRouter.post("/accruals/:id/validate", validate(validateAccrualSchema), leaveController.validateAccrualHandler);
leaveRouter.get("/:userId/balance", validate(leaveBalanceQuerySchema), leaveController.getLeaveBalanceHandler);
leaveRouter.get("/:userId/transactions", validate(leaveTransactionsQuerySchema), leaveController.listLeaveTransactionsHandler);
leaveRouter.post("/:userId/adjustments", validate(createLeaveAdjustmentSchema), leaveController.createLeaveAdjustmentHandler);
