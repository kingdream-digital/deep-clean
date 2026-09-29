import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import * as absencesService from "./absences.service";

function actorOf(req: Request) {
  return { userId: req.auth!.userId, role: req.auth!.role };
}

export const createAbsenceHandler = asyncHandler(async (req: Request, res: Response) => {
  const absence = await absencesService.createAbsence(actorOf(req), req.body);
  res.status(201).json({ absence });
});

export const listAbsencesHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await absencesService.listAbsences(actorOf(req), req.query as never);
  res.status(200).json(result);
});

export const getAbsenceHandler = asyncHandler(async (req: Request, res: Response) => {
  const absence = await absencesService.getAbsenceById(actorOf(req), req.params.id as string);
  res.status(200).json({ absence });
});

export const decideAbsenceHandler = asyncHandler(async (req: Request, res: Response) => {
  const absence = await absencesService.decideAbsence(actorOf(req), req.params.id as string, req.body);
  res.status(200).json({ absence });
});

export const cancelAbsenceHandler = asyncHandler(async (req: Request, res: Response) => {
  const absence = await absencesService.cancelAbsence(actorOf(req), req.params.id as string);
  res.status(200).json({ absence });
});
