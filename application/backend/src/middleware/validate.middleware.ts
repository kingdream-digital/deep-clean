import { NextFunction, Request, Response } from "express";
import { ZodError, ZodTypeAny } from "zod";
import { ApiError } from "../utils/ApiError";

interface ValidationSchemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

// Validation stricte côté serveur de toutes les entrées (body / params / query).
// Le frontend mobile peut valider pour l'ergonomie, mais ce middleware est la
// seule source de vérité : le serveur ne fait jamais confiance au client.
export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params;
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as typeof req.query;
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(ApiError.badRequest("Données invalides.", err.flatten().fieldErrors));
      }
      next(err);
    }
  };
}
