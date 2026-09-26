import assert from "node:assert/strict";
import { test } from "node:test";
import { SelectList, type SelectItem } from "@earendil-works/pi-tui";
import { navigateList } from "../extensions/session-viewer/navigation.ts";

const items: SelectItem[] = Array.from({ length: 30 }, (_, index) => ({
  value: `${index % 2 ? "other" : "record"} #${index}`,
  label: `Record ${index}`,
}));
const theme = {
  selectedPrefix: (text: string) => text,
  selectedText: (text: string) => text,
  description: (text: string) => text,
  scrollInfo: (text: string) => text,
  noMatch: (text: string) => text,
};

function createList(filter = ""): SelectList {
  const list = new SelectList(items, 12, theme);
  list.setFilter(filter);
  return list;
}

test("page keys move by visible rows and stop at boundaries", () => {
  const list = createList();
  assert.equal(navigateList(list, items, "", "\x1b[6~", 12), true);
  assert.equal(list.getSelectedItem(), items[12]);
  navigateList(list, items, "", "\x1b[6~", 12);
  navigateList(list, items, "", "\x1b[6~", 12);
  assert.equal(list.getSelectedItem(), items[29]);
  navigateList(list, items, "", "\x1b[5~", 12);
  assert.equal(list.getSelectedItem(), items[17]);
  navigateList(list, items, "", "\x1b[H", 12);
  assert.equal(list.getSelectedItem(), items[0]);
  navigateList(list, items, "", "\x1b[5~", 12);
  assert.equal(list.getSelectedItem(), items[0]);
  navigateList(list, items, "", "\x1b[F", 12);
  assert.equal(list.getSelectedItem(), items[29]);
});

test("control F and control B move by pages", () => {
  const list = createList();
  assert.equal(navigateList(list, items, "", "\x06", 12), true);
  assert.equal(list.getSelectedItem(), items[12]);
  navigateList(list, items, "", "\x02", 12);
  assert.equal(list.getSelectedItem(), items[0]);

  list.setFilter("record");
  navigateList(list, items, "record", "\x06", 12);
  assert.equal(list.getSelectedItem(), items[24]);
  navigateList(list, items, "record", "\x02", 12);
  assert.equal(list.getSelectedItem(), items[0]);
});

test("navigation uses the filtered list and leaves unrelated keys alone", () => {
  const list = createList("record");
  navigateList(list, items, "record", "\x1b[F", 12);
  assert.equal(list.getSelectedItem(), items[28]);
  navigateList(list, items, "record", "\x1b[5~", 12);
  assert.equal(list.getSelectedItem(), items[4]);
  assert.equal(navigateList(list, items, "record", "x", 12), false);
  assert.equal(list.getSelectedItem(), items[4]);
  list.setFilter("missing");
  assert.equal(navigateList(list, items, "missing", "\x1b[F", 12), true);
  assert.equal(list.getSelectedItem(), null);
});
