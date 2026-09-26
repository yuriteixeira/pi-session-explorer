import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openRecord } from "../extensions/session-explorer/editor.ts";
import { describeRecord, formatRecord, readRecords } from "../extensions/session-explorer/records.ts";

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
    assert.equal(formatRecord(records[2]), "not json\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("describes new JSONL header records", () => {
  assert.equal(describeRecord('{"v":4,"kind":"header"}'), "header");
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
    assert.equal(JSON.parse(await readFile(output, "utf8")).type, "message");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
