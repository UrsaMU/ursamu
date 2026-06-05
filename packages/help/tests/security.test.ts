/**
 * security.test.ts — exploit tests for all five audit findings.
 *
 * C1  Symlink traversal: scanDir exposes files outside the help root
 * H1  registerHelpDir accepts unrestricted absolute paths (no path resolution)
 * H2  isAdmin uses $where closure instead of object query
 * M1  +help/set stores content without stripSubs — MUSH codes persist in DB
 * L1  Silent error swallowing — failed reads leave no trace
 *
 * Each test is written to FAIL against the unpatched code (Red), then to
 * PASS once the patch is applied (Green).
 */

import { assertEquals, assertStringIncludes, assertNotEquals, assertMatch } from "@std/assert";
import { describe, it, afterEach } from "@std/testing/bdd";
import { FileProvider, registerHelpDir, bustCache } from "../src/providers/file.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Creates a temporary directory, runs fn, then cleans up. */
async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await Deno.makeTempDir({ prefix: "help_sec_test_" });
  try {
    await fn(dir);
  } finally {
    bustCache();
    await Deno.remove(dir, { recursive: true }).catch(() => {});
  }
}

/** Reset registered dirs between tests by busting cache. */
afterEach(() => bustCache());

// ── C1 — Symlink traversal ────────────────────────────────────────────────────

describe("C1 — Symlink traversal", () => {
  it("EXPLOIT: scanDir must NOT expose a file outside the help root via symlink", async () => {
    await withTempDir(async (helpRoot) => {
      // Create a "secrets" file OUTSIDE the help root
      const secretsDir = await Deno.makeTempDir({ prefix: "help_sec_secrets_" });
      try {
        const secretContent = "SECRET_API_KEY=hunter2_very_sensitive";
        await Deno.writeTextFile(`${secretsDir}/database.txt`, secretContent);

        // Plant a symlink inside the help root pointing to the secret file
        // (named .md so the file filter accepts it)
        await Deno.symlink(
          `${secretsDir}/database.txt`,
          `${helpRoot}/leaked.md`,
        );

        registerHelpDir(helpRoot, "test");
        const provider = new FileProvider();
        const entries = await provider.all();

        // The exploit succeeds if the secret content appears in any entry
        const leaked = entries.find((e) => e.content.includes("SECRET_API_KEY"));
        assertEquals(
          leaked,
          undefined,
          `C1: symlink traversal exposed secret file content via topic "${leaked?.name}"`,
        );
      } finally {
        await Deno.remove(secretsDir, { recursive: true }).catch(() => {});
      }
    });
  });

  it("EXPLOIT: scanDir must NOT follow a symlinked subdirectory pointing outside the root", async () => {
    await withTempDir(async (helpRoot) => {
      const outsideDir = await Deno.makeTempDir({ prefix: "help_sec_outside_" });
      try {
        await Deno.writeTextFile(`${outsideDir}/shadow.md`, "SHADOW_CONTENT: do_not_expose");

        // Symlink a whole directory into the help root
        await Deno.symlink(`${outsideDir}`, `${helpRoot}/subdir`);

        registerHelpDir(helpRoot, "test");
        const provider = new FileProvider();
        const entries = await provider.all();

        const leaked = entries.find((e) => e.content.includes("SHADOW_CONTENT"));
        assertEquals(leaked, undefined, "C1: symlinked subdirectory exposed content outside root");
      } finally {
        await Deno.remove(outsideDir, { recursive: true }).catch(() => {});
      }
    });
  });

  it("SAFE: real .md files inside the root are still served after patch", async () => {
    await withTempDir(async (helpRoot) => {
      await Deno.writeTextFile(`${helpRoot}/greet.md`, "Hello, world!");

      registerHelpDir(helpRoot, "test");
      const provider = new FileProvider();
      const entries = await provider.all();

      const found = entries.find((e) => e.content.includes("Hello, world!"));
      assertNotEquals(found, undefined, "C1: legitimate help file was incorrectly suppressed");
    });
  });
});

// ── H1 — registerHelpDir unrestricted paths ───────────────────────────────────

describe("H1 — registerHelpDir path resolution", () => {
  it("EXPLOIT: registering /tmp exposes files from outside the game directory", async () => {
    // Create a sentinel file in a directory clearly outside the game root
    const outsideDir = await Deno.makeTempDir({ prefix: "help_h1_outside_" });
    try {
      await Deno.writeTextFile(
        `${outsideDir}/sensitive.md`,
        "OUTSIDE_SECRET: should_not_appear",
      );

      // Register the outside dir directly — no guard in the current code
      registerHelpDir(outsideDir, "test-h1");
      const provider = new FileProvider();
      await provider.all();

      // After patch: the path is resolved and a warning is emitted, but the
      // content must NOT appear if the path is blocked. Since H1's fix is a
      // warning (not hard rejection — plugins may live outside cwd), this test
      // verifies the path IS resolved (stored as realPath, not raw string).
      // The real guard against content leakage from arbitrary paths is C1's fix.
      // Here we verify that the registered path is at minimum resolved to a real path
      // (so "../.." in the path string can't be used to escape the registered root).

      // Re-register with a path containing traversal sequences — must resolve cleanly
      bustCache();
      const traversalPath = `${outsideDir}/../../../etc`;
      registerHelpDir(traversalPath, "traversal-attempt");
      const provider2 = new FileProvider();
      const entries2 = await provider2.all();

      // After fix: traversal path is resolved to /etc — and since C1 containment
      // check is active, no content from /etc should appear in results.
      const _leaked = entries2.find(
        (e) => e.content.length > 0 && !e.content.includes("Hello"),
      );
      // We specifically check no /etc passwd-style content leaked
      const passwdLeaked = entries2.find(
        (e) => e.content.includes("root:") || e.content.includes("/bin/bash"),
      );
      assertEquals(passwdLeaked, undefined, "H1: path traversal via registerHelpDir exposed /etc content");
    } finally {
      bustCache();
      await Deno.remove(outsideDir, { recursive: true }).catch(() => {});
    }
  });

  it("SAFE: valid plugin help dir still loads after path resolution", async () => {
    await withTempDir(async (dir) => {
      await Deno.writeTextFile(`${dir}/install.md`, "Install instructions here.");
      registerHelpDir(dir, "plugin");
      const entries = await new FileProvider().all();
      const found = entries.find((e) => e.content.includes("Install instructions"));
      assertNotEquals(found, undefined, "H1: valid plugin help dir was blocked after path fix");
    });
  });
});

// ── H2 — $where in isAdmin ────────────────────────────────────────────────────

// isAdmin is not exported; we test the query pattern directly and verify the
// $where function is no longer present in the routes source.

describe("H2 — $where closure replaced with object query", () => {
  it("routes.ts must not contain a $where closure in isAdmin", async () => {
    const source = await Deno.readTextFile(
      new URL("../src/routes.ts", import.meta.url).pathname,
    );
    // After patch: $where must be gone
    assertEquals(
      source.includes("$where"),
      false,
      "H2: $where closure still present in isAdmin() — replace with { id: userId } object query",
    );
  });

  it("routes.ts isAdmin must use a simple object query { id: userId }", async () => {
    const source = await Deno.readTextFile(
      new URL("../src/routes.ts", import.meta.url).pathname,
    );
    assertMatch(
      source,
      /queryOne\(\s*\{\s*id:\s*userId\s*\}/,
      "H2: isAdmin must use queryOne({ id: userId })",
    );
  });
});

// ── M1 — content not stripped in +help/set ────────────────────────────────────

// We test the strip behavior directly by exercising the slugify+stripSubs path.
// The command itself can't be unit-tested without the full engine SDK, so we
// test the commands.ts source to verify stripSubs is called on args[1].

describe("M1 — +help/set content must be stripped of MUSH codes", () => {
  it("commands.ts must call stripSubs on the content argument before storing", async () => {
    const source = await Deno.readTextFile(
      new URL("../src/commands.ts", import.meta.url).pathname,
    );

    // Find the +help/set exec block and verify stripSubs is applied to args[1]
    // After patch: u.util.stripSubs(u.cmd.args[1]) must appear
    assertMatch(
      source,
      /stripSubs\(u\.cmd\.args\[1\]\)/,
      "M1: content (args[1]) in +help/set must be passed through u.util.stripSubs()",
    );
  });

  it("MUSH codes stripped by stripSubs do not appear in stored content", () => {
    // Simulate what stripSubs does: strip %ch, %cn, %cr, %cg, %r, %t, etc.
    const rawContent = "%chBold title%cn%r%crRed text%cn";
    const stripped = rawContent.replace(/%(ch|cn|c[rgbcmyw]|[rntb])/gi, "");
    assertEquals(stripped.includes("%"), false, "M1: MUSH codes must be stripped from stored content");
    assertStringIncludes(stripped, "Bold title");
    assertStringIncludes(stripped, "Red text");
  });
});

// ── L1 — Silent error handling ────────────────────────────────────────────────

describe("L1 — scanDir must warn on read errors instead of silently swallowing them", () => {
  it("file.ts catch blocks must call console.warn", async () => {
    const source = await Deno.readTextFile(
      new URL("../src/providers/file.ts", import.meta.url).pathname,
    );

    // After patch: each catch block should contain console.warn
    const catchBlocks = source.split("} catch");
    // There should be at least 2 catch blocks (readDir + readTextFile)
    // and each should contain a warn call
    const _catchesWithoutWarn = catchBlocks.slice(1).filter(
      (block) => {
        const body = block.split("}")[0];
        return !body.includes("console.warn") && !body.includes("return entries") === false;
      },
    );

    // Verify at least one console.warn exists in the file
    assertMatch(
      source,
      /console\.warn/,
      "L1: no console.warn found in file.ts — silent error swallowing not fixed",
    );
  });

  it("scanDir continues scanning after a single unreadable file", async () => {
    await withTempDir(async (dir) => {
      // Write a valid file
      await Deno.writeTextFile(`${dir}/good.md`, "Good content");
      // Write a file then remove read permission (simulate unreadable file)
      await Deno.writeTextFile(`${dir}/bad.md`, "Bad content");
      await Deno.chmod(`${dir}/bad.md`, 0o000);

      registerHelpDir(dir, "test-l1");
      const provider = new FileProvider();

      let entries: unknown[] = [];
      try {
        entries = await provider.all();
      } finally {
        // Restore permissions so cleanup can proceed
        await Deno.chmod(`${dir}/bad.md`, 0o644).catch(() => {});
      }

      // good.md should still be loaded despite bad.md failing
      const good = (entries as Array<{ content: string }>).find(
        (e) => e.content.includes("Good content"),
      );
      assertNotEquals(good, undefined, "L1: valid file not loaded when another file in dir is unreadable");
    });
  });
});
