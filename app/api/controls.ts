import { getSql } from "../../db";
import { SafeError } from "./logging";

export async function enforceRateLimit(userId: string, bucket: string, limit: number, windowSeconds = 60) {
  const sql = getSql();
  const rows = await sql`INSERT INTO rf_rate_limits (user_id,bucket,window_started_at,request_count)
    VALUES (${userId},${bucket},now(),1)
    ON CONFLICT (user_id,bucket) DO UPDATE SET
      window_started_at=CASE WHEN rf_rate_limits.window_started_at < now() - (${windowSeconds} * interval '1 second') THEN now() ELSE rf_rate_limits.window_started_at END,
      request_count=CASE WHEN rf_rate_limits.window_started_at < now() - (${windowSeconds} * interval '1 second') THEN 1 ELSE rf_rate_limits.request_count + 1 END
    RETURNING request_count`;
  if (Number(rows[0]?.request_count || 0) > limit) throw new SafeError("RATE_LIMITED", 429);
}

export async function enforceConcurrency(userId: string, maximum: number) {
  const sql = getSql();
  const rows = await sql`SELECT count(*)::int AS count FROM rf_runs WHERE user_id=${userId} AND status='processing' AND created_at > now() - interval '10 minutes'`;
  if (Number(rows[0]?.count || 0) >= maximum) throw new SafeError("CONCURRENCY_LIMIT", 429);
}

export async function recordUploadFailure(userId: string) {
  const sql = getSql();
  await sql`UPDATE rf_rate_limits SET failure_count=failure_count+1 WHERE user_id=${userId} AND bucket='reconcile'`;
}

export async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new SafeError("TIMEOUT", 408)), milliseconds); })]);
  } finally { if (timer) clearTimeout(timer); }
}
