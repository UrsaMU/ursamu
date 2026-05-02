// RED: setup-deno is pinned to two different SHAs across workflows.
// Inconsistent pinning means some workflows use an older action version,
// creating a version skew and supply-chain inconsistency.
// Fix: normalize all workflows to the same SHA.

import { assertEquals } from "jsr:@std/assert@^1";
import { walk } from "jsr:@std/fs@^1";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const WORKFLOWS_DIR = new URL("../../.github/workflows/", import.meta.url);

Deno.test(
  "all workflows use the same setup-deno SHA",
  OPTS,
  async () => {
    const shas = new Set<string>();
    const files: string[] = [];

    for await (const entry of walk(WORKFLOWS_DIR, { exts: [".yml"] })) {
      const src = await Deno.readTextFile(entry.path);
      const matches = src.matchAll(/denoland\/setup-deno@([a-f0-9]{40})/g);
      for (const m of matches) {
        shas.add(m[1]);
        if (!files.includes(entry.path)) files.push(entry.path);
      }
    }

    assertEquals(
      shas.size <= 1,
      true,
      `INCONSISTENT: setup-deno pinned to ${shas.size} different SHAs across workflows: ${[...shas].join(", ")}`,
    );
  },
);
