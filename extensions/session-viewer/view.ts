import { DynamicBorder, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Container, getKeybindings, Input, Key, matchesKey, SelectList, Text, truncateToWidth, type SelectItem } from "@earendil-works/pi-tui";
import { openRecord, type RecordView } from "./editor.ts";
import { navigateList } from "./navigation.ts";
import type { SessionRecord } from "./records.ts";

export async function openLastRecord(ctx: ExtensionContext, record: SessionRecord, editor: string, sessionPath: string): Promise<void> {
  await ctx.ui.custom<void>((tui, _theme, _keys, done) => {
    tui.stop();
    void openRecord(record, editor, "markdown", sessionPath)
      .catch((error: unknown) => ctx.ui.notify(`Could not open editor: ${String(error)}`, "error"))
      .finally(() => {
        tui.start();
        tui.requestRender(true);
        done();
      });
    return { render: () => [], invalidate: () => {} };
  });
}

function alignedLabel(label: string): string {
  return label.replace(/^(message \/ )([^·]+?)( · )/, (_match, prefix: string, role: string, separator: string) =>
    `${prefix}${role.padEnd(10)}${separator}`);
}

function endsAssistantTurn(raw: string): boolean {
  try {
    const record = JSON.parse(raw);
    return record?.message?.role === "assistant" && record.message.stopReason === "stop";
  } catch {
    return false;
  }
}

export async function browseRecords(ctx: ExtensionContext, records: SessionRecord[], editor: string, sessionPath: string): Promise<void> {
  const newestFirst = [...records].reverse();
  const items: SelectItem[] = newestFirst.map((record) => ({
    value: `${record.label} #${record.line}${record.itemIndex === undefined ? "" : `.${record.itemIndex + 1}`}`,
    label: `${record.line}${record.itemIndex === undefined ? "" : `.${record.itemIndex + 1}`}: ${alignedLabel(record.label)}`,
  }));

  const byItem = new Map(items.map((item, index) => [item, newestFirst[index]]));
  const completed = new Set(items.filter((item) => endsAssistantTurn(byItem.get(item)!.raw)));
  const pageSize = 12;
  await ctx.ui.custom<void>((tui, theme, _keys, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((text) => theme.fg("accent", text)));
    container.addChild(new Text(theme.fg("accent", `Session records (${records.length})`)));
    const search = new Input({ prompt: "Search: ", placeholder: "Record type" });
    container.addChild(search);
    const list = new SelectList(items, pageSize, {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    }, {
      truncatePrimary: ({ text, maxWidth, item }) => {
        const visible = truncateToWidth(text, maxWidth, "");
        if (!completed.has(item)) return visible;
        const prefix = visible.match(/^\d+(?:\.\d+)?: /)?.[0] ?? "";
        return `${prefix}\x1b[1;97m${visible.slice(prefix.length)}\x1b[0m`;
      },
    });
    container.addChild(list);
    container.addChild(new Text(theme.fg("dim", "Filter · arrows to move · PgUp/PgDn or Ctrl+B/F: page · Home/End: first/last · Enter: Markdown · Ctrl+R: raw JSON · Esc: clear or close")));
    container.addChild(new DynamicBorder((text) => theme.fg("accent", text)));

    let busy = false;
    list.onCancel = () => {
      if (busy) return;
      if (search.getValue()) {
        search.setValue("");
        list.setFilter("");
      } else done();
    };
    const launch = (item: SelectItem | undefined, view: RecordView) => {
      if (busy || !item) return;
      busy = true;
      tui.stop();
      void openRecord(byItem.get(item)!, editor, view, sessionPath)
        .catch((error: unknown) => ctx.ui.notify(`Could not open editor: ${String(error)}`, "error"))
        .finally(() => {
          tui.start();
          tui.requestRender(true);
          busy = false;
        });
    };
    list.onSelect = (item) => launch(item, "markdown");

    return {
      render: (width: number) => container.render(width),
      invalidate: () => container.invalidate(),
      get focused() { return search.focused; },
      set focused(value: boolean) { search.focused = value; },
      handleInput: (data: string) => {
        if (busy) return;
        const kb = getKeybindings();
        if (matchesKey(data, Key.ctrl("r"))) {
          launch(list.getSelectedItem() ?? undefined, "raw");
        } else if (navigateList(list, items, search.getValue(), data, pageSize)) {
          // Navigation changes the list selection without editing the search text.
        } else if (kb.matches(data, "tui.select.up") || kb.matches(data, "tui.select.down") ||
            kb.matches(data, "tui.select.confirm") || kb.matches(data, "tui.select.cancel")) {
          list.handleInput(data);
        } else {
          search.handleInput(data);
          list.setFilter(search.getValue());
        }
        tui.requestRender();
      },
    };
  });
}
