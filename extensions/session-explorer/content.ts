type ObjectValue = Record<string, unknown>;

function object(value: unknown): ObjectValue | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? String(value);
}

function code(value: string, language = ""): string {
  const fence = "`".repeat(Math.max(3, ...Array.from(value.matchAll(/`+/g), (match) => match[0].length + 1)));
  return `${fence}${language}\n${value}\n${fence}`;
}

function toolCall(block: ObjectValue): string {
  const name = text(block.name) ?? "unknown";
  const args = object(block.arguments);
  const command = args && text(args.command);
  if (command && (name === "bash" || name === "shell")) {
    const other = { ...args };
    delete other.command;
    return `### Tool call: ${name}\n\n${code(command, "sh")}${Object.keys(other).length ? `\n\nArguments:\n\n${code(json(other), "json")}` : ""}`;
  }
  return `### Tool call: ${name}\n\n${code(json(block.arguments ?? {}), "json")}`;
}

function blockContent(value: unknown): string {
  const block = object(value);
  if (!block) return json(value);
  if (block.type === "text") return text(block.text) ?? "";
  if (block.type === "thinking") return `### Thinking\n\n${text(block.thinking) ?? ""}`;
  if (block.type === "toolCall") return toolCall(block);
  if (block.type === "image") {
    const image = object(block.data);
    return `[Image${text(block.mimeType) || text(image?.mimeType) ? `: ${block.mimeType ?? image?.mimeType}` : ""}]`;
  }
  return code(json(block), "json");
}

function content(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(blockContent).filter(Boolean).join("\n\n");
  return value === undefined ? "" : code(json(value), "json");
}

function messageBody(message: ObjectValue): string {
  if (message.role === "bashExecution") {
    return [`### Command\n\n${code(String(message.command ?? ""), "sh")}`, `### Output\n\n${code(String(message.output ?? ""))}`].join("\n\n");
  }
  return content(message.content) || text(message.summary) || "";
}

function body(record: ObjectValue): string {
  const message = object(record.message);
  if (message) return messageBody(message);
  if (record.type === "context_edit") return record.replacement === null ? "Context entry removed" : content(object(record.replacement)?.content);
  if (record.kind === "value" || record.kind === "list") {
    return record.op === "delete" ? "Deleted value" : content(record.value);
  }
  if (record.type === "model_change") return `Model: ${record.provider ?? ""}/${record.modelId ?? ""}`;
  if (record.type === "thinking_level_change") return `Thinking level: ${record.thinkingLevel ?? ""}`;
  if (record.type === "label") return `Label: ${record.label ?? "(removed)"}`;
  if (record.type === "session_info") return `Session name: ${record.name ?? "(removed)"}`;
  return content(record.content) || text(record.summary) ||
    (record.data !== undefined ? code(json(record.data), "json") : "") ||
    (record.usage !== undefined ? code(json(record.usage), "json") : "") ||
    (record.type === "session" || record.kind === "header" ? "Session header" : "No content");
}

function metadata(record: ObjectValue, line: number, itemIndex?: number): ObjectValue {
  const { message, content: _content, summary: _summary, data: _data, replacement: _replacement,
    systemMessage: _systemMessage, usage: _usage, value: _value, ...rest } = record;
  const messageInfo = object(message);
  if (!messageInfo) return { line, ...(itemIndex === undefined ? {} : { transactionItem: itemIndex + 1 }), ...rest };
  const { content: _messageContent, command: _command, output: _output, summary: _messageSummary,
    sections: _sections, ...messageMetadata } = messageInfo;
  return { line, ...(itemIndex === undefined ? {} : { transactionItem: itemIndex + 1 }), ...rest, message: messageMetadata };
}

export function formatMarkdownRecord(raw: string, line: number, itemIndex?: number): string {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return `---\nline: ${line}\nerror: "Invalid JSON"\n---\n\n${code(raw)}\n`; }
  const record = object(parsed);
  if (!record) return `---\nline: ${line}\n---\n\n${code(json(parsed), "json")}\n`;
  const fields = metadata(record, line, itemIndex);
  const frontMatter = Object.entries(fields).filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n");
  return `---\n${frontMatter}\n---\n\n${body(record).trimEnd()}\n`;
}

function previewContent(value: unknown): string | undefined {
  if (typeof value === "string") return text(value);
  if (!Array.isArray(value)) return undefined;
  const blocks = value.map(object).filter((part): part is ObjectValue => part !== undefined);
  const call = blocks.find((part) => part.type === "toolCall");
  if (call) return text(object(call.arguments)?.command) ?? `${call.name ?? "tool"}: ${json(call.arguments ?? {})}`;
  const plain = blocks.find((part) => part.type === "text");
  if (plain) return text(plain.text);
  const thinking = blocks.find((part) => part.type === "thinking");
  if (thinking) return text(thinking.thinking);
  if (blocks.some((part) => part.type === "image")) return "[Image]";
  return undefined;
}

export function describeRecord(raw: string): string {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return "Invalid JSON"; }
  const record = object(parsed);
  if (!record) return "JSON value";
  const message = object(record.message);
  const kind = record.type ?? record.kind ?? "record";
  const name = [kind, message?.role, record.customType].filter((part) => typeof part === "string").join(" / ");
  const preview = message ? (message.role === "bashExecution" ? text(message.command) :
    previewContent(message.content) ?? text(message.output) ?? text(message.summary)) :
    previewContent(record.content) ?? text(record.summary) ?? text(object(record.data)?.command) ??
    previewContent(record.value) ?? (record.value === undefined ? undefined : json(record.value)) ??
    (record.type === "model_change" ? `${record.provider}/${record.modelId}` : undefined) ??
    (record.type === "thinking_level_change" ? text(record.thinkingLevel) : undefined) ??
    (record.type === "label" ? text(record.label) : undefined) ??
    (record.data !== undefined ? json(record.data) : undefined);
  const brief = preview?.replace(/\s+/g, " ").trim().slice(0, 90);
  return brief ? `${name} · ${brief}` : name;
}
