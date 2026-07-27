type SecurityEvent = {
  event: string;
  requestId: string;
  userId?: string | null;
  runId?: string | null;
  stage: string;
  safeCode: string;
  severity: "info" | "warning" | "high" | "critical";
};

/**
 * Sends identifiers and safe codes only. Never add filenames, emails, row
 * contents, query text, credentials, or raw exceptions to this payload.
 */
export async function emitSecurityEvent(event: SecurityEvent) {
  const url = process.env.SECURITY_ALERT_WEBHOOK_URL;
  if (!url) return false;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.SECURITY_ALERT_WEBHOOK_TOKEN ? { authorization: `Bearer ${process.env.SECURITY_ALERT_WEBHOOK_TOKEN}` } : {}),
      },
      body: JSON.stringify({ ...event, timestamp: new Date().toISOString(), service: "reconcileflow" }),
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
