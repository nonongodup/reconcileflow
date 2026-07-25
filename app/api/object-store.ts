import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BucketLike } from "./storage";

function safeLocalPath(key: string) {
  const root = path.resolve(process.env.LOCAL_STORAGE_PATH || ".data/objects");
  const resolved = path.resolve(root, key);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error("INVALID_OBJECT_KEY");
  return resolved;
}

function localStore(): BucketLike {
  return {
    async put(key, value) {
      const file = safeLocalPath(key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, typeof value === "string" ? value : Buffer.from(value));
    },
    async get(key) {
      try { const bytes = await readFile(safeLocalPath(key)); return { async arrayBuffer() { return Uint8Array.from(bytes).buffer; } }; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    },
    async delete(key) { await rm(safeLocalPath(key), { force: true }); },
  };
}

function s3Store(): BucketLike {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET is not configured.");
  const client = new S3Client({ region: process.env.S3_REGION || "auto", endpoint: process.env.S3_ENDPOINT || undefined, forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true" });
  return {
    async put(key, value) { await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: typeof value === "string" ? value : Buffer.from(value) })); },
    async get(key) { const output = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key })); if (!output.Body) return null; const bytes = await output.Body.transformToByteArray(); return { async arrayBuffer() { return Uint8Array.from(bytes).buffer; } }; },
    async delete(key) { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); },
  };
}

let store: BucketLike | undefined;
export function getObjectStore() { return store ??= process.env.STORAGE_DRIVER === "s3" ? s3Store() : localStore(); }
