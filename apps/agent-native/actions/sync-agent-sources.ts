import { defineAction } from "@agent-native/core";
import { z } from "zod";

import { runCommand } from "../lib/repo.js";

const booleanFlag = z.preprocess((value) => {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean());

export default defineAction({
  description: "Sync public agent source/package caches and update the source manifest.",
  schema: z.object({
    dryRun: booleanFlag.default(false).describe("Return the planned command without running it."),
  }),
  run: async ({ dryRun }) => {
    if (dryRun) {
      return {
        command: "make sync-sources",
        outputs: ["generated/source-sync-manifest.json", "research/sources/cache/"],
      };
    }

    const result = await runCommand("make", ["sync-sources"]);
    return {
      command: result.command,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
      outputs: ["generated/source-sync-manifest.json"],
    };
  },
});
