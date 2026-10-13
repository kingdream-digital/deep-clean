import { Router, Request, Response } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { ACCOUNTING_ROLES, buildPayrollPack, getAccountingOverview } from "./accounting.service";

export const accountingRouter = Router();

accountingRouter.use(authenticate(), requireRole(...ACCOUNTING_ROLES));

const monthQuery = { query: z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Format attendu : AAAA-MM") }) };

function actorOf(req: Request) {
  return { userId: req.auth!.userId, role: req.auth!.role };
}

accountingRouter.get(
  "/overview",
  validate(monthQuery),
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({ overview: await getAccountingOverview(actorOf(req), req.query.month as string) });
  })
);

// Dossier de paie du mois (Excel) — synthèse par salarié, absences, congés.
accountingRouter.get(
  "/payroll-pack.xlsx",
  validate(monthQuery),
  asyncHandler(async (req: Request, res: Response) => {
    const month = req.query.month as string;
    const buffer = await buildPayrollPack(actorOf(req), month);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="dossier-paie-${month}.xlsx"`);
    res.status(200).send(buffer);
  })
);
