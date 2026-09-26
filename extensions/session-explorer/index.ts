import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { lastAssistantRecord, readRecords } from "./records.ts";
import { browseRecords, openLastRecord } from "./view.ts";

async function explore(ctx: ExtensionCommandContext, lastOnly = false): Promise<void> {
  if (ctx.mode !== "tui") {
    ctx.ui.notify("Session explorer needs the interactive terminal", "warning");
    return;
  }
  const path = ctx.sessionManager.getSessionFile();
  if (!path) {
    ctx.ui.notify("This session has no JSONL file", "warning");
    return;
  }
  const editor = process.env.EDITOR?.trim();
  if (!editor) {
    ctx.ui.notify("Set $EDITOR before starting Pi to open session records", "warning");
    return;
  }
  try {
    const records = await readRecords(path);
    if (records.length === 0) {
      ctx.ui.notify("The session file has no records", "info");
      return;
    }
    if (lastOnly) {
      const record = lastAssistantRecord(records);
      if (!record) {
        ctx.ui.notify("This session has no assistant message", "info");
        return;
      }
      await openLastRecord(ctx, record, editor, path);
    } else {
      await browseRecords(ctx, records, editor, path);
    }
  } catch (error) {
    ctx.ui.notify(`Could not read session records: ${String(error)}`, "error");
  }
}

export default function sessionExplorer(pi: ExtensionAPI): void {
  pi.registerCommand("turns", {
    description: "Browse all JSONL records in this session and view them in $EDITOR",
    handler: async (_args, ctx) => explore(ctx),
  });
  pi.registerCommand("last-turn", {
    description: "Open the last assistant message in $EDITOR",
    handler: async (_args, ctx) => explore(ctx, true),
  });
}
