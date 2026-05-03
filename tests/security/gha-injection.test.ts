// RED: GitHub Actions expression injection in discord-notify.yml.
// ${{ github.event.* }} values interpolated directly into `run:` shell commands
// allow a PR/issue/commit title containing shell metacharacters to execute
// arbitrary commands in the workflow runner.
//
// Fix: move all github.event.* values into `env:` variables and reference
// them as $ENV_VAR in the shell — never interpolate expressions inline.

import { assertEquals } from "jsr:@std/assert@^1";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const WORKFLOW = new URL(
  "../../.github/workflows/discord-notify.yml",
  import.meta.url,
);

// Matches any ${{ github.event.* }} expression that appears inside a `run:`
// block (multi-line heredoc or single-line echo).
const INLINE_EXPR = /\$\{\{\s*github\.event\./;

Deno.test(
  "GHA discord-notify: no github.event.* expressions interpolated inline in run: blocks",
  OPTS,
  async () => {
    const src = await Deno.readTextFile(WORKFLOW);

    // Isolate every `run:` block (value after `run: |` until next dedented key)
    // Simple heuristic: find lines between `run: |` and the next non-indented line
    const runBlocks: string[] = [];
    const lines = src.split("\n");
    let inRun = false;
    let block = "";
    for (const line of lines) {
      if (/^\s+run:\s*\|/.test(line)) {
        inRun = true;
        block = "";
        continue;
      }
      if (inRun) {
        // A line that starts at column 0 or is a top-level YAML key ends the block
        if (/^[^ \t]/.test(line) || /^\s{0,4}\w+:/.test(line) && !/^\s{8}/.test(line)) {
          if (block) runBlocks.push(block);
          inRun = false;
          block = "";
        } else {
          block += line + "\n";
        }
      }
    }
    if (block) runBlocks.push(block);

    const violations = runBlocks.filter((b) => INLINE_EXPR.test(b));

    assertEquals(
      violations.length,
      0,
      `VULNERABLE: ${violations.length} run: block(s) interpolate github.event.* inline — shell injection possible.\n` +
        violations.map((b) => b.slice(0, 200)).join("\n---\n"),
    );
  },
);
