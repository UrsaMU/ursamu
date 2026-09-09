// tests/layout_chrome.test.ts -- Multi-line command reports use layout chrome.
import { assert, assertStringIncludes } from "jsr:@std/assert";
import { frame, header, footer } from "../core/format.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("frame() wraps header and footer", OPTS, () => {
  const out = frame("Test Title", ["  body line"]);
  assertStringIncludes(out, header("Test Title"));
  assertStringIncludes(out, "body line");
  assertStringIncludes(out, footer());
  assertStringIncludes(out, "%r");
});

Deno.test("command multi-line joins are framed", OPTS, async () => {
  const issues: string[] = [];

  for await (const ent of Deno.readDir("commands")) {
    if (!ent.isFile || !ent.name.endsWith(".ts")) continue;
    const path = `commands/${ent.name}`;
    const text = await Deno.readTextFile(path);
    const lines = text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      if (!/\.join\(\s*["']%r["']\s*\)|\.join\(\s*["']\\n["']\s*\)/.test(lines[i])) {
        continue;
      }
      const window = lines.slice(Math.max(0, i - 30), i + 1).join("\n");
      const hasChrome =
        /\bheader\s*\(/.test(window) ||
        /\bframe\s*\(/.test(window) ||
        /\bfooter\s*\(/.test(window) ||
        /\bformat(Sheet|Dashboard|Budget|Queue|GiftList|TemplatePicker|SubtypePicker|Roll|Hurt|Heal)\b/
          .test(window) ||
        // gift source-line wrap helper (not a full report)
        /chunks\.length/.test(window);

      if (!hasChrome) {
        issues.push(
          `${path}:${i + 1}: bare multi-line join without layout chrome`,
        );
      }
    }
  }

  assert(
    issues.length === 0,
    "Layout chrome violations:\n" + issues.join("\n"),
  );
});
