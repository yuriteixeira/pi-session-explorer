import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export interface SessionRecord {
  line: number;
  raw: string;
  label: string;
}

function shortText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, 90);
}

export function describeRecord(raw: string): string {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return "Invalid JSON";
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "JSON value";

  const record = value as Record<string, unknown>;
  const message = record.message;
  const role = typeof message === "object" && message !== null && !Array.isArray(message)
    ? (message as Record<string, unknown>).role
    : undefined;
  const kind = record.type ?? record.kind ?? "record";
  const name = [kind, role, record.customType].filter((part) => typeof part === "string").join(" / ");
  const content = typeof message === "object" && message !== null && !Array.isArray(message)
    ? (message as Record<string, unknown>).content
    : undefined;
  const preview = shortText(typeof content === "string" ? content : record.summary);
  return preview ? `${name} · ${preview}` : name;
}

export async function readRecords(path: string): Promise<SessionRecord[]> {
  const stream = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  const records: SessionRecord[] = [];
  let line = 0;
  try {
    for await (const raw of lines) {
      line++;
      if (raw.trim()) records.push({ line, raw, label: describeRecord(raw) });
    }
  } finally {
    lines.close();
    stream.destroy();
  }
  return records;
}

export function formatRecord(record: SessionRecord): string {
  try {
    return `${JSON.stringify(JSON.parse(record.raw), null, 2)}\n`;
  } catch {
    return `${record.raw}\n`;
  }
}
