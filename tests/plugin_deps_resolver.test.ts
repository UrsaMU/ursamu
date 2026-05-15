/**
 * Tests for resolveDeps — semver-aware, transactional dependency resolver.
 * Uses an injected `runStep` stub so no real git is invoked.
 */
import { assertEquals, assertRejects, assertStringIncludes, assert } from "@std/assert";
import { join } from "@std/path";

import { resolveDeps, type ResolveDepsCtx } from "../src/utils/pluginDeps.ts";
import { InstallTxn } from "../src/utils/pluginTxn.ts";
import {
  PluginCloneError,
  PluginConflictError,
  PluginDepNameError,
  PluginDepUrlError,
  PluginSemverError,
} from "../src/utils/pluginErrors.ts";
import type { Registry } from "../src/cli/types.ts";
import type { PluginDep, PluginManifest } from "../src/utils/pluginSecurity.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ───── Helpers ────────────────────────────────────────────────────────────────

interface FakeRepo {
  version?: string;
  deps?:    PluginDep[];
}

/**
 * Returns a runStep stub that simulates `git clone`. It looks at the `clone`
 * step's last arg (the dest path) and writes `ursamu.plugin.json` into that
 * dest using the provided `repos` map keyed by repo URL. Other git
 * sub-commands (init/remote/fetch/checkout) succeed with no side effects.
 */
function makeRunStep(
  repos: Map<string, FakeRepo>,
  failures?: Map<string, string>,
): ResolveDepsCtx["runStep"] {
  return async (args: string[], _env: Record<string, string>) => {
    if (args[0] === "clone") {
      const url  = args[args.length - 2];
      const dest = args[args.length - 1];
      if (failures?.has(url)) {
        return { success: false, stderr: failures.get(url) ?? "fail" };
      }
      const repo = repos.get(url);
      if (!repo) return { success: false, stderr: `no such repo: ${url}` };
      await Deno.mkdir(dest, { recursive: true });
      const manifest: PluginManifest = {};
      if (repo.version !== undefined) manifest.version = repo.version;
      if (repo.deps)                  manifest.deps    = repo.deps;
      await Deno.writeTextFile(
        join(dest, "ursamu.plugin.json"),
        JSON.stringify(manifest),
      );
      return { success: true, stderr: "" };
    }
    return { success: true, stderr: "" };
  };
}

async function seedOriginator(
  pluginsDir: string,
  name: string,
  deps: PluginDep[],
): Promise<string> {
  const dir = join(pluginsDir, name);
  await Deno.mkdir(dir, { recursive: true });
  await Deno.writeTextFile(
    join(dir, "ursamu.plugin.json"),
    JSON.stringify({ version: "1.0.0", deps }),
  );
  return dir;
}

function makeCtx(
  pluginsDir: string,
  runStep: ResolveDepsCtx["runStep"],
  reg: Registry = {},
): ResolveDepsCtx & { reg: Registry; txn: InstallTxn } {
  return {
    pluginsDir,
    reg,
    txn:       new InstallTxn(),
    resolving: new Set<string>(),
    requests:  new Map(),
    installed: [],
    runStep,
  };
}

async function listPluginsDir(pluginsDir: string): Promise<string[]> {
  const out: string[] = [];
  for await (const entry of Deno.readDir(pluginsDir)) out.push(entry.name);
  return out;
}

// ───── Tests ──────────────────────────────────────────────────────────────────

Deno.test("resolveDeps — invalid dep name throws PluginDepNameError, no dir created", OPTS, async () => {
  const pluginsDir = await Deno.makeTempDir({ prefix: "ursamu-deps-" });
  try {
    const origDir = await seedOriginator(pluginsDir, "orig", [
      { name: "../evil", url: "https://github.com/foo/evil" },
    ]);
    const ctx = makeCtx(pluginsDir, makeRunStep(new Map()));
    await assertRejects(
      () => resolveDeps(ctx, origDir, "orig"),
      PluginDepNameError,
    );
    const entries = await listPluginsDir(pluginsDir);
    assertEquals(entries.sort(), ["orig"]);
  } finally {
    await Deno.remove(pluginsDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("resolveDeps — invalid dep URL throws PluginDepUrlError, no dir created", OPTS, async () => {
  const pluginsDir = await Deno.makeTempDir({ prefix: "ursamu-deps-" });
  try {
    const origDir = await seedOriginator(pluginsDir, "orig", [
      { name: "okname", url: "file:///etc/passwd" },
    ]);
    const ctx = makeCtx(pluginsDir, makeRunStep(new Map()));
    await assertRejects(
      () => resolveDeps(ctx, origDir, "orig"),
      PluginDepUrlError,
    );
    const entries = await listPluginsDir(pluginsDir);
    assertEquals(entries.sort(), ["orig"]);
  } finally {
    await Deno.remove(pluginsDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("resolveDeps — clone failure throws PluginCloneError, no leftover dir", OPTS, async () => {
  const pluginsDir = await Deno.makeTempDir({ prefix: "ursamu-deps-" });
  try {
    const url = "https://github.com/foo/depA";
    const origDir = await seedOriginator(pluginsDir, "orig", [
      { name: "depa", url },
    ]);
    const runStep = makeRunStep(new Map(), new Map([[url, "boom"]]));
    const ctx = makeCtx(pluginsDir, runStep);

    const err = await assertRejects(
      () => resolveDeps(ctx, origDir, "orig"),
      PluginCloneError,
    );
    assertStringIncludes(err.message, "boom");

    const entries = await listPluginsDir(pluginsDir);
    assertEquals(entries.sort(), ["orig"], "no leftover dep dir");
  } finally {
    await Deno.remove(pluginsDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("resolveDeps — success path: dep cloned, recorded in installed + reg + txn", OPTS, async () => {
  const pluginsDir = await Deno.makeTempDir({ prefix: "ursamu-deps-" });
  try {
    const url = "https://github.com/foo/depa";
    const repos = new Map<string, FakeRepo>([
      [url, { version: "1.0.0" }],
    ]);
    const origDir = await seedOriginator(pluginsDir, "orig", [
      { name: "depa", url, version: "^1.0.0" },
    ]);
    const ctx = makeCtx(pluginsDir, makeRunStep(repos));

    await resolveDeps(ctx, origDir, "orig");

    assertEquals(ctx.installed, ["depa@1.0.0"]);
    assert(ctx.reg["depa"], "reg has depa entry");
    assertEquals(ctx.reg["depa"].version, "1.0.0");
    // Dir exists
    const stat = await Deno.stat(join(pluginsDir, "depa"));
    assert(stat.isDirectory);
  } finally {
    await Deno.remove(pluginsDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("resolveDeps — installed version fails semver range → PluginSemverError", OPTS, async () => {
  const pluginsDir = await Deno.makeTempDir({ prefix: "ursamu-deps-" });
  try {
    const url = "https://github.com/foo/depa";
    const repos = new Map<string, FakeRepo>([
      [url, { version: "0.9.0" }],
    ]);
    const origDir = await seedOriginator(pluginsDir, "orig", [
      { name: "depa", url, version: "^1.0.0" },
    ]);
    const ctx = makeCtx(pluginsDir, makeRunStep(repos));

    await assertRejects(
      () => resolveDeps(ctx, origDir, "orig"),
      PluginSemverError,
    );
  } finally {
    await Deno.remove(pluginsDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("resolveDeps — two requesters with conflicting ranges → PluginConflictError", OPTS, async () => {
  const pluginsDir = await Deno.makeTempDir({ prefix: "ursamu-deps-" });
  try {
    const urlB = "https://github.com/foo/b";
    // B installed at 1.0.0 from fake clone.
    const repos = new Map<string, FakeRepo>([
      [urlB, { version: "1.0.0" }],
    ]);
    const origDir = await seedOriginator(pluginsDir, "orig", [
      { name: "b", url: urlB, version: "^2.0.0" },
    ]);
    // Pre-seed requests map so verifyDepRanges sees two ranges
    // when install completes — simulates a real run where multiple
    // top-level entries collectively request `b` with conflicting ranges.
    const ctx = makeCtx(pluginsDir, makeRunStep(repos));
    ctx.requests.set("b", [
      { range: "^1.0.0", requester: "other-plugin" },
    ]);

    const err = await assertRejects(
      () => resolveDeps(ctx, origDir, "orig"),
    );
    assert(
      err instanceof PluginConflictError,
      `expected PluginConflictError, got ${err.constructor.name}: ${err.message}`,
    );
  } finally {
    await Deno.remove(pluginsDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("resolveDeps — legacy compat: no version in dep entry and installed='unknown' → no error", OPTS, async () => {
  const pluginsDir = await Deno.makeTempDir({ prefix: "ursamu-deps-" });
  try {
    const url = "https://github.com/foo/legacy";
    // Repo manifest has no version → readPluginVersion returns "unknown"
    const repos = new Map<string, FakeRepo>([
      [url, {}],
    ]);
    const origDir = await seedOriginator(pluginsDir, "orig", [
      { name: "legacy", url }, // no version range
    ]);
    const ctx = makeCtx(pluginsDir, makeRunStep(repos));

    await resolveDeps(ctx, origDir, "orig");
    assertEquals(ctx.installed, ["legacy@unknown"]);
  } finally {
    await Deno.remove(pluginsDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("resolveDeps — cycle A → B → A does not infinite-loop", OPTS, async () => {
  const pluginsDir = await Deno.makeTempDir({ prefix: "ursamu-deps-" });
  try {
    const urlA = "https://github.com/foo/a";
    const urlB = "https://github.com/foo/b";
    const repos = new Map<string, FakeRepo>([
      [urlA, { version: "1.0.0", deps: [{ name: "b", url: urlB }] }],
      [urlB, { version: "1.0.0", deps: [{ name: "a", url: urlA }] }],
    ]);
    const origDir = await seedOriginator(pluginsDir, "orig", [
      { name: "a", url: urlA },
    ]);
    const ctx = makeCtx(pluginsDir, makeRunStep(repos));

    await resolveDeps(ctx, origDir, "orig");
    // Both A and B installed exactly once.
    assertEquals(ctx.installed.sort(), ["a@1.0.0", "b@1.0.0"]);
  } finally {
    await Deno.remove(pluginsDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("resolveDeps — transitive A → B → C installs all three", OPTS, async () => {
  const pluginsDir = await Deno.makeTempDir({ prefix: "ursamu-deps-" });
  try {
    const urlA = "https://github.com/foo/a";
    const urlB = "https://github.com/foo/b";
    const urlC = "https://github.com/foo/c";
    const repos = new Map<string, FakeRepo>([
      [urlA, { version: "1.0.0", deps: [{ name: "b", url: urlB }] }],
      [urlB, { version: "1.0.0", deps: [{ name: "c", url: urlC }] }],
      [urlC, { version: "1.0.0" }],
    ]);
    const origDir = await seedOriginator(pluginsDir, "orig", [
      { name: "a", url: urlA },
    ]);
    const ctx = makeCtx(pluginsDir, makeRunStep(repos));

    await resolveDeps(ctx, origDir, "orig");
    assertEquals(ctx.installed.sort(), ["a@1.0.0", "b@1.0.0", "c@1.0.0"]);
    assert(ctx.reg["a"]);
    assert(ctx.reg["b"]);
    assert(ctx.reg["c"]);
  } finally {
    await Deno.remove(pluginsDir, { recursive: true }).catch(() => {});
  }
});
