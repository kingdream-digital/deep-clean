import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import * as prospectsService from "./prospects.service";

function actorOf(req: Request) {
  return { userId: req.auth!.userId, role: req.auth!.role };
}

export const createProspectHandler = asyncHandler(async (req: Request, res: Response) => {
  const prospect = await prospectsService.createProspect(actorOf(req), req.body);
  res.status(201).json({ prospect });
});

export const listProspectsHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await prospectsService.listProspects(actorOf(req), req.query as never);
  res.status(200).json(result);
});

export const getProspectHandler = asyncHandler(async (req: Request, res: Response) => {
  const prospect = await prospectsService.getProspectById(actorOf(req), req.params.id as string);
  res.status(200).json({ prospect });
});

export const updateProspectHandler = asyncHandler(async (req: Request, res: Response) => {
  const prospect = await prospectsService.updateProspect(actorOf(req), req.params.id as string, req.body);
  res.status(200).json({ prospect });
});

export const convertProspectHandler = asyncHandler(async (req: Request, res: Response) => {
  const client = await prospectsService.convertProspectToClient(actorOf(req), req.params.id as string);
  res.status(201).json({ client });
});
