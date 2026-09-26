import { basename, join } from "node:path";
import type { SessionRecord } from "./records.ts";

function safeType(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
}

function snapshotType(raw: string): string {
  let record: unknown;
  try { record = JSON.parse(raw); } catch { return "invalid"; }
  if (record === null || typeof record !== "object" || Array.isArray(record)) return "value";
  const entry = record as Record<string, unknown>;
  const message = entry.message;
  if (message && typeof message === "object" && !Array.isArray(message)) {
    const { role, content } = message as Record<string, unknown>;
    if (role === "toolResult") return "toolresult";
    if (role === "bashExecution") return "toolcall";
    if (role === "assistant") {
      if (Array.isArray(content)) {
        if (content.some((block) => block?.type === "toolCall")) return "toolcall";
        if (content.some((block) => block?.type === "text")) return "answer";
        if (content.some((block) => block?.type === "thinking")) return "thinking";
      }
      return "answer";
    }
    if (typeof role === "string") return safeType(role);
  }
  const type = entry.type ?? entry.kind;
  return typeof type === "string" ? safeType(type) : "record";
}

export function snapshotPath(directory: string, sessionPath: string, record: SessionRecord, extension: string): string {
  const session = basename(sessionPath).replace(/\.jsonl$/i, "");
  const position = `turn-${String(record.line).padStart(4, "0")}${record.itemIndex === undefined ? "" : `-item-${record.itemIndex + 1}`}`;
  return join(directory, session, `${position}--${snapshotType(record.raw)}.${extension}`);
}
