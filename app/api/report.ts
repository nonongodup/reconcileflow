import type { Result } from "../reconciliation";

export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function buildReport(result: Result) {
  const rows: Record<string, unknown>[] = result.differences.map((item) => ({ category: "field_difference", key: item.key, source_row: item.sourceRow, target_row: item.targetRow, source_column: item.sourceColumn, target_column: item.targetColumn, source_value: item.sourceValue, target_value: item.targetValue, reason: item.reason }));
  result.missing.forEach((row) => rows.push({ category: "missing_in_target", record: JSON.stringify(row) }));
  result.extra.forEach((row) => rows.push({ category: "extra_in_target", record: JSON.stringify(row) }));
  result.duplicateKeys.forEach((item) => rows.push({ category: "duplicate_key", key: item.key, file: item.file, rows: item.rows.join(",") }));
  result.invalidKeys.forEach((item) => rows.push({ category: "invalid_key", file: item.file, row: item.row, value: item.value }));
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [headers.map(csvCell).join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n");
}
