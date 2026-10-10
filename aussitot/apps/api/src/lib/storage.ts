import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../config/env.ts";
import { AppError } from "./errors.ts";

/**
 * Stockage des fichiers privés (logos, PDF, photos). Les clés sont TOUJOURS
 * générées par le serveur et préfixées par l'entreprise
 * (`orgs/<id>/...`) ; aucun fichier n'est exposé par une URL publique
 * permanente : ils sont servis par des routes authentifiées.
 *
 * - « local » : disque du serveur (développement, petite installation) ;
 * - « s3 » : tout stockage compatible S3 (Scaleway, OVHcloud, AWS, MinIO),
 *   indispensable dès qu'il y a plusieurs instances de l'API.
 */
export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

const KEY_PATTERN = /^orgs\/[0-9a-f-]{36}\/[a-z0-9/_.-]+$/;

function assertKey(key: string): void {
  if (!KEY_PATTERN.test(key) || key.includes("..")) throw new Error(`Clé de stockage invalide : ${key}`);
}

class LocalStorage implements StorageDriver {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    assertKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Chemin hors du stockage");
    return full;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolve(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}

class S3Storage implements StorageDriver {
  private readonly client: S3Client;

  constructor(private readonly bucket: string) {
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials:
        env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    assertKey(key);
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: "AES256" }),
    );
  }

  async get(key: string): Promise<Buffer | null> {
    assertKey(key);
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch (err) {
      if ((err as { name?: string }).name === "NoSuchKey") return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    assertKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

function createStorage(): StorageDriver {
  if (env.STORAGE_DRIVER === "s3") {
    if (!env.S3_BUCKET) throw new Error("S3_BUCKET est requis avec STORAGE_DRIVER=s3");
    return new S3Storage(env.S3_BUCKET);
  }
  return new LocalStorage(path.resolve(env.STORAGE_LOCAL_DIR));
}

export const storage = createStorage();

export function orgKey(orgId: string, ...parts: string[]): string {
  return ["orgs", orgId, ...parts].join("/");
}

export async function getOrThrow(key: string): Promise<Buffer> {
  const data = await storage.get(key);
  if (!data) throw AppError.notFound("Fichier introuvable.");
  return data;
}
