import { defineAction } from "@agent-native/core";
import { z } from "zod";

import { runCommand } from "../lib/repo.js";

const booleanFlag = z.preprocess((value) => {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean());

export default defineAction({
  description: "Create a persistent AgentLab research topic skeleton.",
  schema: z.object({
    title: z.string().min(1).describe("Chinese topic title."),
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).describe("Stable kebab-case topic slug."),
    summary: z.string().min(1).describe("One-sentence topic summary."),
    force: booleanFlag.default(false).describe("Overwrite existing skeleton files."),
  }),
  run: async ({ title, slug, summary, force }) => {
    const args = ["scripts/new_research_topic.py", title, "--slug", slug, "--summary", summary];
    if (force) {
      args.push("--force");
    }
    const result = await runCommand("python3", args);
    return {
      slug,
      command: result.command,
      stdout: result.stdout.trim(),
      files: [
        `research/runs/${slug}/state.md`,
        `research/runs/${slug}/sources.md`,
        `research/topics/${slug}.md`,
        `site/src/content/docs/research/${slug}.md`,
      ],
    };
  },
});
