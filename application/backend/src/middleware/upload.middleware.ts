import multer from "multer";
import { env } from "../config/env";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const ALLOWED_DOCUMENT_MIME_TYPES = new Set(["application/pdf"]);

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

// Messagerie : un message peut porter une photo OU un document PDF (retour
// explicite du client : "un partage de document"), d'où deux champs possibles
// sur une même requête là où les autres écrans n'en attendent qu'un.
// `limits.fileSize` vaut ici le plafond du plus gros des deux ; le plafond
// propre aux photos reste appliqué sur le buffer reçu (messages.service.ts),
// multer ne sachant pas appliquer une limite différente par champ.
export const uploadMessageAttachment = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Math.max(env.MAX_UPLOAD_SIZE_MB, env.MAX_DOCUMENT_UPLOAD_SIZE_MB) * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = file.fieldname === "document" ? ALLOWED_DOCUMENT_MIME_TYPES : ALLOWED_MIME_TYPES;
    if (!allowed.has(file.mimetype)) {
      cb(new Error("UNSUPPORTED_FILE_TYPE"));
      return;
    }
    cb(null, true);
  },
}).fields([
  { name: "photo", maxCount: 1 },
  { name: "document", maxCount: 1 },
]);

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
