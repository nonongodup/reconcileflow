export type DeletableBucket = { delete(key: string): Promise<unknown> };
const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function deleteWithRetry(bucket: DeletableBucket, key: string, maximumAttempts = 3, baseDelayMs = 100) {
  let attempts = 0;
  while (attempts < maximumAttempts) {
    attempts++;
    try { await bucket.delete(key); return { deleted: true, attempts, errorCode: null }; }
    catch { if (attempts < maximumAttempts) await delay(baseDelayMs * 2 ** (attempts - 1)); }
  }
  return { deleted: false, attempts, errorCode: "STORAGE_DELETE_FAILED" };
}
