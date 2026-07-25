import assert from "node:assert/strict";
import test from "node:test";
import XLSX from "xlsx";
import { processFiles } from "../app/api/reconcile/service.ts";
import { deleteWithRetry } from "../app/api/storage-core.ts";
import type { Mapping } from "../app/reconciliation.ts";

const csvText = "ID,Name,Amount\n001,Ada,1250.50\n002,Lin,99.50\n";
const bytes = (value: string) => new TextEncoder().encode(value).buffer;
const mappings: Mapping[] = [
  { source: "ID", target: "ID", type: "Text", include: true },
  { source: "Name", target: "Name", type: "Text", include: true },
  { source: "Amount", target: "Amount", type: "Number", include: true },
];

function xlsxBytes() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["ID", "Name", "Amount"],
      ["001", "Ada", 1250.5],
      ["002", "Lin", 99.5],
    ]),
    "Data",
  );
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

function serverFile(name: string, data: ArrayBuffer, worksheetName?: string) {
  return { name, size: data.byteLength, bytes: data, worksheetName };
}

test("server service reconciles CSV to CSV with indexed lookup", () => {
  const data = bytes(csvText);
  const { result } = processFiles(serverFile("source.csv", data), serverFile("target.csv", data), mappings, { preserveLeadingZeros: true }, 1000);
  assert.equal(result.matched, 2);
  assert.equal(result.lookupStrategy, "indexed-map");
});

test("server service reconciles XLSX to XLSX", () => {
  const data = xlsxBytes();
  const { result } = processFiles(serverFile("source.xlsx", data, "Data"), serverFile("target.xlsx", data, "Data"), mappings, { preserveLeadingZeros: true }, 1000);
  assert.equal(result.matched, 2);
});

test("server service reconciles CSV to XLSX identically", () => {
  const csv = bytes(csvText);
  const xlsx = xlsxBytes();
  const { result } = processFiles(serverFile("source.csv", csv), serverFile("target.xlsx", xlsx, "Data"), mappings, { preserveLeadingZeros: true }, 1000);
  assert.deepEqual({ matched: result.matched, missing: result.missing, extra: result.extra, differences: result.differences }, { matched: 2, missing: [], extra: [], differences: [] });
});

class FakeBucket {
  objects = new Map<string, ArrayBuffer>();
  async put(key: string, value: ArrayBuffer | string) {
    this.objects.set(key, typeof value === "string" ? bytes(value) : value);
  }
  async get(key: string) {
    const value = this.objects.get(key);
    return value ? { arrayBuffer: async () => value } : null;
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
}

test("storage deletion succeeds", async () => {
  const bucket = new FakeBucket();
  await bucket.put("source", "a");
  const outcome = await deleteWithRetry(bucket, "source", 3, 0);
  assert.deepEqual(outcome, { deleted: true, attempts: 1, errorCode: null });
  assert.equal(bucket.objects.size, 0);
});

test("failed storage deletion retries with bounded exponential backoff", async () => {
  let attempts = 0;
  const bucket = { async delete() { attempts++; throw new Error("provider failure"); } };
  const outcome = await deleteWithRetry(bucket, "source", 3, 0);
  assert.deepEqual(outcome, { deleted: false, attempts: 3, errorCode: "STORAGE_DELETE_FAILED" });
  assert.equal(attempts, 3);
});
