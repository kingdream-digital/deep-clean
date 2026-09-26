import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { env } from "../config/env";
import { ApiError } from "./ApiError";

// Stockage local des photos (fondation). Les fichiers ne sont JAMAIS servis par
// un accès statique public : ils ne sont accessibles qu'à travers une route
// authentifiée qui revérifie les permissions avant de les streamer (voir
// modules/problems). `storageKey` est une clé opaque, jamais un chemin dérivé
// d'une donnée utilisateur. À remplacer par un stockage objet (S3/GCS + URLs
// signées à courte durée de vie) pour un déploiement multi-instance.
const UPLOAD_ROOT = path.isAbsolute(env.UPLOAD_DIR) ? env.UPLOAD_DIR : path.join(process.cwd(), env.UPLOAD_DIR);

function ensureUploadDir(): void {
  if (!fs.existsSync(UPLOAD_ROOT)) {
    fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
  }
}

export interface StoredImage {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Compresse/redimensionne l'image (largeur max 1600px, JPEG qualité 82) avant
 * de l'écrire sur disque sous une clé aléatoire — répond aux exigences
 * "compression/optimisation des images" et "stockage sécurisé" du cahier des charges.
 */
export async function storeImage(buffer: Buffer): Promise<StoredImage> {
  ensureUploadDir();

  // Le fileFilter de multer (middleware/upload.middleware.ts) ne vérifie que
  // le Content-Type DÉCLARÉ par le client sur le champ multipart — une valeur
  // entièrement falsifiable, jamais le contenu réel du fichier. sharp() est
  // le seul point qui inspecte réellement les octets : constaté en
  // conditions réelles, un fichier non-image envoyé avec
  // "Content-Type: image/jpeg" passe le filtre puis fait planter sharp, ce
  // qui remontait en exception non interceptée (500 générique) au lieu d'un
  // rejet propre. Le fichier n'est jamais écrit sur disque dans ce cas
  // (l'échec a lieu avant fsPromises.writeFile), donc pas de risque de
  // fichier malveillant stocké — seulement une erreur mal formée à corriger.
  let processed: Buffer;
  try {
    processed = await sharp(buffer)
      .rotate() // applique l'orientation EXIF puis la retire (évite les photos pivotées)
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch {
    throw ApiError.badRequest("Fichier image invalide ou corrompu.");
  }

  const storageKey = `${randomUUID()}.jpg`;
  await fsPromises.writeFile(path.join(UPLOAD_ROOT, storageKey), processed);

  return { storageKey, mimeType: "image/jpeg", sizeBytes: processed.byteLength };
}

export interface StoredDocument {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
}

const PDF_MAGIC = "%PDF-";

/**
 * Stocke un document PDF tel quel (pas de recompression — contrairement aux
 * photos, un PDF perdrait sa mise en page à être retraité). Même logique de
 * défense que `storeImage` : le Content-Type déclaré par multer vient du
 * client et est falsifiable, donc on revérifie les octets réels avant
 * d'écrire quoi que ce soit sur disque — seule la signature `%PDF-` fait foi.
 */
export async function storePdfDocument(buffer: Buffer): Promise<StoredDocument> {
  ensureUploadDir();

  if (buffer.length < PDF_MAGIC.length || buffer.subarray(0, PDF_MAGIC.length).toString("latin1") !== PDF_MAGIC) {
    throw ApiError.badRequest("Fichier invalide : seul un PDF est accepté.");
  }

  const storageKey = `${randomUUID()}.pdf`;
  await fsPromises.writeFile(path.join(UPLOAD_ROOT, storageKey), buffer);

  return { storageKey, mimeType: "application/pdf", sizeBytes: buffer.byteLength };
}

export function resolveStoragePath(storageKey: string): string {
  // Un storageKey provient toujours de randomUUID() côté serveur (jamais du
  // client) : pas de risque de traversée de répertoire, mais on borne quand
  // même explicitement la résolution à UPLOAD_ROOT par prudence.
  const resolved = path.join(UPLOAD_ROOT, path.basename(storageKey));
  return resolved;
}

export async function deleteStoredImage(storageKey: string): Promise<void> {
  try {
    await fsPromises.unlink(resolveStoragePath(storageKey));
  } catch {
    // Fichier déjà absent : pas bloquant.
  }
}

// Même opération que `deleteStoredImage`, nom générique pour les fichiers
// non-image (documents PDF) — le contenu de la fonction est identique
// (unlink d'une clé opaque), seul l'appelant diffère.
export async function deleteStoredFile(storageKey: string): Promise<void> {
  try {
    await fsPromises.unlink(resolveStoragePath(storageKey));
  } catch {
    // Fichier déjà absent : pas bloquant.
  }
}
