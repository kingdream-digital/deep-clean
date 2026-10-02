import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import * as leaveService from "./leave.service";

function actorOf(req: Request) {
  return { userId: req.auth!.userId, role: req.auth!.role };
}

export const getLeaveBalanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const year = (req.query.year as number | undefined) ?? new Date().getFullYear();
  const balance = await leaveService.getLeaveBalance(actorOf(req), req.params.userId as string, year);
  res.status(200).json({ balance });
});

export const listLeaveTransactionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const items = await leaveService.listLeaveTransactions(actorOf(req), req.params.userId as string, req.query as never);
  res.status(200).json({ items });
});

export const createLeaveAdjustmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const transaction = await leaveService.createLeaveAdjustment(actorOf(req), req.params.userId as string, req.body);
  res.status(201).json({ transaction });
});

export const listAccrualsHandler = asyncHandler(async (req: Request, res: Response) => {
  const items = await leaveService.listAccruals(actorOf(req), req.query as never);
  res.status(200).json({ items });
});

export const validateAccrualHandler = asyncHandler(async (req: Request, res: Response) => {
  const accrual = await leaveService.validateAccrual(actorOf(req), req.params.id as string, req.body);
  res.status(200).json({ accrual });
});

export const validateMonthHandler = asyncHandler(async (req: Request, res: Response) => {
  const count = await leaveService.validateMonth(actorOf(req), req.body.month);
  res.status(200).json({ validated: count });
});
