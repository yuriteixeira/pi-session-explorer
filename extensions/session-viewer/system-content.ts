type Fields = Record<string, unknown>;

function fields(value: unknown): Fields | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Fields : undefined;
}

function fence(value: string, language = ""): string {
  const ticks = "`".repeat(Math.max(3, ...Array.from(value.matchAll(/`+/g), (match) => match[0].length + 1)));
  return `${ticks}${language}\n${value}\n${ticks}`;
}

function unwrap(value: string, tag: string): string {
  const match = value.trim().match(new RegExp(`^<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>$`));
  return match ? match[1] : value.trim();
}

function skillText(value: string): string {
  const source = unwrap(value, "skills");
  const match = source.match(/^([\s\S]*?)<available_skills>\s*([\s\S]*?)\s*<\/available_skills>\s*$/);
  if (!match) return source;
  const entries = [...match[2].matchAll(/\s*<skill>\s*<name>([\s\S]*?)<\/name>\s*<description>([\s\S]*?)<\/description>\s*<location>([\s\S]*?)<\/location>\s*<\/skill>/g)];
  if (!entries.length || entries.map((entry) => entry[0]).join("").trim() !== match[2].trim()) return source;
  return [match[1].trim(), ...entries.map((entry) => `### ${entry[1].trim()}\n\n${entry[2].trim()}\n\nLocation: \`${entry[3].trim()}\``)].filter(Boolean).join("\n\n");
}

function sectionText(key: string, value: string): string {
  if (key === "skills") return skillText(value);
  return unwrap(value, key);
}

function title(key: string): string {
  const names: Record<string, string> = { preamble: "System prompt", cwd: "Working directory" };
  return names[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (char) => char.toUpperCase());
}

function toolsText(value: unknown): string {
  if (!Array.isArray(value) || !value.length) return "";
  return value.map((item, index) => {
    const tool = fields(item);
    if (!tool) return `### Tool ${index + 1}\n\n${fence(JSON.stringify(item, null, 2) ?? String(item), "json")}`;
    const name = typeof tool.name === "string" ? tool.name : `Tool ${index + 1}`;
    const parts = [`### ${name}`];
    if (typeof tool.description === "string") parts.push(tool.description);
    if (tool.parameters !== undefined) parts.push(`Parameters:\n\n${fence(JSON.stringify(tool.parameters, null, 2) ?? String(tool.parameters), "json")}`);
    const extra = { ...tool };
    delete extra.name;
    delete extra.description;
    delete extra.parameters;
    if (Object.keys(extra).length) parts.push(`Other fields:\n\n${fence(JSON.stringify(extra, null, 2), "json")}`);
    return parts.join("\n\n");
  }).join("\n\n");
}

export function formatSystemMessage(message: Fields): string {
  const sections = fields(message.sections);
  const parts: string[] = [];
  if (sections) {
    for (const [key, value] of Object.entries(sections)) {
      if (typeof value === "string" && value.trim()) parts.push(`## ${title(key)}\n\n${sectionText(key, value)}`);
      else if (value !== undefined) parts.push(`## ${title(key)}\n\n${fence(JSON.stringify(value, null, 2) ?? String(value), "json")}`);
    }
  }
  if (typeof message.content === "string" && message.content.trim() && !parts.length) {
    parts.push(`## System prompt\n\n${message.content}`);
  }
  const tools = toolsText(message.toolsAdded);
  if (tools) parts.push(`## Tool definitions\n\n${tools}`);
  return parts.join("\n\n");
}
