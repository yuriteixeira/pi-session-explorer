import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import sessionExplorer from "../extensions/session-viewer/index.ts";

type Notification = { message: string; level: string };
type Handler = (args: string, ctx: ExtensionCommandContext) => Promise<void>;

function commandsFor(path: string | undefined) {
  const commands = new Map<string, Handler>();
  const notifications: Notification[] = [];
  sessionExplorer({ registerCommand: (name: string, command: { handler: Handler }) => {
    commands.set(name, command.handler);
  } } as ExtensionAPI);
  const ctx = {
    mode: "tui",
    sessionManager: { getSessionFile: () => path },
    ui: { notify: (message: string, level: string) => notifications.push({ message, level }) },
  } as unknown as ExtensionCommandContext;
  return { commands, notifications, ctx };
}

test("commands explain when the session file is missing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "explorer-test-"));
  try {
    for (const path of [undefined, join(dir, "missing.jsonl"), dir]) {
      const { commands, notifications, ctx } = commandsFor(path);
      for (const name of ["turns", "last-turn"]) {
        await commands.get(name)!("", ctx);
      }
      assert.deepEqual(notifications.map(({ level }) => level), path ? ["info", "info"] : ["warning", "warning"]);
      assert.ok(notifications.every(({ message }) => message.includes("no JSONL file")));
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a real empty session file reports no records", async () => {
  const dir = await mkdtemp(join(tmpdir(), "explorer-test-"));
  const oldEditor = process.env.EDITOR;
  try {
    const path = join(dir, "session.jsonl");
    await writeFile(path, "");
    process.env.EDITOR = "unused";
    const { commands, notifications, ctx } = commandsFor(path);
    await commands.get("turns")!("", ctx);
    assert.deepEqual(notifications, [{ message: "The session file has no records", level: "info" }]);
  } finally {
    if (oldEditor === undefined) delete process.env.EDITOR;
    else process.env.EDITOR = oldEditor;
    await rm(dir, { recursive: true, force: true });
  }
});
