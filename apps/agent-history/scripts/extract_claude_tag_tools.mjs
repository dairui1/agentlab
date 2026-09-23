import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const revision = "e033699f9f4ab0e5262a919f03533327a2ff6269";
export const artifact = "captures/claude-tag/2026-09-22/variants/default/prompt.md";
export const digest = "bb32c8dcfb5fb0a73b8d201ef479312b04f3982fee9baf4474702e87dd95bc50";
export function extractTools(prompt) {
  const lines = prompt.replace(/\n$/, "").split("\n");
  const start = lines.indexOf("# Tools");
  if (start < 0) throw new Error("Missing Tools section");
  const headings = lines.flatMap((line, index) => index > start && /^## [^#]/.test(line) ? [index] : []);
  return headings.map((index, i) => {
    const end = headings[i + 1] ?? lines.length;
    const body = lines.slice(index + 1, end).join("\n").trim();
    // Examples can contain multiple JSON objects; the final fence is the schema.
    const fence = [...body.matchAll(/```json\n([\s\S]*?)\n```/g)].at(-1);
    const schema = fence && JSON.parse(fence[1]);
    if (schema?.type !== "object" || !schema.properties) throw new Error(`Missing schema: ${lines[index]}`);
    const name = lines[index].slice(3);
    const family = name.startsWith("mcp__slackbot__") ? "slack" : name.startsWith("mcp__claude-code-remote__") ? "remote" : "coordinator";
    return { name, family, lineStart: index + 1, lineEnd: end, schema,
      source: `https://github.com/WEIFENG2333/phistory/blob/${revision}/${artifact}#L${index + 1}-L${end}` };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const prompt = execFileSync("git", ["-C", path.join(root, ".cache/phistory/upstream"), "show", `${revision}:${artifact}`], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  if (createHash("sha256").update(prompt).digest("hex") !== digest) throw new Error("Pinned prompt digest mismatch");
  const tools = extractTools(prompt);
  if (tools.length !== 85 || new Set(tools.map((t) => t.name)).size !== 85) throw new Error("Tool inventory mismatch");
  const output = JSON.stringify({ revision, artifact, sha256: digest, tools }, null, 2) + "\n";
  const target = path.join(root, "public/capabilities/claude-tag-tools.json");
  if (process.argv.includes("--check")) {
    if (readFileSync(target, "utf8") !== output) throw new Error("Published tool index drifted");
  } else writeFileSync(target, output);
  console.log(`Verified ${tools.length} tools from ${revision}`);
}
