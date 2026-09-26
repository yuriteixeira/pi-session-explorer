import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { describeRecord } from "./content.ts";

export interface SessionRecord {
  line: number;
  itemIndex?: number;
  raw: string;
  label: string;
}

function entriesOnLine(raw: string, line: number): SessionRecord[] {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return [{ line, raw, label: describeRecord(raw) }]; }
  if (!Array.isArray(parsed)) return [{ line, raw, label: describeRecord(raw) }];
  return parsed.map((entry, itemIndex) => {
    const itemRaw = JSON.stringify(entry) ?? "null";
    return { line, itemIndex, raw: itemRaw, label: describeRecord(itemRaw) };
  });
}

export async function readRecords(path: string): Promise<SessionRecord[]> {
  const stream = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  const records: SessionRecord[] = [];
  let line = 0;
  try {
    for await (const raw of lines) {
      line++;
      if (raw.trim()) records.push(...entriesOnLine(raw, line));
    }
  } finally {
    lines.close();
    stream.destroy();
  }
  return records;
}

export function formatRawRecord(record: SessionRecord): string {
  try {
    return `${JSON.stringify(JSON.parse(record.raw), null, 2)}\n`;
  } catch {
    return `${record.raw}\n`;
  }
}
