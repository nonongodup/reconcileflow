import { getSql } from "../../db";
import { audit } from "./logging";
import { deleteWithRetry } from "./storage-core";

export type StorageKind = "source" | "target" | "result" | "report";
export type BucketLike = {
  put(key: string, value: ArrayBuffer | string, options?: unknown): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  delete(key: string): Promise<unknown>;
};

export async function registerStorageObject(userId: string, runId: string | null, kind: StorageKind, key: string, expiresAt: Date) {
  const id = crypto.randomUUID(), sql = getSql();
  await sql`INSERT INTO rf_storage_objects (id,user_id,run_id,kind,object_key,expires_at) VALUES (${id},${userId},${runId},${kind},${key},${expiresAt.toISOString()})`;
  return id;
}

export async function deleteTrackedObject(bucket: BucketLike, objectId: string, requestId: string, maximumAttempts = 3) {
  const sql = getSql();
  const rows = await sql`SELECT id,user_id,run_id,object_key,status,retry_count FROM rf_storage_objects WHERE id=${objectId}`;
  const item = rows[0] as { id: string; user_id: string; run_id: string | null; object_key: string; status: string; retry_count: number } | undefined;
  if (!item || item.status === "deleted") return true;
  await sql`UPDATE rf_storage_objects SET status='deleting',last_attempt_at=now() WHERE id=${objectId}`;
  const outcome = await deleteWithRetry(bucket, item.object_key, maximumAttempts);
  if (outcome.deleted) {
      await sql`UPDATE rf_storage_objects SET status='deleted',deleted_at=now(),last_error_code=null,retry_count=${Number(item.retry_count) + outcome.attempts - 1} WHERE id=${objectId}`;
      await audit("cleanup_succeeded", requestId, item.user_id, item.run_id, "storage_delete");
      return true;
  }
  await sql`UPDATE rf_storage_objects SET status='cleanup_failed',retry_count=retry_count+${outcome.attempts},last_error_code=${outcome.errorCode},last_attempt_at=now() WHERE id=${objectId}`;
  await audit("cleanup_failed", requestId, item.user_id, item.run_id, "storage_delete", "STORAGE_DELETE_FAILED");
  return false;
}

export async function withTemporaryUploads<T>(bucket: BucketLike, entries: { id: string; key: string; bytes: ArrayBuffer; metadata?: unknown }[], requestId: string, task: () => Promise<T>) {
  const stored: { id: string; key: string }[] = [];
  try {
    for (const entry of entries) { await bucket.put(entry.key, entry.bytes, entry.metadata); stored.push(entry); }
    return await task();
  } finally {
    for (const entry of stored) await deleteTrackedObject(bucket, entry.id, requestId);
  }
}

export async function consumeTrackedObject(bucket: BucketLike, objectId: string, requestId: string) {
  const sql = getSql();
  const rows = await sql`SELECT object_key FROM rf_storage_objects WHERE id=${objectId} AND status='active'`;
  const key = rows[0]?.object_key as string | undefined;
  if (!key) return null;
  const object = await bucket.get(key);
  if (!object) return null;
  const bytes = await object.arrayBuffer();
  await deleteTrackedObject(bucket, objectId, requestId);
  return bytes;
}

export async function runExpiredCleanup(bucket: BucketLike, requestId: string, batchSize = 50) {
  const sql = getSql();
  await sql`UPDATE rf_cleanup_state SET last_started_at=now(),last_status='running' WHERE singleton=true`;
  const rows = await sql`SELECT id FROM rf_storage_objects WHERE status IN ('active','cleanup_failed') AND expires_at <= now() AND retry_count < 9 ORDER BY expires_at LIMIT ${batchSize}`;
  let failed = 0;
  for (const row of rows) if (!(await deleteTrackedObject(bucket, String(row.id), requestId))) failed++;
  await sql`UPDATE rf_cleanup_state SET last_completed_at=now(),last_status=${failed ? "completed_with_failures" : "completed"},processed_count=${rows.length},failed_count=${failed} WHERE singleton=true`;
  return { processed: rows.length, failed };
}
