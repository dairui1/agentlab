import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(publicRoot, "research-index.json"), "utf8"));
const routes = new Map();

function add(href, family, title) {
  const url = new URL(href, "https://agentlab.invalid");
  url.pathname = url.pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, "");
  const route = `${url.pathname}${url.search}`;
  if (!routes.has(route)) routes.set(route, { route, family, title });
}

for (const file of fs.readdirSync(publicRoot, { recursive: true }).filter((file) => file.endsWith(".html")).sort()) {
  const html = fs.readFileSync(path.join(publicRoot, file), "utf8");
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1] || file;
  add(`/${file}`, file.startsWith("guides/") ? "guide" : file.startsWith("capabilities/") ? "article" : "application", title);
}
add("/?mode=compare", "comparison", "版本比较");
for (const study of manifest.studies) {
  add(`/capabilities?study=${encodeURIComponent(study.id)}`, "research", study.title);
  if (study.legacyHref) add(study.legacyHref, "legacy", study.title);
  if (study.archiveHref) {
    const archive = new URL(study.archiveHref, "https://agentlab.invalid");
    archive.searchParams.set("source", "1");
    add(`${archive.pathname}${archive.search}`, "source", study.title);
  }
}
for (const [, href] of fs.readFileSync(path.join(publicRoot, "mechanisms.js"), "utf8").matchAll(/href: "(\/mechanisms[^\"]*)"/g)) {
  add(href, "mechanism", "机制来源工作台");
}

console.log(JSON.stringify([...routes.values()], null, 2));
