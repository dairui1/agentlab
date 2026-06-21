import { defineAction } from "@agent-native/core";
import { z } from "zod";

import { readJson } from "../lib/repo.js";

interface SiteIndexPage {
  slug: string;
  title: string;
  description: string;
  source: string;
  body_chars: number;
  cjk_chars: number;
}

interface SiteIndex {
  counts: {
    agents: number;
    pages: number;
    body_chars: number;
    cjk_chars: number;
  };
  pages: SiteIndexPage[];
}

export default defineAction({
  description: "List AgentLab documentation pages from generated/site-index.json.",
  schema: z.object({
    group: z.string().optional().describe("Optional first URL segment, for example research or operations."),
    limit: z.coerce.number().int().min(1).max(200).default(30).describe("Maximum pages to return."),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ group, limit }) => {
    const index = await readJson<SiteIndex>("generated/site-index.json");
    const pages = index.pages
      .filter((page) => !group || page.slug.startsWith(`/${group}/`))
      .slice(0, limit)
      .map((page) => ({
        slug: page.slug,
        title: page.title,
        source: page.source,
        cjkChars: page.cjk_chars,
      }));

    return {
      counts: index.counts,
      returned: pages.length,
      pages,
    };
  },
});
