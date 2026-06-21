import fs from "node:fs";
import path from "node:path";

import { stringify } from "csv-stringify/sync";

import type { LabeledPostRow, RawPostRow } from "./types";

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (inQuotes) {
      if (char === "\"") {
        if (content[index + 1] === "\"") {
          field += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    if (char === "\r") {
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export function readCsvRows(filePath: string): RawPostRow[] {
  const content = fs.readFileSync(filePath, "utf8");
  const parsed = parseCsv(content);
  const [header, ...dataRows] = parsed;

  if (!header || !header.length) {
    return [];
  }

  return dataRows
    .filter((row) => row.some((value) => value !== ""))
    .map((row) =>
      header.reduce<Record<string, string>>((record, column, index) => {
        record[column] = row[index] ?? "";
        return record;
      }, {}) as unknown as RawPostRow,
    );
}

function writeCsv(rows: Array<Record<string, string>>, outputPath: string): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, stringify(rows, { header: true }), "utf8");
}

export function writeLabeledCsv(rows: LabeledPostRow[], outputPath: string): void {
  writeCsv(
    rows.map((row) => ({ ...row })),
    outputPath,
  );
}

export function writeReviewSampleCsv(
  rows: LabeledPostRow[],
  outputPath: string,
): void {
  writeCsv(
    rows.map((row) => ({
      site: row.site,
      posted_at: row.posted_at,
      title: row.title,
      matched_queries: row.matched_queries,
      board_name: row.board_name,
      journey_stage: row.journey_stage,
      intent_type: row.intent_type,
      primary_pain_point: row.primary_pain_point,
      secondary_pain_point: row.secondary_pain_point,
      segment_candidate: row.segment_candidate,
      is_relevant: row.is_relevant,
      irrelevant_reason: row.irrelevant_reason,
      severity: row.severity,
      sentiment: row.sentiment,
      evidence_quote: row.evidence_quote,
      url: row.url,
    })),
    outputPath,
  );
}
