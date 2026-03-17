/**
 * Tests for src/cli/plugin.ts — plugin manager.
 *
 * Network-dependent commands (install, update) are not tested here.
 * We cover all error paths, list, info, remove, and help.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";

const PLUGIN_TS = new URL("../src/cli/plugin.ts", import.meta.url).pathname;
const OPTS = { sanitizeResources: false, sanitizeOps: false };

interface RunResult { stdout: string; stderr: string; code: number }

async function runPlugin(args: string[], cwd?: string): Promise<RunResult> {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", PLUGIN_TS, ...args],
    cwd: cwd ?? Deno.cwd(),
    stdout: "piped",
    stderr: "piped",
    stdin: "null",
  });
  const { code, stdout, stderr } = await cmd.output();
  return {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  };
}

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await Deno.makeTempDir({ prefix: "ursamu_plugin_test_" });
  try {
    await fn(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

// ─── help ─────────────────────────────────────────────────────────────────────

Deno.test("plugin --help: exits 0 and prints usage", OPTS, async () => {
  const { code, stdout } = await runPlugin(["--help"]);
  assertEquals(code, 0);
  assertStringIncludes(stdout, "install");
  assertStringIncludes(stdout, "update");
  assertStringIncludes(stdout, "remove");
  assertStringIncludes(stdout, "list");
  assertStringIncludes(stdout, "info");
});

Deno.test("plugin (no args): exits 0 and prints usage", OPTS, async () => {
  const { code, stdout } = await runPlugin([]);
  assertEquals(code, 0);
  assertStringIncludes(stdout, "install");
});

// ─── unknown command ──────────────────────────────────────────────────────────

Deno.test("plugin unknown: exits 1 and reports unknown command", OPTS, async () => {
  const { code, stderr } = await runPlugin(["frobnicate"]);
  assertEquals(code, 1);
  assertStringIncludes(stderr, "Unknown plugin command");
});

// ─── list ─────────────────────────────────────────────────────────────────────

Deno.test("plugin list: exits 0 with no plugins dir", OPTS, async () => {
  await withTempDir(async (dir) => {
    const { code, stdout } = await runPlugin(["list"], dir);
    assertEquals(code, 0);
    assertStringIncludes(stdout, "No plugins installed");
  });
});

Deno.test("plugin list: exits 0 with empty plugins dir", OPTS, async () => {
  await withTempDir(async (dir) => {
    await Deno.mkdir(join(dir, "src", "plugins"), { recursive: true });
    const { code, stdout } = await runPlugin(["list"], dir);
    assertEquals(code, 0);
    assertStringIncludes(stdout, "No plugins installed");
  });
});

Deno.test("plugin list: shows unregistered plugin in dir", OPTS, async () => {
  await withTempDir(async (dir) => {
    await Deno.mkdir(join(dir, "src", "plugins", "my-plugin"), { recursive: true });
    const { code, stdout } = await runPlugin(["list"], dir);
    assertEquals(code, 0);
    assertStringIncludes(stdout, "my-plugin");
    assertStringIncludes(stdout, "unregistered");
  });
});

// ─── install error paths ──────────────────────────────────────────────────────

Deno.test("plugin install (no url): exits 1 with usage message", OPTS, async () => {
  await withTempDir(async (dir) => {
    const { code, stderr } = await runPlugin(["install"], dir);
    assertEquals(code, 1);
    assertStringIncludes(stderr, "Usage:");
  });
});

// ─── update error paths ───────────────────────────────────────────────────────

Deno.test("plugin update (no name): exits 1 with usage message", OPTS, async () => {
  await withTempDir(async (dir) => {
    const { code, stderr } = await runPlugin(["update"], dir);
    assertEquals(code, 1);
    assertStringIncludes(stderr, "Usage:");
  });
});

Deno.test("plugin update (unknown plugin): exits 1 with not-in-registry message", OPTS, async () => {
  await withTempDir(async (dir) => {
    const { code, stderr } = await runPlugin(["update", "ghost-plugin"], dir);
    assertEquals(code, 1);
    assertStringIncludes(stderr, "not in the registry");
  });
});

// ─── remove error paths ───────────────────────────────────────────────────────

Deno.test("plugin remove (no name): exits 1 with usage message", OPTS, async () => {
  await withTempDir(async (dir) => {
    const { code, stderr } = await runPlugin(["remove"], dir);
    assertEquals(code, 1);
    assertStringIncludes(stderr, "Usage:");
  });
});

Deno.test("plugin remove (not installed): exits 1", OPTS, async () => {
  await withTempDir(async (dir) => {
    const { code, stderr } = await runPlugin(["remove", "ghost-plugin"], dir);
    assertEquals(code, 1);
    assertStringIncludes(stderr, "not installed");
  });
});

Deno.test("plugin remove --force: removes installed plugin", OPTS, async () => {
  await withTempDir(async (dir) => {
    // Set up a fake installed plugin
    const pluginDir = join(dir, "src", "plugins", "fake-plugin");
    await Deno.mkdir(pluginDir, { recursive: true });
    await Deno.writeTextFile(join(pluginDir, "index.ts"), "export default {}");

    const { code, stdout } = await runPlugin(["remove", "fake-plugin", "--force"], dir);
    assertEquals(code, 0);
    assertStringIncludes(stdout, "Removed");
  });
});

// ─── info error paths ─────────────────────────────────────────────────────────

Deno.test("plugin info (no name): exits 1 with usage message", OPTS, async () => {
  await withTempDir(async (dir) => {
    const { code, stderr } = await runPlugin(["info"], dir);
    assertEquals(code, 1);
    assertStringIncludes(stderr, "Usage:");
  });
});

Deno.test("plugin info (not installed): exits 1", OPTS, async () => {
  await withTempDir(async (dir) => {
    const { code, stderr } = await runPlugin(["info", "ghost-plugin"], dir);
    assertEquals(code, 1);
    assertStringIncludes(stderr, "not installed");
  });
});

Deno.test("plugin info: shows manifest for installed plugin", OPTS, async () => {
  await withTempDir(async (dir) => {
    const pluginDir = join(dir, "src", "plugins", "my-plugin");
    await Deno.mkdir(pluginDir, { recursive: true });
    await Deno.writeTextFile(
      join(pluginDir, "ursamu.plugin.json"),
      JSON.stringify({
        name: "my-plugin",
        version: "2.0.0",
        description: "A test plugin",
        ursamu: ">=1.0.0",
        author: "tester",
        license: "MIT",
      })
    );
    await Deno.writeTextFile(join(pluginDir, "index.ts"), "export default {}");

    const { code, stdout } = await runPlugin(["info", "my-plugin"], dir);
    assertEquals(code, 0);
    assertStringIncludes(stdout, "2.0.0");
    assertStringIncludes(stdout, "A test plugin");
  });
});
