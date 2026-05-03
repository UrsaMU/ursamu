/**
 * Tests for src/cli/create.ts — project scaffolding and plugin creation.
 *
 * All tests spawn create.ts as a subprocess so we exercise the real CLI
 * exactly as `dx jsr:@ursamu/ursamu init <name>` does.
 */
import { assertEquals, assertStringIncludes, assert } from "@std/assert";
import { join } from "@std/path";
import { existsSync } from "@std/fs";

const CREATE_TS = new URL("../src/cli/create.ts", import.meta.url).pathname;
const OPTS = { sanitizeResources: false, sanitizeOps: false };

interface RunResult { stdout: string; stderr: string; code: number }

async function runCreate(args: string[], cwd: string): Promise<RunResult> {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", CREATE_TS, ...args],
    cwd,
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await cmd.output();
  return {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  };
}

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await Deno.makeTempDir({ prefix: "ursamu_create_test_" });
  try {
    await fn(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

// ─── Project creation ─────────────────────────────────────────────────────────

Deno.test("create project: exits 0 on success", OPTS, async () => {
  await withTempDir(async (dir) => {
    const { code } = await runCreate(["roses"], dir);
    assertEquals(code, 0);
  });
});

Deno.test("create project: scaffolds all expected directories", OPTS, async () => {
  await withTempDir(async (dir) => {
    await runCreate(["roses"], dir);
    for (const d of ["config", "data", "src", "src/plugins", "text", "help", "scripts"]) {
      assert(existsSync(join(dir, "roses", d)), `missing directory: ${d}`);
    }
  });
});

Deno.test("create project: generates src/main.ts with project name", OPTS, async () => {
  await withTempDir(async (dir) => {
    await runCreate(["my-game"], dir);
    const content = await Deno.readTextFile(join(dir, "my-game", "src", "main.ts"));
    assertStringIncludes(content, "my-game");
    assertStringIncludes(content, `import { mu } from "ursamu"`);
  });
});

Deno.test("create project: generates src/telnet.ts", OPTS, async () => {
  await withTempDir(async (dir) => {
    await runCreate(["my-game"], dir);
    const content = await Deno.readTextFile(join(dir, "my-game", "src", "telnet.ts"));
    assertStringIncludes(content, "startTelnetServer");
  });
});

Deno.test("create project: generates deno.json with ursamu import", OPTS, async () => {
  await withTempDir(async (dir) => {
    await runCreate(["my-game"], dir);
    const json = JSON.parse(
      await Deno.readTextFile(join(dir, "my-game", "deno.json"))
    );
    assertEquals(json.imports["ursamu"], "jsr:@ursamu/ursamu");
    assert(json.tasks?.start, "missing start task");
    assert(json.tasks?.server, "missing server task");
  });
});

Deno.test("create project: generates text/default_connect.txt", OPTS, async () => {
  await withTempDir(async (dir) => {
    await runCreate(["my-game"], dir);
    assert(existsSync(join(dir, "my-game", "text", "default_connect.txt")));
  });
});

Deno.test("create project: default_connect.txt has content", OPTS, async () => {
  await withTempDir(async (dir) => {
    await runCreate(["roses"], dir);
    const content = await Deno.readTextFile(
      join(dir, "roses", "text", "default_connect.txt")
    );
    assert(content.length > 0);
  });
});

Deno.test("create project: generates scripts/run.sh", OPTS, async () => {
  await withTempDir(async (dir) => {
    await runCreate(["my-game"], dir);
    assert(existsSync(join(dir, "my-game", "scripts", "run.sh")));
  });
});

Deno.test("create project: run.sh references project name", OPTS, async () => {
  await withTempDir(async (dir) => {
    await runCreate(["my-game"], dir);
    const content = await Deno.readTextFile(join(dir, "my-game", "scripts", "run.sh"));
    assertStringIncludes(content, "main.ts");
  });
});

Deno.test("create project: generates README.md with project name", OPTS, async () => {
  await withTempDir(async (dir) => {
    await runCreate(["roses"], dir);
    const content = await Deno.readTextFile(join(dir, "roses", "README.md"));
    assertStringIncludes(content, "roses");
  });
});

Deno.test("create project: generates .gitignore excluding db files", OPTS, async () => {
  await withTempDir(async (dir) => {
    await runCreate(["my-game"], dir);
    const content = await Deno.readTextFile(join(dir, "my-game", ".gitignore"));
    assertStringIncludes(content, "data/*.db");
    assertStringIncludes(content, "config/config.json");
  });
});

Deno.test("create project: exits 1 if target directory already exists", OPTS, async () => {
  await withTempDir(async (dir) => {
    await Deno.mkdir(join(dir, "existing-game"));
    const { code, stderr } = await runCreate(["existing-game"], dir);
    assertEquals(code, 1);
    assertStringIncludes(stderr, "already exists");
  });
});

Deno.test("create project: shows help and exits 0 when no args", OPTS, async () => {
  await withTempDir(async (dir) => {
    const { code, stdout } = await runCreate([], dir);
    assertEquals(code, 0);
    assertStringIncludes(stdout, "Usage:");
  });
});

// ─── In-tree plugin scaffold ──────────────────────────────────────────────────

Deno.test("create plugin: exits 0 on success", OPTS, async () => {
  await withTempDir(async (dir) => {
    await runCreate(["my-game"], dir);
    const { code } = await runCreate(
      ["plugin", "my-feature", "--non-interactive"],
      join(dir, "my-game")
    );
    assertEquals(code, 0);
  });
});

Deno.test("create plugin: scaffolds all expected files", OPTS, async () => {
  await withTempDir(async (dir) => {
    await runCreate(["my-game"], dir);
    const projectDir = join(dir, "my-game");
    await runCreate(["plugin", "my-feature", "--non-interactive"], projectDir);
    const pluginDir = join(projectDir, "src", "plugins", "my-feature");
    for (const f of [
      "index.ts", "commands.ts", "router.ts",
      join("commands", "my-feature.ts"),
      join("db", "schemas.ts"),
      join("help", "my-feature.md"),
      join("tests", "plugin.test.ts"),
    ]) {
      assert(existsSync(join(pluginDir, f)), `missing: ${f}`);
    }
  });
});

Deno.test("create plugin: commands.ts is a barrel (no addCmd calls)", OPTS, async () => {
  await withTempDir(async (dir) => {
    await runCreate(["my-game"], dir);
    const projectDir = join(dir, "my-game");
    await runCreate(["plugin", "my-feature", "--non-interactive"], projectDir);
    const content = await Deno.readTextFile(
      join(projectDir, "src", "plugins", "my-feature", "commands.ts")
    );
    assertStringIncludes(content, `./commands/my-feature.ts`);
    // barrel must not contain addCmd logic — strip comments first
    const codeOnly = content.replace(/\/\/[^\n]*/g, "");
    assert(!codeOnly.includes("addCmd("), "commands.ts barrel must not contain addCmd calls");
  });
});

Deno.test("create plugin: commands/<name>.ts defines addCmd with help and stripSubs", OPTS, async () => {
  await withTempDir(async (dir) => {
    await runCreate(["my-game"], dir);
    const projectDir = join(dir, "my-game");
    await runCreate(["plugin", "my-feature", "--non-interactive"], projectDir);
    const content = await Deno.readTextFile(
      join(projectDir, "src", "plugins", "my-feature", "commands", "my-feature.ts")
    );
    assertStringIncludes(content, "+my-feature");
    assertStringIncludes(content, "IUrsamuSDK");
    assertStringIncludes(content, "help:");
    assertStringIncludes(content, "stripSubs");
  });
});

Deno.test("create plugin: db/schemas.ts defines typed interface with no DBO instances", OPTS, async () => {
  await withTempDir(async (dir) => {
    await runCreate(["my-game"], dir);
    const projectDir = join(dir, "my-game");
    await runCreate(["plugin", "my-feature", "--non-interactive"], projectDir);
    const content = await Deno.readTextFile(
      join(projectDir, "src", "plugins", "my-feature", "db", "schemas.ts")
    );
    assertStringIncludes(content, "interface");
    assertStringIncludes(content, "createdAt");
    assert(!content.includes("new DBO("), "db/schemas.ts must not instantiate DBO");
  });
});

Deno.test("create plugin: index.ts registers route and imports commands", OPTS, async () => {
  await withTempDir(async (dir) => {
    await runCreate(["my-game"], dir);
    const projectDir = join(dir, "my-game");
    await runCreate(["plugin", "my-feature", "--non-interactive"], projectDir);
    const content = await Deno.readTextFile(
      join(projectDir, "src", "plugins", "my-feature", "index.ts")
    );
    assertStringIncludes(content, "registerPluginRoute");
    assertStringIncludes(content, "./commands.ts");
  });
});

Deno.test("create plugin: kebab-case name becomes camelCase in generated code", OPTS, async () => {
  await withTempDir(async (dir) => {
    await runCreate(["my-game"], dir);
    const projectDir = join(dir, "my-game");
    await runCreate(["plugin", "my-feature", "--non-interactive"], projectDir);
    const content = await Deno.readTextFile(
      join(projectDir, "src", "plugins", "my-feature", "index.ts")
    );
    assertStringIncludes(content, "myFeaturePlugin");
  });
});

Deno.test("create plugin: exits 1 if plugin directory already exists", OPTS, async () => {
  await withTempDir(async (dir) => {
    await runCreate(["my-game"], dir);
    const projectDir = join(dir, "my-game");
    await runCreate(["plugin", "my-feature", "--non-interactive"], projectDir);
    const { code, stderr } = await runCreate(
      ["plugin", "my-feature", "--non-interactive"],
      projectDir
    );
    assertEquals(code, 1);
    assertStringIncludes(stderr, "already exists");
  });
});

Deno.test("create plugin: exits 1 with no name", OPTS, async () => {
  await withTempDir(async (dir) => {
    await runCreate(["my-game"], dir);
    const { code, stderr } = await runCreate(
      ["plugin", "--non-interactive"],
      join(dir, "my-game")
    );
    assertEquals(code, 1);
    assertStringIncludes(stderr, "required");
  });
});

// ─── Standalone plugin scaffold ───────────────────────────────────────────────

Deno.test("create plugin --standalone: exits 0", OPTS, async () => {
  await withTempDir(async (dir) => {
    const { code } = await runCreate(
      ["plugin", "cool-plugin", "--standalone", "--non-interactive"],
      dir
    );
    assertEquals(code, 0);
  });
});

Deno.test("create plugin --standalone: generates valid ursamu.plugin.json", OPTS, async () => {
  await withTempDir(async (dir) => {
    await runCreate(
      ["plugin", "cool-plugin", "--standalone", "--non-interactive"],
      dir
    );
    const manifest = JSON.parse(
      await Deno.readTextFile(join(dir, "cool-plugin", "ursamu.plugin.json"))
    );
    assertEquals(manifest.name, "cool-plugin");
    assertEquals(manifest.main, "index.ts");
    assertStringIncludes(manifest.ursamu, ">=1.0.0");
  });
});

Deno.test("create plugin --standalone: generates deno.json with ursamu import", OPTS, async () => {
  await withTempDir(async (dir) => {
    await runCreate(
      ["plugin", "cool-plugin", "--standalone", "--non-interactive"],
      dir
    );
    const json = JSON.parse(
      await Deno.readTextFile(join(dir, "cool-plugin", "deno.json"))
    );
    assertEquals(json.imports["ursamu"], "jsr:@ursamu/ursamu");
  });
});

Deno.test("create plugin --standalone: generates index.ts with default export", OPTS, async () => {
  await withTempDir(async (dir) => {
    await runCreate(
      ["plugin", "cool-plugin", "--standalone", "--non-interactive"],
      dir
    );
    const content = await Deno.readTextFile(join(dir, "cool-plugin", "index.ts"));
    assertStringIncludes(content, "export default");
    assertStringIncludes(content, "coolPluginPlugin");
  });
});

Deno.test("create plugin --standalone: generates test file", OPTS, async () => {
  await withTempDir(async (dir) => {
    await runCreate(
      ["plugin", "cool-plugin", "--standalone", "--non-interactive"],
      dir
    );
    const content = await Deno.readTextFile(
      join(dir, "cool-plugin", "tests", "plugin.test.ts")
    );
    assertStringIncludes(content, "cool-plugin");
    assertStringIncludes(content, "init returns true");
  });
});

Deno.test("create plugin --standalone: generates .gitignore", OPTS, async () => {
  await withTempDir(async (dir) => {
    await runCreate(
      ["plugin", "cool-plugin", "--standalone", "--non-interactive"],
      dir
    );
    assert(existsSync(join(dir, "cool-plugin", ".gitignore")));
  });
});

Deno.test("create plugin --standalone: exits 1 if directory already exists", OPTS, async () => {
  await withTempDir(async (dir) => {
    await Deno.mkdir(join(dir, "cool-plugin"));
    const { code, stderr } = await runCreate(
      ["plugin", "cool-plugin", "--standalone", "--non-interactive"],
      dir
    );
    assertEquals(code, 1);
    assertStringIncludes(stderr, "already exists");
  });
});

// ─── H1: project name validation ─────────────────────────────────────────────

Deno.test("H1 — create project: rejects path-traversal name", OPTS, async () => {
  await withTempDir(async (dir) => {
    const { code, stderr } = await runCreate(["../outside"], dir);
    assertEquals(code, 1);
    assertStringIncludes(stderr, "Invalid project name");
  });
});

Deno.test("H1 — create project: rejects name with spaces", OPTS, async () => {
  await withTempDir(async (dir) => {
    const { code, stderr } = await runCreate(["my game"], dir);
    assertEquals(code, 1);
    assertStringIncludes(stderr, "Invalid project name");
  });
});

Deno.test("H1 — create project: accepts valid hyphenated name", OPTS, async () => {
  await withTempDir(async (dir) => {
    const { code } = await runCreate(["my-game-2"], dir);
    assertEquals(code, 0);
  });
});
