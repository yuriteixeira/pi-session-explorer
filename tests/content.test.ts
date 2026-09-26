import assert from "node:assert/strict";
import { test } from "node:test";
import { describeRecord, formatMarkdownRecord } from "../extensions/session-viewer/content.ts";

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

test("maps system sections, skills and tool definitions to Markdown headings", () => {
  const markdown = view({ type: "message", message: { role: "system", content: "", sections: {
    preamble: "You are an assistant.",
    rules: "<rules>\n- Be clear\n</rules>",
    skills: "<skills>\nRead the skills.\n<available_skills>\n<skill>\n<name>planning</name>\n<description>Plan the work.</description>\n<location>/skills/planning/SKILL.md</location>\n</skill>\n</available_skills>\n</skills>",
    cwd: "<cwd>\n/work\n</cwd>",
  }, toolsAdded: [{ name: "read", description: "Read files.", parameters: { type: "object", properties: { path: { type: "string" } } } }] } });
  assert.match(markdown, /## System prompt\n\nYou are an assistant\./);
  assert.match(markdown, /## Rules\n\n- Be clear/);
  assert.match(markdown, /## Skills\n\nRead the skills\.\n\n### planning\n\nPlan the work\.\n\nLocation: `\/skills\/planning\/SKILL\.md`/);
  assert.match(markdown, /## Working directory\n\n\/work/);
  assert.match(markdown, /## Tool definitions\n\n### read\n\nRead files\.\n\nParameters:\n\n```json/);
  assert.ok(markdown.indexOf("## Skills") < markdown.indexOf("## Tool definitions"));
  assert.doesNotMatch(markdown.split("---")[1], /toolsAdded|sections/);
  assert.doesNotMatch(markdown, /<available_skills>|<rules>|<cwd>/);
});

test("system records without sections retain content and unusual sections remain visible", () => {
  assert.match(view({ type: "message", message: { role: "system", content: "Plain prompt" } }), /## System prompt\n\nPlain prompt\n$/);
  assert.match(view({ type: "message", message: { role: "system", sections: { custom: "<custom>keep this</custom>" }, toolsAdded: [] } }), /## Custom\n\nkeep this\n$/);
  assert.match(view({ type: "message", message: { role: "system", sections: { skills: "<skills>\n<available_skills>unexpected</available_skills>\n</skills>" } } }), /<available_skills>unexpected<\/available_skills>/);
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

test("removes color codes from tool output in Markdown only", () => {
  const colored = "\u001b[31mred\u001b[0m and \u001b[38:2:10:20:30mblue\u001b[m";
  const result = { type: "message", message: { role: "toolResult", content: [{ type: "text", text: colored }] } };
  assert.match(view(result), /\n---\n\nred and blue\n$/);
  assert.doesNotMatch(view(result), /\u001b/);

  const bash = { type: "message", message: { role: "bashExecution", command: "echo color", output: colored } };
  assert.match(view(bash), /### Output\n\n```\nred and blue\n```/);
  assert.doesNotMatch(view(bash), /\u001b/);

  const user = { type: "message", message: { role: "user", content: colored } };
  assert.match(view(user), /\u001b\[31mred/);
});

test("invalid lines remain viewable and code fences cannot be closed by content", () => {
  assert.match(formatMarkdownRecord("invalid", 5), /error: "Invalid JSON"[\s\S]*invalid/);
  const markdown = view({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "bash", arguments: { command: "echo '```'" } }] } });
  assert.match(markdown, /````sh\necho '```'\n````/);
});
