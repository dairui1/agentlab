import { defineAction } from "@agent-native/core";
import { z } from "zod";

import { runCommand, siteRoot } from "../lib/repo.js";

const booleanFlag = z.preprocess((value) => {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean());

export default defineAction({
  description: "Run AgentLab generation, catalog validation, tests, and optional site checks.",
  schema: z.object({
    site: booleanFlag.default(true).describe("Also run Astro check and build."),
    docsStats: booleanFlag.default(true).describe("Also run documentation coverage stats."),
  }),
  readOnly: true,
  run: async ({ site, docsStats }) => {
    const steps = [
      await runCommand("make", ["generated"]),
      await runCommand("make", ["validate"]),
      await runCommand("make", ["test"]),
    ];

    if (docsStats) {
      steps.push(await runCommand("python3", ["scripts/docs_stats.py", "--min-cjk", "50000", "--min-agent-pages", "5"]));
    }

    if (site) {
      steps.push(await runCommand("npm", ["run", "check"], siteRoot));
      steps.push(await runCommand("npm", ["run", "build"], siteRoot));
    }

    return {
      passed: true,
      steps: steps.map((step) => ({
        command: step.command,
        cwd: step.cwd,
        stdoutTail: step.stdout.trim().split("\n").slice(-8).join("\n"),
      })),
    };
  },
});
