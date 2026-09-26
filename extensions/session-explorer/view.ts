import { DynamicBorder, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Container, getKeybindings, Input, SelectList, Text, type SelectItem } from "@earendil-works/pi-tui";
import { openRecord } from "./editor.ts";
import type { SessionRecord } from "./records.ts";

export async function browseRecords(ctx: ExtensionContext, records: SessionRecord[], editor: string): Promise<void> {
  const items: SelectItem[] = records.map((record) => ({
    value: `${record.label} #${record.line}`,
    label: `${record.line}: ${record.label}`,
  }));

  const byItem = new Map(items.map((item, index) => [item, records[index]]));
  await ctx.ui.custom<void>((tui, theme, _keys, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((text) => theme.fg("accent", text)));
    container.addChild(new Text(theme.fg("accent", `Session records (${records.length})`)));
    const search = new Input({ prompt: "Search: ", placeholder: "Record type" });
    container.addChild(search);
    const list = new SelectList(items, 12, {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    });
    container.addChild(list);
    container.addChild(new Text(theme.fg("dim", "Type to filter · arrows to move · Enter to open · Esc to clear or close")));
    container.addChild(new DynamicBorder((text) => theme.fg("accent", text)));

    let busy = false;
    list.onCancel = () => {
      if (busy) return;
      if (search.getValue()) {
        search.setValue("");
        list.setFilter("");
      } else done();
    };
    list.onSelect = (item) => {
      if (busy) return;
      busy = true;
      tui.stop();
      void openRecord(byItem.get(item)!, editor)
        .catch((error: unknown) => ctx.ui.notify(`Could not open editor: ${String(error)}`, "error"))
        .finally(() => {
          tui.start();
          tui.requestRender(true);
          busy = false;
        });
    };

    return {
      render: (width: number) => container.render(width),
      invalidate: () => container.invalidate(),
      get focused() { return search.focused; },
      set focused(value: boolean) { search.focused = value; },
      handleInput: (data: string) => {
        if (busy) return;
        const kb = getKeybindings();
        if (kb.matches(data, "tui.select.up") || kb.matches(data, "tui.select.down") ||
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
