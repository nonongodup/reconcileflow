import * as XLSXModule from "xlsx";
import type { CellObject, WorkBook, WorkSheet } from "xlsx";

const XLSX = XLSXModule;

export const MAX_PROTOTYPE_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_PROTOTYPE_FILE_LABEL = "10 MB";

export type Row = Record<string, string>;
export type ParsedValue = string | number | boolean | null;
export type ParsedRecord = {
  rowNumber: number;
  originalValues: Row;
  parsedValues: Record<string, ParsedValue>;
};

export type Dataset = {
  name: string;
  format: "CSV" | "XLSX";
  size: string;
  sizeBytes: number;
  worksheetName: string | null;
  worksheetNames: string[];
  headers: string[];
  rows: Row[];
  records: ParsedRecord[];
  previewRows: Row[];
  warnings: string[];
};

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function validateFile(name: string, size: number) {
  const extension = name.toLowerCase().split(".").pop();
  if (extension !== "csv" && extension !== "xlsx") {
    if (extension === "xls")
      throw new Error(
        "Legacy .xls files are not supported. Save the workbook as .xlsx or export it as CSV.",
      );
    throw new Error(
      "Unsupported file type. ReconcileFlow currently supports CSV and XLSX files.",
    );
  }
  if (size > MAX_PROTOTYPE_FILE_BYTES)
    throw new Error(
      `This file exceeds the ${MAX_PROTOTYPE_FILE_LABEL} pilot limit.`,
    );
}

export function readableWorkbookError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/password|encrypt|protected|Unsupported ZIP encryption/i.test(message))
    return "This workbook appears to be password-protected. Remove the password and upload it again.";
  return "The XLSX workbook is corrupted or unreadable. Open and re-save it in Excel, then try again.";
}

function readWorkbook(buffer: ArrayBuffer) {
  try {
    const signature = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
    if (signature.length === 4 && signature[0] === 0xd0 && signature[1] === 0xcf && signature[2] === 0x11 && signature[3] === 0xe0)
      throw new Error("Password-protected encrypted workbook container");
    if (signature.length < 4 || signature[0] !== 0x50 || signature[1] !== 0x4b)
      throw new Error("Invalid XLSX ZIP signature");
    return XLSX.read(buffer, {
      type: "array",
      cellDates: false,
      cellNF: true,
      cellText: true,
      cellFormula: true,
    });
  } catch (error) {
    throw new Error(readableWorkbookError(error));
  }
}

export function getXlsxWorksheetNames(buffer: ArrayBuffer) {
  const workbook = readWorkbook(buffer);
  const names = workbook.SheetNames.filter((name) =>
    Boolean(workbook.Sheets[name]),
  );
  if (!names.length)
    throw new Error("This workbook contains no usable worksheets.");
  return names;
}

function displayedValue(cell: CellObject | undefined): string {
  if (!cell || cell.v === undefined || cell.v === null) return "";
  if (cell.t === "n" && typeof cell.z === "string" && /[ymd]/i.test(cell.z.replace(/"[^"]*"|\[[^\]]*\]/g, ""))) {
    const date = excelSerialDate(Number(cell.v));
    if (date) return `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${String(date.getUTCDate()).padStart(2, "0")}/${date.getUTCFullYear()}`;
  }
  if (typeof cell.w === "string") return cell.w;
  if (cell.v instanceof Date) return cell.v.toISOString().slice(0, 10);
  return String(cell.v);
}

function parsedValue(cell: CellObject | undefined): ParsedValue {
  if (!cell || cell.v === undefined || cell.v === null) return null;
  if (cell.v instanceof Date) return cell.v.toISOString().slice(0, 10);
  if (cell.t === "b") return Boolean(cell.v);
  if (cell.t === "n") {
    const dateFormat = typeof cell.z === "string" ? cell.z.replace(/"[^"]*"|\[[^\]]*\]/g, "") : "";
    if (/[ymd]/i.test(dateFormat)) {
      const date = excelSerialDate(Number(cell.v));
      if (date) return date.toISOString().slice(0, 10);
    }
    return Number(cell.v);
  }
  return String(cell.v);
}

function excelSerialDate(value: number) {
  if (!Number.isFinite(value)) return null;
  return new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
}

function datasetFromSheet(
  sheet: WorkSheet,
  metadata: Omit<
    Dataset,
    "headers" | "rows" | "records" | "previewRows" | "warnings"
  >,
): Dataset {
  if (!sheet["!ref"])
    throw new Error(`Worksheet “${metadata.worksheetName ?? "CSV"}” is empty.`);
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const nonEmptyRows: number[] = [];
  let maxUsedColumn = -1;
  for (let r = range.s.r; r <= range.e.r; r++) {
    let hasValue = false;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })] as
        | CellObject
        | undefined;
      if (displayedValue(cell).trim() !== "" || parsedValue(cell) !== null) {
        hasValue = true;
        maxUsedColumn = Math.max(maxUsedColumn, c);
      }
    }
    if (hasValue) nonEmptyRows.push(r);
  }
  if (!nonEmptyRows.length || maxUsedColumn < range.s.c)
    throw new Error(`Worksheet “${metadata.worksheetName ?? "CSV"}” is empty.`);

  const headerRow = nonEmptyRows[0];
  const headers: string[] = [];
  for (let c = range.s.c; c <= maxUsedColumn; c++) {
    headers.push(
      displayedValue(
        sheet[XLSX.utils.encode_cell({ r: headerRow, c })] as
          | CellObject
          | undefined,
      ).trim(),
    );
  }
  if (headers.every((header) => !header))
    throw new Error("The first non-empty row does not contain headers.");
  const blankIndex = headers.findIndex((header) => !header);
  if (blankIndex >= 0)
    throw new Error(
      `Column ${blankIndex + 1} has a blank header. Every used column needs a header.`,
    );
  const seen = new Map<string, string>();
  for (const header of headers) {
    const key = header.toLocaleLowerCase();
    if (seen.has(key))
      throw new Error(`Duplicate column header detected: “${header}”.`);
    seen.set(key, header);
  }

  const warnings: string[] = [];
  const records: ParsedRecord[] = [];
  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const originalValues: Row = {};
    const parsedValues: Record<string, ParsedValue> = {};
    let hasValue = false;
    headers.forEach((header, index) => {
      const cell = sheet[
        XLSX.utils.encode_cell({ r, c: range.s.c + index })
      ] as CellObject | undefined;
      const original = displayedValue(cell);
      const parsed = parsedValue(cell);
      if (original.trim() !== "" || parsed !== null) hasValue = true;
      if (cell?.f && (cell.v === undefined || cell.v === null))
        warnings.push(
          `Formula at row ${r + 1}, column “${header}” has no cached result and was treated as blank.`,
        );
      originalValues[header] = original;
      parsedValues[header] = parsed;
    });
    if (hasValue)
      records.push({ rowNumber: r + 1, originalValues, parsedValues });
  }
  if (!records.length)
    throw new Error(
      `Worksheet “${metadata.worksheetName ?? "CSV"}” has headers but no data rows.`,
    );
  return {
    ...metadata,
    headers,
    records,
    rows: records.map((record) => record.originalValues),
    previewRows: records.slice(0, 5).map((record) => record.originalValues),
    warnings: [...new Set(warnings)],
  };
}

export function parseCsvText(
  text: string,
  name: string,
  sizeBytes: number,
): Dataset {
  let workbook: WorkBook;
  try {
    workbook = XLSX.read(text.replace(/^\uFEFF/, ""), {
      type: "string",
      raw: true,
      cellText: true,
    });
  } catch {
    throw new Error(
      "The CSV file is corrupted or unreadable. Check its delimiter and quoting, then try again.",
    );
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName || !workbook.Sheets[sheetName])
    throw new Error("The CSV file contains no usable data.");
  return datasetFromSheet(workbook.Sheets[sheetName], {
    name,
    format: "CSV",
    size: formatSize(sizeBytes),
    sizeBytes,
    worksheetName: null,
    worksheetNames: [],
  });
}

export function parseXlsxBuffer(
  buffer: ArrayBuffer,
  name: string,
  sizeBytes: number,
  worksheetName: string,
): Dataset {
  const workbook = readWorkbook(buffer);
  const worksheetNames = workbook.SheetNames.filter((sheet) =>
    Boolean(workbook.Sheets[sheet]),
  );
  if (!worksheetNames.length)
    throw new Error("This workbook contains no usable worksheets.");
  const sheet = workbook.Sheets[worksheetName];
  if (!sheet)
    throw new Error(`Worksheet “${worksheetName}” could not be found.`);
  return datasetFromSheet(sheet, {
    name,
    format: "XLSX",
    size: formatSize(sizeBytes),
    sizeBytes,
    worksheetName,
    worksheetNames,
  });
}
