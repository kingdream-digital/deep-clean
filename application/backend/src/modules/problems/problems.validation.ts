import { z } from "zod";
import { ProblemStatus, ProblemType } from "@prisma/client";

export const createProblemSchema = {
  body: z.object({
    missionId: z.string().uuid(),
    type: z.nativeEnum(ProblemType).optional().default(ProblemType.ISSUE),
    description: z.string().trim().min(1, "Merci de décrire le problème.").max(2000),
  }),
};

export const problemIdParamSchema = {
  params: z.object({ id: z.string().uuid() }),
};

export const listProblemsQuerySchema = {
  query: z.object({
    missionId: z.string().uuid().optional(),
    siteId: z.string().uuid().optional(),
    status: z.nativeEnum(ProblemStatus).optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
  }),
};

export const setProblemStatusSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    status: z.enum([ProblemStatus.IN_PROGRESS, ProblemStatus.RESOLVED, ProblemStatus.VALIDATED]),
  }),
};

export const addCommentSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    comment: z.string().trim().min(1).max(2000),
  }),
};

export const photoParamSchema = {
  params: z.object({ id: z.string().uuid(), photoId: z.string().uuid() }),
};
