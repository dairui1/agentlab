import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const here = path.dirname(fileURLToPath(import.meta.url));

export const appRoot = path.resolve(here, "..");
export const repoRoot = path.resolve(appRoot, "..", "..");
export const siteRoot = path.join(repoRoot, "site");

export interface CommandResult {
  command: string;
  cwd: string;
  stdout: string;
  stderr: string;
}

export async function runCommand(command: string, args: string[], cwd = repoRoot): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      maxBuffer: 20 * 1024 * 1024,
      env: {
        ...process.env,
        PYTHONPATH: path.join(repoRoot, "src"),
      },
    });
    return {
      command: [command, ...args].join(" "),
      cwd,
      stdout,
      stderr,
    };
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string; code?: number };
    const details = [
      `Command failed: ${[command, ...args].join(" ")}`,
      `cwd: ${cwd}`,
      `exit: ${err.code ?? "unknown"}`,
      err.stdout ? `stdout:\n${err.stdout}` : "",
      err.stderr ? `stderr:\n${err.stderr}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    throw new Error(details);
  }
}

export async function readJson<T>(relativePath: string): Promise<T> {
  const text = await readFile(path.join(repoRoot, relativePath), "utf-8");
  return JSON.parse(text) as T;
}

