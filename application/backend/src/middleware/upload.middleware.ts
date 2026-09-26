import multer from "multer";
import { env } from "../config/env";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

// Stockage en mémoire : le buffer est retraité (redimensionné/compressé) par
// utils/storage.ts avant d'être écrit sur disque — jamais le fichier brut du client.
export const uploadPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error("UNSUPPORTED_FILE_TYPE"));
      return;
    }
    cb(null, true);
  },
}).single("photo");

const ALLOWED_DOCUMENT_MIME_TYPES = new Set(["application/pdf"]);

// Même principe que `uploadPhoto` : mémoire tampon uniquement, le buffer est
// revérifié (signature réelle du fichier, pas seulement le Content-Type
// déclaré) par utils/storage.ts::storePdfDocument avant toute écriture disque.
export const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_DOCUMENT_UPLOAD_SIZE_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_DOCUMENT_MIME_TYPES.has(file.mimetype)) {
      cb(new Error("UNSUPPORTED_FILE_TYPE"));
      return;
    }
    cb(null, true);
  },
}).single("document");
