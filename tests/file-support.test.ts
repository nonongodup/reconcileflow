import assert from "node:assert/strict";
import test from "node:test";
import XLSX from "xlsx";
import { getXlsxWorksheetNames, parseCsvText, parseXlsxBuffer, readableWorkbookError, validateFile } from "../app/file-parsers.ts";
import { reconcile } from "../app/reconciliation.ts";
import type { Mapping } from "../app/reconciliation.ts";

const csv = `ID,Name,Amount,Rate,Active,Start Date,Calculated\n00123,Ada,"$1,250.50",25%,TRUE,2024-01-15,1251.5\n00124,Lin,99.5,10%,FALSE,2024-02-20,100.5\n`;
const mappings: Mapping[] = [
  { source: "ID", target: "ID", type: "Text", include: true },
  { source: "Name", target: "Name", type: "Text", include: true },
  { source: "Amount", target: "Amount", type: "Number", include: true },
  { source: "Rate", target: "Rate", type: "Number", include: true },
  { source: "Active", target: "Active", type: "Boolean", include: true },
  { source: "Start Date", target: "Start Date", type: "Date", include: true },
  { source: "Calculated", target: "Calculated", type: "Number", include: true },
];

function workbookBuffer(multiple = false) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["ID", "Name", "Amount", "Rate", "Active", "Start Date", "Calculated"],
    ["00123", "Ada", 1250.5, 0.25, true, new Date(2024, 0, 15), null],
    [],
    ["00124", "Lin", 99.5, 0.1, false, new Date(2024, 1, 20), null],
  ], { cellDates: true });
  sheet.C2.z = "$#,##0.00"; sheet.D2.z = "0%"; sheet.C4.z = "$#,##0.00"; sheet.D4.z = "0%";
  sheet.G2 = { t: "n", f: "C2+1", v: 1251.5, w: "1251.5" };
  sheet.G4 = { t: "n", f: "C4+1", v: 100.5, w: "100.5" };
  XLSX.utils.book_append_sheet(workbook, sheet, "Employees");
  if (multiple) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Other"], ["value"]]), "Other Sheet");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx", cellDates: true }) as ArrayBuffer;
}

const csvDataset = () => parseCsvText(csv, "employees.csv", Buffer.byteLength(csv));
const xlsxDataset = (multiple = false) => { const buffer = workbookBuffer(multiple); return parseXlsxBuffer(buffer, "employees.xlsx", buffer.byteLength, "Employees"); };
const identical = (source: ReturnType<typeof csvDataset>, target: ReturnType<typeof csvDataset>) => reconcile(source, target, mappings, true);

test("1 CSV source and CSV target", () => assert.equal(identical(csvDataset(), csvDataset()).matched, 2));
test("2 XLSX source and XLSX target", () => assert.equal(identical(xlsxDataset(), xlsxDataset()).matched, 2));
test("3 CSV source and XLSX target", () => assert.equal(identical(csvDataset(), xlsxDataset()).matched, 2));
test("4 XLSX source and CSV target", () => assert.equal(identical(xlsxDataset(), csvDataset()).matched, 2));
test("cross-format reconciliation results are identical", () => {
  const cc = identical(csvDataset(), csvDataset());
  const xx = identical(xlsxDataset(), xlsxDataset());
  const cx = identical(csvDataset(), xlsxDataset());
  assert.deepEqual({ matched: cx.matched, missing: cx.missing, extra: cx.extra, differences: cx.differences }, { matched: cc.matched, missing: cc.missing, extra: cc.extra, differences: cc.differences });
  assert.equal(xx.matched, cc.matched);
});
test("5 workbook with multiple worksheets", () => assert.deepEqual(getXlsxWorksheetNames(workbookBuffer(true)), ["Employees", "Other Sheet"]));
test("6 empty worksheet", () => {
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), "Empty"); const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  assert.throws(() => parseXlsxBuffer(buffer, "empty.xlsx", buffer.byteLength, "Empty"), /empty/i);
});
test("7 duplicate headers", () => {
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["ID", "id"], [1, 2]]), "Data"); const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  assert.throws(() => parseXlsxBuffer(buffer, "duplicate.xlsx", buffer.byteLength, "Data"), /Duplicate column header/i);
});
test("8 blank rows are ignored", () => assert.equal(xlsxDataset().rows.length, 2));
test("9 date cells preserve display and expose parsed ISO date", () => { const data = xlsxDataset(); assert.match(data.rows[0]["Start Date"], /2024|1\/15/); assert.equal(data.records[0].parsedValues["Start Date"], "2024-01-15"); });
test("10 numeric, currency and percentage cells", () => { const data = xlsxDataset(); assert.equal(data.records[0].parsedValues.Amount, 1250.5); assert.equal(data.records[0].parsedValues.Rate, 0.25); assert.match(data.rows[0].Amount, /1,250\.50/); });
test("11 boolean cells", () => { const data = xlsxDataset(); assert.equal(data.records[0].parsedValues.Active, true); assert.equal(data.records[1].parsedValues.Active, false); });
test("12 formula cells use cached values", () => { const data = xlsxDataset(); assert.equal(data.records[0].parsedValues.Calculated, 1251.5); assert.equal(data.warnings.length, 0); });
test("13 text IDs preserve leading zeros", () => assert.equal(xlsxDataset().rows[0].ID, "00123"));
test("14 unsupported XLS file", () => assert.throws(() => validateFile("legacy.xls", 100), /not supported/i));
test("15 corrupted XLSX file", () => assert.throws(() => getXlsxWorksheetNames(new TextEncoder().encode("not a workbook").buffer), /corrupted|unreadable/i));
test("password-protected workbook error is explicit", () => assert.match(readableWorkbookError(new Error("Unsupported ZIP encryption password")), /password-protected/i));
test("encrypted workbook container reports password protection", () => assert.throws(() => getXlsxWorksheetNames(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]).buffer), /password-protected/i));
test("blank header is rejected", () => assert.throws(() => parseCsvText("ID,,Name\n1,x,Ada", "blank.csv", 20), /blank header/i));
