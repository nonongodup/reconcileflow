import { getSql } from "../../../db";
import type { Mapping, ReconciliationOptions, Result } from "../../reconciliation";
import { enforceConcurrency, enforceRateLimit, recordUploadFailure, withTimeout } from "../controls";
import { audit, SafeError, sanitizeError } from "../logging";
import { buildReport } from "../report";
import { apiError, limits, requireApiUser, uploadsBucket } from "../server";
import { registerStorageObject, withTemporaryUploads } from "../storage";
import { processFiles } from "./service";

export const dynamic = "force-dynamic";

function summarize(result: Result, sourceRows: number, targetRows: number) {
  const top = new Map<string, number>();
  result.differences.forEach((item) => top.set(item.sourceColumn, (top.get(item.sourceColumn) || 0) + 1));
  return {
    sourceRows, targetRows, matched: result.matched, missing: result.missing.length, extra: result.extra.length,
    differenceRecords: new Set(result.differences.map((item) => item.key)).size,
    fieldDifferences: result.differences.length, duplicateKeys: result.duplicateKeys.length,
    invalidKeys: result.invalidKeys.length, compared: result.compared, lookupStrategy: result.lookupStrategy,
    topFields: [...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4),
  };
}

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  let runId: string | null = null, userId: string | null = null;
  try {
    const user = await requireApiUser(request); userId = user.id;
    await enforceRateLimit(user.id, "reconcile", 10, 60);
    await enforceConcurrency(user.id, limits.maxConcurrentRuns);
    const form = await request.formData(), sourceFile = form.get("source"), targetFile = form.get("target");
    if (!(sourceFile instanceof File) || !(targetFile instanceof File)) throw new SafeError("INVALID_UPLOAD", 400);
    if (sourceFile.size > limits.maxUploadBytes || targetFile.size > limits.maxUploadBytes) throw new SafeError("SIZE_LIMIT", 413);
    if (!/\.(csv|xlsx)$/i.test(sourceFile.name) || !/\.(csv|xlsx)$/i.test(targetFile.name)) throw new SafeError("INVALID_UPLOAD", 415);
    const mappings = JSON.parse(String(form.get("mappings") || "[]")) as Mapping[];
    const rules = JSON.parse(String(form.get("rules") || "{}")) as ReconciliationOptions;
    const sourceBytes = await sourceFile.arrayBuffer(), targetBytes = await targetFile.arrayBuffer();
    const sql = getSql(), bucket = uploadsBucket(); runId = crypto.randomUUID();
    await sql`INSERT INTO rf_runs (id,user_id,name,status,source_name,target_name,source_format,target_format,mappings,rules)
      VALUES (${runId},${user.id},${String(form.get("name") || "File reconciliation")},'processing',${sourceFile.name},${targetFile.name},${sourceFile.name.toLowerCase().endsWith(".xlsx") ? "XLSX" : "CSV"},${targetFile.name.toLowerCase().endsWith(".xlsx") ? "XLSX" : "CSV"},${JSON.stringify(mappings)}::jsonb,${JSON.stringify(rules)}::jsonb)`;
    await audit("file_upload_initiated", requestId, user.id, runId, "upload");
    await audit("reconciliation_started", requestId, user.id, runId, "reconcile");
    const uploadExpiry = new Date(Date.now() + limits.fileRetentionMinutes * 60000);
    const sourceKey = `uploads/${user.id}/${crypto.randomUUID()}-${sourceFile.name}`, targetKey = `uploads/${user.id}/${crypto.randomUUID()}-${targetFile.name}`;
    const sourceObjectId = await registerStorageObject(user.id, runId, "source", sourceKey, uploadExpiry);
    const targetObjectId = await registerStorageObject(user.id, runId, "target", targetKey, uploadExpiry);
    const response = await withTemporaryUploads(bucket, [
      { id: sourceObjectId, key: sourceKey, bytes: sourceBytes, metadata: { customMetadata: { deleteAfter: uploadExpiry.toISOString() } } },
      { id: targetObjectId, key: targetKey, bytes: targetBytes, metadata: { customMetadata: { deleteAfter: uploadExpiry.toISOString() } } },
    ], requestId, async () => {
      await audit("file_upload_completed", requestId, user.id, runId, "upload");
      const { source, target, result } = await withTimeout(Promise.resolve(processFiles(
        { name: sourceFile.name, size: sourceFile.size, bytes: sourceBytes, worksheetName: form.get("sourceSheet") ? String(form.get("sourceSheet")) : null },
        { name: targetFile.name, size: targetFile.size, bytes: targetBytes, worksheetName: form.get("targetSheet") ? String(form.get("targetSheet")) : null },
        mappings, rules, { maxRows: limits.maxRows, maxColumns: limits.maxColumns, maxWorksheets: limits.maxWorksheets, maxCsvRowLength: limits.maxCsvRowLength },
      )), limits.processingTimeoutMs);
      const summary = summarize(result, source.rows.length, target.rows.length);
      const resultExpiry = new Date(Date.now() + limits.resultRetentionHours * 3600000);
      const resultKey = `results/${user.id}/${runId}.json`;
      const resultObjectId = await registerStorageObject(user.id, runId, "result", resultKey, resultExpiry);
      await bucket.put(resultKey, JSON.stringify(result), { httpMetadata: { contentType: "application/json" }, customMetadata: { deleteAfter: resultExpiry.toISOString() } });
      const report = buildReport(result), reportBytes = new TextEncoder().encode(report).byteLength;
      if (reportBytes > limits.maxReportBytes) throw new SafeError("REPORT_LIMIT", 413);
      const reportExpiry = new Date(Date.now() + limits.reportRetentionHours * 3600000), reportKey = `reports/${user.id}/${crypto.randomUUID()}.csv`;
      const reportObjectId = await registerStorageObject(user.id, runId, "report", reportKey, reportExpiry);
      await bucket.put(reportKey, report, { httpMetadata: { contentType: "text/csv; charset=utf-8" }, customMetadata: { deleteAfter: reportExpiry.toISOString() } });
      await sql`UPDATE rf_runs SET status='completed',source_rows=${source.rows.length},target_rows=${target.rows.length},summary=${JSON.stringify(summary)}::jsonb,report_key=${reportObjectId},report_expires_at=${reportExpiry.toISOString()},completed_at=now() WHERE id=${runId} AND user_id=${user.id}`;
      await audit("report_generated", requestId, user.id, runId, "report");
      await audit("reconciliation_completed", requestId, user.id, runId, "reconcile");
      return Response.json({ summary, result: { matched: result.matched, compared: result.compared, lookupStrategy: result.lookupStrategy, missing: [], extra: [], differences: [], duplicateKeys: [], invalidKeys: [] }, run: { id: runId, status: "completed", resultExpiresAt: resultExpiry.toISOString(), resultObjectId } }, { headers: { "cache-control": "no-store", "x-request-id": requestId } });
    });
    return response;
  } catch (error) {
    const safe = sanitizeError(error);
    if (userId) await recordUploadFailure(userId).catch(() => undefined);
    if (runId) {
      const sql = getSql();
      await sql`UPDATE rf_runs SET status='failed',failure_message=${safe.code},completed_at=now() WHERE id=${runId}`.catch(() => undefined);
      await audit("reconciliation_failed", requestId, userId, runId, "reconcile", safe.code).catch(() => undefined);
    }
    return apiError(error);
  }
}
