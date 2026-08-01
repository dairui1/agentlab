import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "node_modules", "monaco-editor", "min", "vs");
const target = path.join(root, "public", "vendor", "monaco", "vs");

try {
  await stat(path.join(source, "loader.js"));
  await stat(path.join(source, "editor", "editor.main.js"));
  let hasWorker = false;
  try {
    await stat(path.join(source, "base", "worker", "workerMain.js"));
    hasWorker = true;
  } catch {
    const assets = await readdir(path.join(source, "assets"));
    hasWorker = assets.some((name) => /^editor\.worker\..+\.js$/.test(name));
  }
  if (!hasWorker) {
    throw new Error("Monaco worker asset is missing");
  }
} catch {
  throw new Error("Monaco assets are missing. Run `npm install` before building.");
}

await rm(target, { recursive: true, force: true });
await mkdir(path.dirname(target), { recursive: true });
await cp(source, target, { recursive: true });
