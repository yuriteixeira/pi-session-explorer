import { spawn } from "node:child_process";
import { lstat, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { formatMarkdownRecord } from "./content.ts";
import { formatRawRecord, type SessionRecord } from "./records.ts";
import { snapshotPath } from "./snapshot.ts";

export type RecordView = "markdown" | "raw";

async function ensurePrivateDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0) {
    throw new Error(`Unsafe snapshot directory: ${directory}`);
  }
}

async function ensureSnapshot(file: string, contents: string): Promise<void> {
  try {
    await writeFile(file, contents, { mode: 0o600, flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const info = await lstat(file);
  if (!info.isFile() || info.uid !== process.getuid?.()) {
    throw new Error(`Unsafe snapshot file: ${file}`);
  }
}

function runEditor(command: string, file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // The editor setting is a trusted shell command. The file path is passed as
    // a positional argument so its contents cannot be interpreted as shell code.
    const child = spawn("sh", ["-c", `exec ${command} "$1"`, "sh", file], { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Editor exited with ${signal ?? `status ${code}`}`));
    });
  });
}

export async function openRecord(record: SessionRecord, editor: string, view: RecordView = "markdown", sessionPath = "session.jsonl"): Promise<void> {
  const directory = join(tmpdir(), "pi-session-explorer");
  await ensurePrivateDirectory(directory);
  const file = snapshotPath(directory, sessionPath, record, view === "raw" ? "json" : "md");
  await ensurePrivateDirectory(dirname(file));
  const contents = view === "raw" ? formatRawRecord(record) : formatMarkdownRecord(record.raw, record.line, record.itemIndex);
  await ensureSnapshot(file, contents);
  await runEditor(editor, file);
}
