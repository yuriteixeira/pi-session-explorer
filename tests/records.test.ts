import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openRecord } from "../extensions/session-explorer/editor.ts";
import { describeRecord, formatMarkdownRecord } from "../extensions/session-explorer/content.ts";
import { formatRawRecord, readRecords } from "../extensions/session-explorer/records.ts";

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
    await openRecord(record, `${process.execPath} ${script}`);
    assert.match(await readFile(output, "utf8"), /\n---\n\ngreen\n$/);
    await openRecord(record, `${process.execPath} ${script}`, "raw");
    assert.equal(JSON.parse(await readFile(output, "utf8")).message.content[0].text, colored);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("opens an isolated temporary copy and removes it after editor exit", async () => {
  const dir = await mkdtemp(join(tmpdir(), "explorer-test-"));
  try {
    const source = join(dir, "source.jsonl");
    const output = join(dir, "viewed.json");
    const script = join(dir, "editor.cjs");
    const raw = '{"type":"message","message":{"role":"user","content":"hi"}}';
    await writeFile(source, `${raw}\n`);
    await writeFile(script, `const fs = require('node:fs'); fs.copyFileSync(process.argv[2], ${JSON.stringify(output)}); fs.writeFileSync(process.argv[2], 'changed');`);
    await openRecord({ line: 1, raw, label: "message" }, `${process.execPath} ${script}`);
    assert.equal(await readFile(source, "utf8"), `${raw}\n`);
    assert.match(await readFile(output, "utf8"), /---\nline: 1\ntype: "message"/);
    assert.match(await readFile(output, "utf8"), /\n---\n\nhi\n$/);
    await openRecord({ line: 1, raw, label: "message" }, `${process.execPath} ${script}`, "raw");
    assert.equal(JSON.parse(await readFile(output, "utf8")).type, "message");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
