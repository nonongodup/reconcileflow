import type { Dataset, Row } from "./file-parsers";

export type DataType = "Text" | "Number" | "Date" | "Boolean";
export type Mapping = {
  source: string;
  target: string;
  type: DataType;
  include: boolean;
  tolerance?: number;
};
export type ReconciliationOptions = {
  preserveLeadingZeros?: boolean;
  sourceKeys?: string[];
  targetKeys?: string[];
  caseInsensitiveText?: boolean;
  trimWhitespace?: boolean;
  blankEqualsNull?: boolean;
  numericTolerance?: number;
};
export type Difference = {
  key: string;
  sourceRow: number;
  targetRow: number;
  sourceColumn: string;
  targetColumn: string;
  sourceValue: string;
  targetValue: string;
  normalizedSource: string;
  normalizedTarget: string;
  reason: string;
};
export type Result = {
  matched: number;
  missing: Row[];
  extra: Row[];
  differences: Difference[];
  duplicateKeys: { key: string; file: string; rows: number[] }[];
  invalidKeys: { file: string; row: number; value: string }[];
  compared: number;
  lookupStrategy: "indexed-map";
};

const SUPPORTED_TYPES = new Set<DataType>([
  "Text",
  "Number",
  "Date",
  "Boolean",
]);

function assertType(type: string): asserts type is DataType {
  if (!SUPPORTED_TYPES.has(type as DataType))
    throw new Error(`Unsupported reconciliation data type: ${type}`);
}

function inputText(value: unknown, trimWhitespace: boolean) {
  const text = value === null || value === undefined ? "" : String(value);
  return trimWhitespace ? text.trim() : text;
}

function normalizedDate(value: string) {
  let year: number, month: number, day: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(value);
  if (match) [, year, month, day] = match.map(Number);
  else {
    match = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/.exec(value);
    if (!match) return `invalid-date:${value.toLocaleLowerCase()}`;
    month = Number(match[1]);
    day = Number(match[2]);
    year = Number(match[3]);
    if (match[3].length === 2) year += year >= 70 ? 1900 : 2000;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return `invalid-date:${value.toLocaleLowerCase()}`;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalize(
  value: unknown,
  type: DataType,
  options: ReconciliationOptions = {},
) {
  assertType(type);
  const trimWhitespace = options.trimWhitespace ?? true;
  const caseInsensitiveText = options.caseInsensitiveText ?? true;
  const preserveLeadingZeros = options.preserveLeadingZeros ?? false;
  if (value === null || value === undefined)
    return options.blankEqualsNull === false ? "__NULL__" : "";
  let text = inputText(value, trimWhitespace);
  if (type === "Number") {
    const percent = text.includes("%");
    const cleaned = text
      .replace(/[,$€£¥%\s]/g, "")
      .replace(/^\((.*)\)$/, "-$1");
    if (!cleaned) return "";
    const number = Number(cleaned);
    return Number.isFinite(number)
      ? String(percent ? number / 100 : number)
      : `invalid-number:${text.toLocaleLowerCase()}`;
  }
  if (type === "Date") return text ? normalizedDate(text) : "";
  if (type === "Boolean") {
    const lower = text.toLocaleLowerCase();
    if (["true", "yes", "y", "1"].includes(lower)) return "true";
    if (["false", "no", "n", "0"].includes(lower)) return "false";
    return text ? `invalid-boolean:${lower}` : "";
  }
  if (caseInsensitiveText) text = text.toLocaleLowerCase();
  return preserveLeadingZeros ? text : text.replace(/^0+(?=\d)/, "");
}

function valuesEqual(
  source: unknown,
  target: unknown,
  mapping: Mapping,
  options: ReconciliationOptions,
) {
  const normalizedSource = normalize(source, mapping.type, options);
  const normalizedTarget = normalize(target, mapping.type, options);
  const tolerance = mapping.tolerance ?? options.numericTolerance ?? 0;
  if (
    mapping.type === "Number" &&
    tolerance > 0 &&
    !normalizedSource.startsWith("invalid-") &&
    !normalizedTarget.startsWith("invalid-")
  ) {
    const sourceNumber = Number(normalizedSource),
      targetNumber = Number(normalizedTarget);
    if (Number.isFinite(sourceNumber) && Number.isFinite(targetNumber))
      return {
        equal: Math.abs(sourceNumber - targetNumber) <= tolerance,
        normalizedSource,
        normalizedTarget,
      };
  }
  return {
    equal: normalizedSource === normalizedTarget,
    normalizedSource,
    normalizedTarget,
  };
}

export function reconcile(
  source: Dataset,
  target: Dataset,
  mappings: Mapping[],
  preserveZerosOrOptions: boolean | ReconciliationOptions = false,
): Result {
  if (!mappings.length)
    throw new Error("At least one column mapping is required.");
  mappings.forEach((mapping) => assertType(mapping.type));
  const options: ReconciliationOptions =
    typeof preserveZerosOrOptions === "boolean"
      ? { preserveLeadingZeros: preserveZerosOrOptions }
      : preserveZerosOrOptions;
  const sourceKeys = options.sourceKeys?.length
    ? options.sourceKeys
    : [mappings[0].source];
  const targetKeys = options.targetKeys?.length
    ? options.targetKeys
    : [mappings[0].target];
  if (sourceKeys.length !== targetKeys.length)
    throw new Error(
      "Source and target composite keys must contain the same number of columns.",
    );

  type IndexedRow = { row: Row; index: number; displayKey: string };
  const buildIndex = (rows: Row[], columns: string[], file: string) => {
    const map = new Map<string, IndexedRow[]>();
    const invalid: { file: string; row: number; value: string }[] = [];
    rows.forEach((row, index) => {
      const parts = columns.map((column) =>
        normalize(row[column], "Text", options),
      );
      const displayParts = columns.map((column) =>
        inputText(row[column], options.trimWhitespace ?? true),
      );
      if (parts.some((part) => part === "" || part === "__NULL__")) {
        invalid.push({ file, row: index + 2, value: displayParts.join(" | ") });
        return;
      }
      const canonicalKey = JSON.stringify(parts);
      const indexed = {
        row,
        index: index + 2,
        displayKey: displayParts.join(" | "),
      };
      const existing = map.get(canonicalKey);
      if (existing) existing.push(indexed);
      else map.set(canonicalKey, [indexed]);
    });
    return { map, invalid };
  };

  const sourceIndex = buildIndex(source.rows, sourceKeys, "Source");
  const targetIndex = buildIndex(target.rows, targetKeys, "Target");
  const missing: Row[] = [],
    extra: Row[] = [],
    differences: Difference[] = [];
  let matched = 0,
    compared = 0;
  sourceIndex.map.forEach((sourceMatches, canonicalKey) => {
    if (sourceMatches.length > 1) return;
    const targetMatches = targetIndex.map.get(canonicalKey);
    if (!targetMatches) {
      missing.push(sourceMatches[0].row);
      return;
    }
    if (targetMatches.length > 1) return;
    compared++;
    let different = false;
    mappings
      .filter((mapping) => mapping.include)
      .forEach((mapping) => {
        const comparison = valuesEqual(
          sourceMatches[0].row[mapping.source],
          targetMatches[0].row[mapping.target],
          mapping,
          options,
        );
        if (!comparison.equal) {
          different = true;
          const sourceValue = inputText(
            sourceMatches[0].row[mapping.source],
            false,
          );
          const targetValue = inputText(
            targetMatches[0].row[mapping.target],
            false,
          );
          differences.push({
            key: sourceMatches[0].displayKey,
            sourceRow: sourceMatches[0].index,
            targetRow: targetMatches[0].index,
            sourceColumn: mapping.source,
            targetColumn: mapping.target,
            sourceValue,
            targetValue,
            normalizedSource: comparison.normalizedSource,
            normalizedTarget: comparison.normalizedTarget,
            reason: !comparison.normalizedSource
              ? "Source value is blank"
              : !comparison.normalizedTarget
                ? "Target value is blank"
                : mapping.type === "Number"
                  ? "Numeric values differ"
                  : mapping.type === "Date"
                    ? "Dates differ"
                    : "Values differ",
          });
        }
      });
    if (!different) matched++;
  });
  targetIndex.map.forEach((targetMatches, canonicalKey) => {
    if (targetMatches.length === 1 && !sourceIndex.map.has(canonicalKey))
      extra.push(targetMatches[0].row);
  });
  const duplicates = (index: Map<string, IndexedRow[]>, file: string) =>
    [...index.values()]
      .filter((values) => values.length > 1)
      .map((values) => ({
        key: values[0].displayKey,
        file,
        rows: values.map((value) => value.index),
      }));
  return {
    matched,
    missing,
    extra,
    differences,
    duplicateKeys: [
      ...duplicates(sourceIndex.map, "Source"),
      ...duplicates(targetIndex.map, "Target"),
    ],
    invalidKeys: [...sourceIndex.invalid, ...targetIndex.invalid],
    compared,
    lookupStrategy: "indexed-map",
  };
}
