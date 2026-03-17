/**
 * Tests for src/cli/ursamu.ts — top-level CLI dispatch.
 *
 * Verifies that `ursamu init`, `ursamu create`, `ursamu --help`,
 * `ursamu --version`, and unknown commands all behave correctly.
 */
import { assertEquals, assertStringIncludes, assert } from "@std/assert";
import { join } from "@std/path";
import { existsSync } from "@std/fs";

const URSAMU_TS = new URL("../src/cli/ursamu.ts", import.meta.url).pathname;
const OPTS = { sanitizeResources: false, sanitizeOps: false };

interface RunResult { stdout: string; stderr: string; code: number }

async function runCLI(args: string[], cwd?: string): Promise<RunResult> {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", URSAMU_TS, ...args],
    cwd: cwd ?? Deno.cwd(),
    stdout: "piped",
    stderr: "piped",
    stdin: "null",   // prevent interactive prompts from blocking tests
  });
  const { code, stdout, stderr } = await cmd.output();
  return {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  };
}

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await Deno.makeTempDir({ prefix: "ursamu_cli_test_" });
  try {
    await fn(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

// ─── flags ────────────────────────────────────────────────────────────────────

Deno.test("ursamu --version: exits 0 and prints a version string", OPTS, async () => {
  const { code, stdout } = await runCLI(["--version"]);
  assertEquals(code, 0);
  assertStringIncludes(stdout, "v");
});

Deno.test("ursamu --help: exits 0 and prints usage", OPTS, async () => {
  const { code, stdout } = await runCLI(["--help"]);
  assertEquals(code, 0);
  assertStringIncludes(stdout, "Usage:");
  assertStringIncludes(stdout, "create");
  assertStringIncludes(stdout, "plugin");
});

// ─── help command ─────────────────────────────────────────────────────────────

Deno.test("ursamu help: exits 0 and prints usage", OPTS, async () => {
  const { code, stdout } = await runCLI(["help"]);
  assertEquals(code, 0);
  assertStringIncludes(stdout, "Usage:");
});

// ─── unknown command ──────────────────────────────────────────────────────────

Deno.test("ursamu <unknown>: exits 1 and reports unknown command", OPTS, async () => {
  const { code, stderr } = await runCLI(["flibbertigibbet"]);
  assertEquals(code, 1);
  assertStringIncludes(stderr, "Unknown command");
  assertStringIncludes(stderr, "flibbertigibbet");
});

// ─── init / create ────────────────────────────────────────────────────────────

Deno.test("ursamu init <name>: scaffolds project and exits 0", OPTS, async () => {
  await withTempDir(async (dir) => {
    const { code } = await runCLI(["init", "roses"], dir);
    assertEquals(code, 0);
    assert(existsSync(join(dir, "roses", "deno.json")), "deno.json missing");
    assert(existsSync(join(dir, "roses", "src", "main.ts")), "src/main.ts missing");
  });
});

Deno.test("ursamu create <name>: is an alias for init", OPTS, async () => {
  await withTempDir(async (dir) => {
    const { code } = await runCLI(["create", "my-game"], dir);
    assertEquals(code, 0);
    assert(existsSync(join(dir, "my-game", "deno.json")));
  });
});

Deno.test("ursamu init <name>: project name appears in generated files", OPTS, async () => {
  await withTempDir(async (dir) => {
    await runCLI(["init", "star-wars-mu"], dir);
    const readme = await Deno.readTextFile(join(dir, "star-wars-mu", "README.md"));
    assertStringIncludes(readme, "star-wars-mu");
  });
});

Deno.test("ursamu init <name>: exits 1 if target directory exists", OPTS, async () => {
  await withTempDir(async (dir) => {
    await Deno.mkdir(join(dir, "taken"));
    const { code } = await runCLI(["init", "taken"], dir);
    assertEquals(code, 1);
  });
});

// ─── plugin dispatch ──────────────────────────────────────────────────────────

Deno.test("ursamu plugin list: exits 0 in empty project", OPTS, async () => {
  await withTempDir(async (dir) => {
    // plugin list should work even with no plugins dir present
    const { code } = await runCLI(["plugin", "list"], dir);
    assertEquals(code, 0);
  });
});

Deno.test("ursamu plugin --help: exits 0", OPTS, async () => {
  const { code, stdout } = await runCLI(["plugin", "--help"]);
  assertEquals(code, 0);
  assertStringIncludes(stdout, "install");
});
