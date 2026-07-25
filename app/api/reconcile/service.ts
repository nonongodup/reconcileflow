import { getXlsxWorksheetNames, parseCsvText, parseXlsxBuffer, type Dataset } from "../../file-parsers.ts";
import { reconcile, type Mapping, type ReconciliationOptions } from "../../reconciliation.ts";

export type ServerFile = { name: string; size: number; bytes: ArrayBuffer; worksheetName?: string | null };
export type ParseLimits = { maxRows: number; maxColumns?: number; maxWorksheets?: number; maxCsvRowLength?: number };

function parseServerFile(file: ServerFile, limits: ParseLimits): Dataset {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".csv")) {
    const text = new TextDecoder().decode(file.bytes);
    if (text.split(/\r?\n/).some((row) => row.length > (limits.maxCsvRowLength ?? 100000))) throw new Error("INVALID_UPLOAD");
    return parseCsvText(text, file.name, file.size);
  }
  if (!lower.endsWith(".xlsx")) throw new Error("Unsupported file type. Use CSV or XLSX.");
  const sheets = getXlsxWorksheetNames(file.bytes);
  if (sheets.length > (limits.maxWorksheets ?? 20)) throw new Error("INVALID_UPLOAD");
  const selected = file.worksheetName || (sheets.length === 1 ? sheets[0] : null);
  if (!selected) throw new Error(`Select a worksheet for ${file.name}. Available worksheets: ${sheets.join(", ")}.`);
  return parseXlsxBuffer(file.bytes, file.name, file.size, selected);
}

export function processFiles(sourceFile: ServerFile, targetFile: ServerFile, mappings: Mapping[], rules: ReconciliationOptions, limitsOrRows: number | ParseLimits) {
  const limits = typeof limitsOrRows === "number" ? { maxRows: limitsOrRows } : limitsOrRows;
  const source = parseServerFile(sourceFile, limits), target = parseServerFile(targetFile, limits);
  if (source.rows.length > limits.maxRows || target.rows.length > limits.maxRows) throw new Error("ROW_LIMIT");
  if (source.headers.length > (limits.maxColumns ?? 250) || target.headers.length > (limits.maxColumns ?? 250)) throw new Error("INVALID_UPLOAD");
  return { source, target, result: reconcile(source, target, mappings, rules) };
}
