import assert from "node:assert/strict";
import test from "node:test";
import type { Dataset, Row } from "../app/file-parsers.ts";
import { reconcile } from "../app/reconciliation.ts";
import type { Mapping, ReconciliationOptions } from "../app/reconciliation.ts";

function dataset(
  rows: Row[],
  headers = rows[0] ? Object.keys(rows[0]) : [],
): Dataset {
  return {
    name: "test.csv",
    format: "CSV",
    size: "1 KB",
    sizeBytes: 1024,
    worksheetName: null,
    worksheetNames: [],
    headers,
    rows,
    records: rows.map((originalValues, index) => ({
      rowNumber: index + 2,
      originalValues,
      parsedValues: { ...originalValues },
    })),
    previewRows: rows.slice(0, 5),
    warnings: [],
  };
}
const mapping = (
  source: string,
  target = source,
  type: Mapping["type"] = "Text",
  tolerance?: number,
): Mapping => ({ source, target, type, include: true, tolerance });
const run = (
  sourceRows: Row[],
  targetRows: Row[],
  mappings = [mapping("ID")],
  options: boolean | ReconciliationOptions = false,
) => reconcile(dataset(sourceRows), dataset(targetRows), mappings, options);

test("1 exact matches", () => {
  const result = run(
    [{ ID: "1", Name: "Ada" }],
    [{ ID: "1", Name: "Ada" }],
    [mapping("ID"), mapping("Name")],
  );
  assert.equal(result.matched, 1);
  assert.equal(result.differences.length, 0);
});
test("2 missing records", () => {
  const result = run([{ ID: "1" }, { ID: "2" }], [{ ID: "1" }]);
  assert.deepEqual(result.missing, [{ ID: "2" }]);
});
test("3 extra records", () => {
  const result = run([{ ID: "1" }], [{ ID: "1" }, { ID: "2" }]);
  assert.deepEqual(result.extra, [{ ID: "2" }]);
});
test("4 field-level mismatches", () => {
  const result = run(
    [{ ID: "1", Name: "Ada" }],
    [{ ID: "1", Name: "Grace" }],
    [mapping("ID"), mapping("Name")],
  );
  assert.equal(result.differences.length, 1);
  assert.equal(result.differences[0].sourceColumn, "Name");
});
test("5 duplicate keys in source", () => {
  const result = run([{ ID: "1" }, { ID: "1" }], [{ ID: "1" }]);
  assert.deepEqual(result.duplicateKeys, [
    { key: "1", file: "Source", rows: [2, 3] },
  ]);
  assert.equal(result.compared, 0);
});
test("6 duplicate keys in target", () => {
  const result = run([{ ID: "1" }], [{ ID: "1" }, { ID: "1" }]);
  assert.deepEqual(result.duplicateKeys, [
    { key: "1", file: "Target", rows: [2, 3] },
  ]);
  assert.equal(result.compared, 0);
});
test("7 blank and invalid keys", () => {
  const result = run(
    [{ ID: "" }, { ID: "   " }, { ID: null as unknown as string }],
    [],
  );
  assert.equal(result.invalidKeys.length, 3);
  assert.equal(result.missing.length, 0);
});
test("8 composite keys", () => {
  const rows = [
    { Company: "A", ID: "1", Value: "x" },
    { Company: "B", ID: "1", Value: "y" },
  ];
  const result = run(
    rows,
    [...rows].reverse(),
    [mapping("Company"), mapping("ID"), mapping("Value")],
    { sourceKeys: ["Company", "ID"], targetKeys: ["Company", "ID"] },
  );
  assert.equal(result.matched, 2);
  assert.equal(result.lookupStrategy, "indexed-map");
});
test("9 case-insensitive text comparison", () =>
  assert.equal(
    run(
      [{ ID: "1", Name: "ADA" }],
      [{ ID: "1", Name: "ada" }],
      [mapping("ID"), mapping("Name")],
    ).matched,
    1,
  ));
test("10 whitespace trimming", () =>
  assert.equal(
    run(
      [{ ID: " 1 ", Name: " Ada  " }],
      [{ ID: "1", Name: "Ada" }],
      [mapping("ID"), mapping("Name")],
    ).matched,
    1,
  ));
test("11 leading-zero preservation", () => {
  const result = run([{ ID: "00123" }], [{ ID: "123" }], [mapping("ID")], {
    preserveLeadingZeros: true,
  });
  assert.equal(result.matched, 0);
  assert.equal(result.missing.length, 1);
  assert.equal(result.extra.length, 1);
});
test("12 leading-zero normalization", () =>
  assert.equal(
    run([{ ID: "00123" }], [{ ID: "123" }], [mapping("ID")], {
      preserveLeadingZeros: false,
    }).matched,
    1,
  ));
test("13 currency and comma normalization", () =>
  assert.equal(
    run(
      [{ ID: "1", Amount: "$1,250.00" }],
      [{ ID: "1", Amount: "1250" }],
      [mapping("ID"), mapping("Amount", "Amount", "Number")],
    ).matched,
    1,
  ));
test("14 numeric tolerance", () => {
  const within = run(
    [{ ID: "1", Amount: "10.001" }],
    [{ ID: "1", Amount: "10.009" }],
    [mapping("ID"), mapping("Amount", "Amount", "Number")],
    { numericTolerance: 0.01 },
  );
  const outside = run(
    [{ ID: "1", Amount: "10" }],
    [{ ID: "1", Amount: "10.02" }],
    [mapping("ID"), mapping("Amount", "Amount", "Number", 0.01)],
  );
  assert.equal(within.matched, 1);
  assert.equal(outside.differences.length, 1);
});
test("15 date normalization", () =>
  assert.equal(
    run(
      [{ ID: "1", Date: "2024-01-05" }],
      [{ ID: "1", Date: "01/05/2024" }],
      [mapping("ID"), mapping("Date", "Date", "Date")],
    ).matched,
    1,
  ));
test("16 blank versus null handling", () => {
  const source = [{ ID: "1", Value: null as unknown as string }];
  const target = [{ ID: "1", Value: "" }];
  assert.equal(
    run(source, target, [mapping("ID"), mapping("Value")], {
      blankEqualsNull: true,
    }).matched,
    1,
  );
  assert.equal(
    run(source, target, [mapping("ID"), mapping("Value")], {
      blankEqualsNull: false,
    }).differences.length,
    1,
  );
});
test("17 different column order", () => {
  const source = [{ ID: "1", Name: "Ada", Amount: "10" }];
  const target = [{ AmountValue: "10", FullName: "Ada", WorkerID: "1" }];
  const result = run(source, target, [
    mapping("ID", "WorkerID"),
    mapping("Name", "FullName"),
    mapping("Amount", "AmountValue", "Number"),
  ]);
  assert.equal(result.matched, 1);
});
test("18 empty files", () => {
  const result = run([], []);
  assert.deepEqual(
    {
      matched: result.matched,
      compared: result.compared,
      missing: result.missing,
      extra: result.extra,
    },
    { matched: 0, compared: 0, missing: [], extra: [] },
  );
});
test("19 unsupported data types", () =>
  assert.throws(
    () =>
      run(
        [{ ID: "1" }],
        [{ ID: "1" }],
        [
          mapping("ID"),
          { ...mapping("Value"), type: "Object" as Mapping["type"] },
        ],
      ),
    /Unsupported reconciliation data type/,
  ));
test("20 large datasets use indexed lookup", () => {
  const count = 50000;
  const rows = Array.from({ length: count }, (_, index) => ({
    ID: String(index),
    Value: `value-${index}`,
  }));
  const result = run(
    rows,
    rows.map((row) => ({ ...row })),
    [mapping("ID"), mapping("Value")],
  );
  assert.equal(result.matched, count);
  assert.equal(result.lookupStrategy, "indexed-map");
});
test("invalid dates do not normalize into valid dates", () => {
  const result = run(
    [{ ID: "1", Date: "02/30/2024" }],
    [{ ID: "1", Date: "03/01/2024" }],
    [mapping("ID"), mapping("Date", "Date", "Date")],
  );
  assert.equal(result.differences.length, 1);
});
test("composite key definitions require equal lengths", () =>
  assert.throws(
    () =>
      run([{ A: "1", B: "2" }], [{ A: "1", B: "2" }], [mapping("A")], {
        sourceKeys: ["A", "B"],
        targetKeys: ["A"],
      }),
    /same number/,
  ));
