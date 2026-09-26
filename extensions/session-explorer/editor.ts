import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatRecord, type SessionRecord } from "./records.ts";

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

export async function openRecord(record: SessionRecord, editor: string): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "pi-session-explorer-"));
  try {
    const file = join(directory, `line-${record.line}.json`);
    await writeFile(file, formatRecord(record), { mode: 0o600 });
    await runEditor(editor, file);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
