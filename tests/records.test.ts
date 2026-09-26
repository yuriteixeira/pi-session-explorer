import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";
import { openRecord } from "../extensions/session-explorer/editor.ts";
import { describeRecord, formatMarkdownRecord } from "../extensions/session-explorer/content.ts";
import { formatRawRecord, lastAssistantRecord, readRecords } from "../extensions/session-explorer/records.ts";
import { snapshotPath } from "../extensions/session-explorer/snapshot.ts";
import { browseRecords, openLastRecord } from "../extensions/session-explorer/view.ts";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

test("uses the session name and requested turn pattern", () => {
  const session = "/sessions/2026-09-26T18-31-46-656Z_01a0defc-d4de-7720-9e35-bf527a68aef2.jsonl";
  const record = { line: 6, raw: '{"type":"message","message":{"role":"assistant","content":[{"type":"toolCall"}]}}', label: "toolcall" };
  assert.equal(snapshotPath("/tmp/pi-session-explorer", session, record, "md"),
    "/tmp/pi-session-explorer/2026-09-26T18-31-46-656Z_01a0defc-d4de-7720-9e35-bf527a68aef2/turn-0006--toolcall.md");
});

test("lists all nonempty JSONL records in file order, including header and invalid JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "explorer-test-"));
  try {
    const path = join(dir, "session.jsonl");
    await writeFile(path, [
      '{"type":"session","id":"one"}',
      "",
      '{"type":"message","message":{"role":"user","content":"hello"}}',
      "not json",
    ].join("\n"));
    const records = await readRecords(path);
    assert.deepEqual(records.map(({ line, label }) => [line, label]), [
      [1, "session"], [3, "message / user · hello"], [4, "Invalid JSON"],
    ]);
    assert.equal(records[1].raw, '{"type":"message","message":{"role":"user","content":"hello"}}');
    assert.equal(formatRawRecord(records[2]), "not json\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("opens each object in a transaction array as its own record", async () => {
  const dir = await mkdtemp(join(tmpdir(), "explorer-test-"));
  try {
    const path = join(dir, "session.jsonl");
    await writeFile(path, '{"v":4,"kind":"header"}\n[{"kind":"entry","type":"message","message":{"role":"user","content":"hi"}},{"kind":"value","op":"set","namespace":"settings","key":"theme","value":"dark"}]\n');
    const records = await readRecords(path);
    assert.deepEqual(records.map(({ line, itemIndex }) => [line, itemIndex]), [[1, undefined], [2, 0], [2, 1]]);
    assert.equal(records[1].label, "message / user · hi");
    assert.match(formatMarkdownRecord(records[1].raw, 2, records[1].itemIndex), /transactionItem: 1[\s\S]*\n---\n\nhi\n$/);
    assert.match(formatMarkdownRecord(records[2].raw, 2, records[2].itemIndex), /\n---\n\ndark\n$/);
    assert.deepEqual(JSON.parse(formatRawRecord(records[2])), { kind: "value", op: "set", namespace: "settings", key: "theme", value: "dark" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("finds the latest assistant message across JSONL lines and transaction items", async () => {
  const dir = await mkdtemp(join(tmpdir(), "explorer-test-"));
  try {
    const path = join(dir, "session.jsonl");
    await writeFile(path, [
      '{"type":"message","message":{"role":"assistant","content":"earlier"}}',
      '[{"kind":"entry","type":"message","message":{"role":"assistant","content":[{"type":"text","text":"latest"}]}},{"kind":"entry","type":"message","message":{"role":"toolResult","content":"done"}}]',
      '{"type":"message","message":{"role":"user","content":"later"}}',
      'not json',
    ].join("\n"));
    const record = lastAssistantRecord(await readRecords(path));
    assert.equal(record?.line, 2);
    assert.equal(record?.itemIndex, 0);
    assert.equal(basename(snapshotPath("/tmp/pi-session-explorer", path, record!, "md")), "turn-0002-item-1--answer.md");
    assert.equal(lastAssistantRecord((await readRecords(path)).slice(2)), undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the turns picker shows newest records first without changing file order", async () => {
  const records = [
    { line: 1, raw: '{}', label: 'header' },
    { line: 2, itemIndex: 0, raw: '{}', label: 'first item' },
    { line: 2, itemIndex: 1, raw: '{}', label: 'second item' },
    { line: 3, raw: '{}', label: 'latest' },
  ];
  let display = '';
  const theme = { fg: (_color: string, text: string) => text };
  const ctx = { ui: { custom: (factory: Function) => new Promise<void>((resolve) => {
    const screen = factory({}, theme, null, resolve);
    display = screen.render(100).join('\n');
    resolve();
  }) } } as unknown as ExtensionContext;
  await browseRecords(ctx, records, 'unused', '/sessions/session.jsonl');
  const labels = ['3: latest', '2.2: second item', '2.1: first item', '1: header'];
  assert.deepEqual(labels.map((label) => display.indexOf(label)).sort((a, b) => a - b),
    labels.map((label) => display.indexOf(label)));
  assert.ok(labels.every((label) => display.includes(label)));
  assert.deepEqual(records.map((record) => record.label), ['header', 'first item', 'second item', 'latest']);
});

test("opens the latest assistant message with the picker file path and restores the terminal", async () => {
  const dir = await mkdtemp(join(tmpdir(), "explorer-test-"));
  try {
    const path = join(dir, `${basename(dir)}.jsonl`);
    const log = join(dir, "opened.txt");
    const script = join(dir, "editor.cjs");
    await writeFile(path, [
      '{"type":"message","message":{"role":"assistant","content":"old"}}',
      '[{"type":"message","message":{"role":"assistant","content":"new"}},{"type":"message","message":{"role":"toolResult","content":"result"}}]',
    ].join("\n"));
    await writeFile(script, `require('node:fs').writeFileSync(${JSON.stringify(log)}, process.argv[2]);`);
    const record = lastAssistantRecord(await readRecords(path))!;
    const events: string[] = [];
    const ctx = { ui: { custom: (factory: Function) => new Promise<void>((resolve) => {
      factory({ stop: () => events.push("stop"), start: () => events.push("start"), requestRender: () => events.push("render") }, null, null, resolve);
    }), notify: () => {} } } as unknown as ExtensionContext;
    await openLastRecord(ctx, record, `${process.execPath} ${script}`, path);
    assert.deepEqual(events, ["stop", "start", "render"]);
    assert.equal(await readFile(log, "utf8"), snapshotPath(join(tmpdir(), "pi-session-explorer"), path, record, "md"));
    assert.match(await readFile(await readFile(log, "utf8"), "utf8"), /\n---\n\nnew\n$/);
  } finally {
    await rm(join(tmpdir(), "pi-session-explorer", basename(dir)), { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true });
  }
});

test("describes new JSONL header records", () => {
  assert.equal(describeRecord('{"v":4,"kind":"header"}'), "header");
});

test("editor shows plain tool output in Markdown and preserves color codes in raw JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "explorer-test-"));
  try {
    const output = join(dir, "viewed");
    const script = join(dir, "editor.cjs");
    const colored = "\u001b[32mgreen\u001b[0m";
    const raw = JSON.stringify({ type: "message", message: { role: "toolResult", content: [{ type: "text", text: colored }] } });
    await writeFile(script, `require('node:fs').copyFileSync(process.argv[2], ${JSON.stringify(output)});`);
    const record = { line: 1, raw, label: "toolResult" };
    const session = join(dir, `${basename(dir)}.jsonl`);
    await openRecord(record, `${process.execPath} ${script}`, "markdown", session);
    assert.match(await readFile(output, "utf8"), /\n---\n\ngreen\n$/);
    await openRecord(record, `${process.execPath} ${script}`, "raw", session);
    assert.equal(JSON.parse(await readFile(output, "utf8")).message.content[0].text, colored);
  } finally {
    await rm(join(tmpdir(), "pi-session-explorer", basename(dir)), { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true });
  }
});

test("saves snapshots under the session name with a padded turn and content type", async () => {
  const dir = await mkdtemp(join(tmpdir(), "explorer-test-"));
  try {
    const pathLog = join(dir, "path.txt");
    const script = join(dir, "editor.cjs");
    await writeFile(script, `require('node:fs').writeFileSync(${JSON.stringify(pathLog)}, process.argv[2]);`);
    const session = join(dir, `${basename(dir)}.jsonl`);
    const examples = [
      [{ type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "bash" }] } }, "toolcall"],
      [{ type: "message", message: { role: "toolResult", content: "done" } }, "toolresult"],
      [{ type: "message", message: { role: "assistant", content: [{ type: "thinking", thinking: "hmm" }] } }, "thinking"],
      [{ type: "message", message: { role: "assistant", content: [{ type: "text", text: "done" }] } }, "answer"],
      [{ type: "message", message: { role: "user", content: "hi" } }, "user"],
    ] as const;
    for (const [entry, kind] of examples) {
      await openRecord({ line: 12, itemIndex: 1, raw: JSON.stringify(entry), label: "test" }, `${process.execPath} ${script}`, "markdown", session);
      const file = await readFile(pathLog, "utf8");
      assert.equal(dirname(file), join(tmpdir(), "pi-session-explorer", basename(dir)));
      assert.equal(basename(file), `turn-0012-item-2--${kind}.md`);
      assert.match(await readFile(file, "utf8"), /line: 12/);
    }
    await openRecord({ line: 2, raw: JSON.stringify(examples[1][0]), label: "test" }, `${process.execPath} ${script}`, "raw", session);
    assert.equal(basename(await readFile(pathLog, "utf8")), "turn-0002--toolresult.json");
  } finally {
    await rm(join(tmpdir(), "pi-session-explorer", basename(dir)), { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true });
  }
});

test("preserves edits on later visits without changing the session file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "explorer-test-"));
  try {
    const source = join(dir, `${basename(dir)}.jsonl`);
    const output = join(dir, "viewed.json");
    const script = join(dir, "editor.cjs");
    const raw = '{"type":"message","message":{"role":"user","content":"hi"}}';
    await writeFile(source, `${raw}\n`);
    await writeFile(script, `const fs = require('node:fs'); fs.copyFileSync(process.argv[2], ${JSON.stringify(output)}); fs.writeFileSync(process.argv[2], 'changed');`);
    const record = { line: 1, raw, label: "message" };
    await openRecord(record, `${process.execPath} ${script}`, "markdown", source);
    assert.equal(await readFile(source, "utf8"), `${raw}\n`);
    assert.match(await readFile(output, "utf8"), /---\nline: 1\ntype: "message"/);
    assert.match(await readFile(output, "utf8"), /\n---\n\nhi\n$/);
    const saved = join(tmpdir(), "pi-session-explorer", basename(dir), "turn-0001--user.md");
    assert.equal(await readFile(saved, "utf8"), "changed");
    await openRecord(record, `${process.execPath} ${script}`, "markdown", source);
    assert.equal(await readFile(output, "utf8"), "changed");
    await openRecord(record, `${process.execPath} ${script}`, "raw", source);
    assert.equal(JSON.parse(await readFile(output, "utf8")).type, "message");
    assert.equal(await readFile(source, "utf8"), `${raw}\n`);
  } finally {
    await rm(join(tmpdir(), "pi-session-explorer", basename(dir)), { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true });
  }
});
