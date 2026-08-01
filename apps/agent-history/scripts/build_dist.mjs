import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "public");
const target = path.join(root, "dist");

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
await writeFile(
  path.join(target, "_headers"),
  [
    "/*",
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "  Permissions-Policy: camera=(), microphone=(), geolocation=()",
    "",
    "/data/manifest.json",
    "  Cache-Control: no-cache",
    "",
    "/data/feed.json",
    "  Cache-Control: no-cache",
    "",
    "/data/agents/*",
    "  Cache-Control: no-cache",
    "",
    "/data/objects/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
  ].join("\n"),
  "utf8",
);
