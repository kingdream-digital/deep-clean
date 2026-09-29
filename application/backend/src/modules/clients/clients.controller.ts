import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import * as clientsService from "./clients.service";

function actorOf(req: Request) {
  return { userId: req.auth!.userId, role: req.auth!.role };
}

export const createClientHandler = asyncHandler(async (req: Request, res: Response) => {
  const client = await clientsService.createClient(actorOf(req), req.body);
  res.status(201).json({ client });
});

export const listClientsHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await clientsService.listClients(actorOf(req), req.query as never);
  res.status(200).json(result);
});

export const getClientHandler = asyncHandler(async (req: Request, res: Response) => {
  const client = await clientsService.getClientById(actorOf(req), req.params.id as string);
  res.status(200).json({ client });
});

export const updateClientHandler = asyncHandler(async (req: Request, res: Response) => {
  const client = await clientsService.updateClient(actorOf(req), req.params.id as string, req.body);
  res.status(200).json({ client });
});
