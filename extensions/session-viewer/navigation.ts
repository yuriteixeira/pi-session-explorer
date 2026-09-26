import { Key, matchesKey, type SelectItem, type SelectList } from "@earendil-works/pi-tui";

export function navigateList(
  list: SelectList,
  items: SelectItem[],
  filter: string,
  data: string,
  pageSize: number,
): boolean {
  const pageUp = matchesKey(data, Key.pageUp) || matchesKey(data, Key.ctrl("b"));
  const pageDown = matchesKey(data, Key.pageDown) || matchesKey(data, Key.ctrl("f"));
  const home = matchesKey(data, Key.home);
  const end = matchesKey(data, Key.end);
  if (!pageUp && !pageDown && !home && !end) return false;

  const filtered = items.filter((item) => item.value.toLowerCase().startsWith(filter.toLowerCase()));
  if (filtered.length === 0) return true;

  const index = filtered.indexOf(list.getSelectedItem()!);
  const target = home ? 0 : end ? filtered.length - 1 : index + (pageUp ? -pageSize : pageSize);
  list.setSelectedIndex(Math.max(0, Math.min(target, filtered.length - 1)));
  return true;
}
