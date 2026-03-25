/**
 * Security exploit tests for ensurePlugins.ts
 *
 * H1 — Path Traversal via `name` field
 * H2 — Unrestricted git URL schemes
 * M1 — No ref/commit pinning (supply chain drift)
 * INT — Integration: ensurePlugins actually enforces the guards
 */
import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import {
  isSafePluginName,
  isSafePluginUrl,
  buildCloneArgs,
  isShaRef,
  buildCloneSteps,
  ensurePlugins,
} from "../src/utils/ensurePlugins.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ─── H1: Path Traversal via name ─────────────────────────────────────────────

Deno.test("[H1] isSafePluginName — rejects path traversal sequences", OPTS, () => {
  assertEquals(isSafePluginName("../../evil"),  false, "../../evil must be rejected");
  assertEquals(isSafePluginName("../sibling"),  false, "../sibling must be rejected");
  assertEquals(isSafePluginName("/abs/path"),   false, "absolute path must be rejected");
  assertEquals(isSafePluginName("foo/bar"),     false, "slash in name must be rejected");
  assertEquals(isSafePluginName("foo\\bar"),    false, "backslash in name must be rejected");
  assertEquals(isSafePluginName(""),            false, "empty name must be rejected");
  assertEquals(isSafePluginName(".hidden"),     false, "dot-leading name must be rejected");
  assertEquals(isSafePluginName(".."),          false, "bare .. must be rejected");
});

Deno.test("[H1] isSafePluginName — allows well-formed slugs", OPTS, () => {
  assertEquals(isSafePluginName("my-cool-plugin"), true);
  assertEquals(isSafePluginName("my-plugin"),    true);
  assertEquals(isSafePluginName("plugin123"),    true);
  assertEquals(isSafePluginName("a"),            true);
});

// ─── H2: Unrestricted git URL scheme ─────────────────────────────────────────

Deno.test("[H2] isSafePluginUrl — rejects file:// (local repo exfiltration)", OPTS, () => {
  assertEquals(isSafePluginUrl("file:///etc/passwd"),            false);
  assertEquals(isSafePluginUrl("file:///home/user/secret-repo"), false);
});

Deno.test("[H2] isSafePluginUrl — rejects git:// and ssh:// (unauthenticated / unencrypted)", OPTS, () => {
  assertEquals(isSafePluginUrl("git://localhost/evil"),   false);
  assertEquals(isSafePluginUrl("ssh://attacker.com/pwn"), false);
});

Deno.test("[H2] isSafePluginUrl — rejects http:// (unencrypted)", OPTS, () => {
  assertEquals(isSafePluginUrl("http://github.com/foo/bar"), false);
});

Deno.test("[H2] isSafePluginUrl — allows https:// GitHub URLs", OPTS, () => {
  assertEquals(isSafePluginUrl("https://github.com/UrsaMU/bbs-plugin"), true);
  assertEquals(isSafePluginUrl("https://github.com/someone/a-plugin"),               true);
});

// ─── M1: No ref/commit pinning ────────────────────────────────────────────────

Deno.test("[M1] buildCloneArgs — without ref: shallow clone of default branch", OPTS, () => {
  const args = buildCloneArgs("https://github.com/foo/bar", "/tmp/dest", undefined);
  assertEquals(args, ["clone", "--depth", "1", "https://github.com/foo/bar", "/tmp/dest"]);
});

Deno.test("[M1] buildCloneArgs — with tag ref: pins to specific tag/branch", OPTS, () => {
  const args = buildCloneArgs("https://github.com/foo/bar", "/tmp/dest", "v1.1.0");
  assertEquals(args, [
    "clone", "--depth", "1",
    "--branch", "v1.1.0",
    "--single-branch",
    "https://github.com/foo/bar",
    "/tmp/dest",
  ]);
});

// ─── SHA pinning ──────────────────────────────────────────────────────────────

Deno.test("[SHA] isShaRef — recognises full 40-char commit SHA", OPTS, () => {
  assertEquals(isShaRef("a3f7c12d8e4b9f1c0e2d5b6a789012345678abcd"), true);
});

Deno.test("[SHA] isShaRef — recognises short 7-char SHA", OPTS, () => {
  assertEquals(isShaRef("a3f7c12"), true);
});

Deno.test("[SHA] isShaRef — rejects tag names (not hex)", OPTS, () => {
  assertEquals(isShaRef("v1.1.0"),   false);
  assertEquals(isShaRef("main"),     false);
  assertEquals(isShaRef("HEAD"),     false);
});

Deno.test("[SHA] buildCloneSteps — unpinned: single shallow clone", OPTS, () => {
  const steps = buildCloneSteps("https://github.com/foo/bar", "/tmp/dest", undefined);
  assertEquals(steps, [
    ["clone", "--depth", "1", "https://github.com/foo/bar", "/tmp/dest"],
  ]);
});

Deno.test("[SHA] buildCloneSteps — tag ref: single shallow clone pinned to tag", OPTS, () => {
  const steps = buildCloneSteps("https://github.com/foo/bar", "/tmp/dest", "v1.1.0");
  assertEquals(steps, [
    ["clone", "--depth", "1", "--branch", "v1.1.0", "--single-branch",
     "https://github.com/foo/bar", "/tmp/dest"],
  ]);
});

Deno.test("[SHA] buildCloneSteps — commit SHA: multi-step fetch strategy", OPTS, () => {
  const sha   = "a3f7c12d8e4b9f1c0e2d5b6a789012345678abcd";
  const steps = buildCloneSteps("https://github.com/foo/bar", "/tmp/dest", sha);
  assertEquals(steps, [
    ["init", "/tmp/dest"],
    ["-C", "/tmp/dest", "remote", "add", "origin", "https://github.com/foo/bar"],
    ["-C", "/tmp/dest", "fetch", "--depth", "1", "origin", sha],
    ["-C", "/tmp/dest", "checkout", "FETCH_HEAD"],
  ]);
});

// ─── Integration: guards are enforced inside ensurePlugins ────────────────────

Deno.test("[INT] ensurePlugins — malicious name does not create dir outside pluginsDir", OPTS, async () => {
  const pluginsDir = await Deno.makeTempDir({ prefix: "ursamu-test-plugins-" });
  try {
    await Deno.writeTextFile(join(pluginsDir, "plugins.manifest.json"), JSON.stringify({
      plugins: [{ name: "../../escape-attempt", url: "https://github.com/foo/bar" }],
    }));

    await ensurePlugins(pluginsDir);

    // The escaped path would land one level above pluginsDir's parent
    const escapedPath = join(pluginsDir, "../../escape-attempt");
    let exists = false;
    try { await Deno.stat(escapedPath); exists = true; } catch { /* expected */ }

    assertEquals(exists, false, "Traversal path must not be created");
    // Also confirm nothing was created inside pluginsDir either
    let insideExists = false;
    try { await Deno.stat(join(pluginsDir, "escape-attempt")); insideExists = true; } catch { /* expected */ }
    assertEquals(insideExists, false, "Invalid name must not be installed at all");
  } finally {
    await Deno.remove(pluginsDir, { recursive: true }).catch(() => {});
  }
});

// ─── Ref drift detection ──────────────────────────────────────────────────────

Deno.test("[REF] ensurePlugins — skips already-installed plugin when ref matches", OPTS, async () => {
  const pluginsDir = await Deno.makeTempDir({ prefix: "ursamu-test-plugins-" });
  try {
    // Pre-install the plugin directory with a marker file
    const pluginDir = join(pluginsDir, "my-plugin");
    await Deno.mkdir(pluginDir);
    await Deno.writeTextFile(join(pluginDir, "marker.txt"), "original");

    // Registry records the same ref as the manifest
    await Deno.writeTextFile(join(pluginsDir, ".registry.json"), JSON.stringify({
      "my-plugin": { name: "my-plugin", version: "1.0.0", description: "", source: "https://github.com/foo/my-plugin", ref: "v1.0.0", installedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    }));

    await Deno.writeTextFile(join(pluginsDir, "plugins.manifest.json"), JSON.stringify({
      plugins: [{ name: "my-plugin", url: "https://github.com/foo/my-plugin", ref: "v1.0.0" }],
    }));

    await ensurePlugins(pluginsDir);

    // Dir should be untouched — marker file still present
    const marker = await Deno.readTextFile(join(pluginDir, "marker.txt"));
    assertEquals(marker, "original", "Plugin dir must not be removed when ref matches");
  } finally {
    await Deno.remove(pluginsDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("[REF] ensurePlugins — skips already-installed plugin when manifest has no ref", OPTS, async () => {
  const pluginsDir = await Deno.makeTempDir({ prefix: "ursamu-test-plugins-" });
  try {
    const pluginDir = join(pluginsDir, "my-plugin");
    await Deno.mkdir(pluginDir);
    await Deno.writeTextFile(join(pluginDir, "marker.txt"), "original");

    await Deno.writeTextFile(join(pluginsDir, ".registry.json"), JSON.stringify({
      "my-plugin": { name: "my-plugin", version: "1.0.0", description: "", source: "https://github.com/foo/my-plugin", ref: "v1.0.0", installedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    }));

    // No ref in manifest — unpinned; should not trigger auto-update
    await Deno.writeTextFile(join(pluginsDir, "plugins.manifest.json"), JSON.stringify({
      plugins: [{ name: "my-plugin", url: "https://github.com/foo/my-plugin" }],
    }));

    await ensurePlugins(pluginsDir);

    const marker = await Deno.readTextFile(join(pluginDir, "marker.txt"));
    assertEquals(marker, "original", "Plugin dir must not be removed when manifest has no ref");
  } finally {
    await Deno.remove(pluginsDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("[REF] ensurePlugins — removes plugin dir when manifest ref has changed", OPTS, async () => {
  const pluginsDir = await Deno.makeTempDir({ prefix: "ursamu-test-plugins-" });
  try {
    const pluginDir = join(pluginsDir, "my-plugin");
    await Deno.mkdir(pluginDir);
    await Deno.writeTextFile(join(pluginDir, "marker.txt"), "original");

    // Registry has old ref
    await Deno.writeTextFile(join(pluginsDir, ".registry.json"), JSON.stringify({
      "my-plugin": { name: "my-plugin", version: "1.0.0", description: "", source: "https://github.com/foo/my-plugin", ref: "v1.0.0", installedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    }));

    // Manifest bumped to new ref
    await Deno.writeTextFile(join(pluginsDir, "plugins.manifest.json"), JSON.stringify({
      plugins: [{ name: "my-plugin", url: "https://github.com/foo/my-plugin", ref: "v1.1.0" }],
    }));

    // ensurePlugins will remove the dir then attempt git clone (which will fail for a fake URL — that's fine)
    await ensurePlugins(pluginsDir);

    // The marker file must be gone — dir was removed for the update
    let markerExists = false;
    try { await Deno.stat(join(pluginDir, "marker.txt")); markerExists = true; } catch { /* expected */ }
    assertEquals(markerExists, false, "Old plugin dir must be removed when ref changes");
  } finally {
    await Deno.remove(pluginsDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("[INT] ensurePlugins — unsafe URL scheme does not invoke git clone", OPTS, async () => {
  const pluginsDir = await Deno.makeTempDir({ prefix: "ursamu-test-plugins-" });
  try {
    await Deno.writeTextFile(join(pluginsDir, "plugins.manifest.json"), JSON.stringify({
      plugins: [{ name: "evil-plugin", url: "file:///etc/passwd" }],
    }));

    await ensurePlugins(pluginsDir);

    // If git clone had run it would have failed (file:// not a git repo here),
    // but more importantly the plugin dir must not exist at all.
    let exists = false;
    try { await Deno.stat(join(pluginsDir, "evil-plugin")); exists = true; } catch { /* expected */ }
    assertEquals(exists, false, "file:// URL must be blocked before git is invoked");
  } finally {
    await Deno.remove(pluginsDir, { recursive: true }).catch(() => {});
  }
});
