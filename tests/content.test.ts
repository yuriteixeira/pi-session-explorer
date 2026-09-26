import assert from "node:assert/strict";
import { test } from "node:test";
import { describeRecord, formatMarkdownRecord } from "../extensions/session-explorer/content.ts";

function view(record: object): string {
  return formatMarkdownRecord(JSON.stringify(record), 12);
}

test("puts record and message metadata before user content", () => {
  const markdown = view({ type: "message", id: "m1", timestamp: "2026-01-01", message: {
    role: "user", timestamp: 123, content: [{ type: "text", text: "# Hello\nworld" }],
  } });
  assert.match(markdown, /^---\nline: 12\ntype: "message"\nid: "m1"\ntimestamp: "2026-01-01"\nmessage: \{"role":"user","timestamp":123\}\n---\n\n# Hello\nworld\n$/);
  assert.doesNotMatch(markdown.split("---")[1], /Hello/);
});

test("shows thinking, tool commands and text in message order; picker favors command", () => {
  const record = { type: "message", message: { role: "assistant", content: [
    { type: "thinking", thinking: "Reasoning here", thinkingSignature: "private" },
    { type: "toolCall", name: "bash", id: "tool-1", arguments: { command: "echo hello", timeout: 20 } },
    { type: "text", text: "Done." },
  ] } };
  const markdown = view(record);
  assert.ok(markdown.indexOf("Reasoning here") < markdown.indexOf("echo hello"));
  assert.ok(markdown.indexOf("echo hello") < markdown.indexOf("Done."));
  assert.match(markdown, /```sh\necho hello\n```/);
  assert.match(markdown, /"timeout": 20/);
  assert.equal(describeRecord(JSON.stringify(record)), "message / assistant · echo hello");
  assert.doesNotMatch(markdown, /thinkingSignature/);
});

test("shows tool results, shell execution, summaries and custom entry data", () => {
  const result = { type: "message", message: { role: "toolResult", toolName: "bash", content: [{ type: "text", text: "first\nsecond" }] } };
  assert.match(view(result), /\n---\n\nfirst\nsecond\n$/);
  assert.equal(describeRecord(JSON.stringify(result)), "message / toolResult · first second");
  const bash = { type: "message", message: { role: "bashExecution", command: "ls -la", output: "file.txt" } };
  assert.match(view(bash), /### Command\n\n```sh\nls -la\n```\n\n### Output\n\n```\nfile.txt\n```/);
  assert.equal(describeRecord(JSON.stringify(bash)), "message / bashExecution · ls -la");
  assert.match(view({ type: "compaction", summary: "Prior context" }), /\n---\n\nPrior context\n$/);
  assert.match(view({ type: "custom", customType: "notes", data: { key: "value" } }), /```json\n\{\n  "key": "value"\n\}\n```/);
});

test("invalid lines remain viewable and code fences cannot be closed by content", () => {
  assert.match(formatMarkdownRecord("invalid", 5), /error: "Invalid JSON"[\s\S]*invalid/);
  const markdown = view({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "bash", arguments: { command: "echo '```'" } }] } });
  assert.match(markdown, /````sh\necho '```'\n````/);
});
