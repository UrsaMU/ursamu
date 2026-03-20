/**
 * Tests for src/cli/plugin.ts — plugin manager.
 *
 * Network-dependent commands (install, update) are not tested here.
 * We cover all error paths, list, info, remove, search, and help.
 *
 * Tests that need a remote registry spin up a temporary local HTTP server
 * and pass its URL via the URSAMU_REGISTRY_URL environment variable.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import type { Registry } from "../src/cli/types.ts";

const PLUGIN_TS = new URL("../src/cli/plugin.ts", import.meta.url).pathname;
const OPTS = { sanitizeResources: false, sanitizeOps: false };

interface RunResult { stdout: string; stderr: string; code: number }

async function runPlugin(
  args: string[],
  cwd?: string,
  env?: Record<string, string>,
): Promise<RunResult> {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", PLUGIN_TS, ...args],
    cwd: cwd ?? Deno.cwd(),
    env: { ...Deno.env.toObject(), ...env },
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

/** Starts a tiny HTTP server that always returns `registry` as JSON.
 *  Passes the base URL to `fn`, then shuts the server down. */
async function withLocalRegistry(
  registry: object,
  fn: (url: string) => Promise<void>,
): Promise<void> {
  const body = JSON.stringify(registry);
  const server = Deno.serve(
    { port: 0, hostname: "127.0.0.1", onListen() {} },
    () =>
      new Response(body, {
        headers: { "content-type": "application/json" },
      }),
  );
  const port = (server.addr as Deno.NetAddr).port;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await server.shutdown();
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

Deno.test("plugin --help: includes search, --all, and --tag", OPTS, async () => {
  const { code, stdout } = await runPlugin(["--help"]);
  assertEquals(code, 0);
  assertStringIncludes(stdout, "search");
  assertStringIncludes(stdout, "--all");
  assertStringIncludes(stdout, "--tag");
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

// ─── install by registry name ─────────────────────────────────────────────────

Deno.test("plugin install <name>: not found in remote registry → exits 1", OPTS, async () => {
  await withLocalRegistry(
    { version: "1", plugins: [] },
    async (registryUrl) => {
      await withTempDir(async (dir) => {
        const { code, stderr } = await runPlugin(
          ["install", "unknown-plugin"],
          dir,
          { URSAMU_REGISTRY_URL: registryUrl },
        );
        assertEquals(code, 1);
        assertStringIncludes(stderr, "was not found in the registry");
      });
    },
  );
});

Deno.test("plugin install <name>: registry unreachable → exits 1", OPTS, async () => {
  await withTempDir(async (dir) => {
    const { code, stderr } = await runPlugin(
      ["install", "some-plugin"],
      dir,
      { URSAMU_REGISTRY_URL: "http://127.0.0.1:1" },
    );
    assertEquals(code, 1);
    assertStringIncludes(stderr, "Could not reach plugin registry");
  });
});

// ─── update error paths ───────────────────────────────────────────────────────

Deno.test("plugin update (no args, no --all): exits 1 with usage message", OPTS, async () => {
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

// ─── update --all ─────────────────────────────────────────────────────────────

Deno.test("plugin update --all: exits 0 with nothing to update when registry is empty", OPTS, async () => {
  await withTempDir(async (dir) => {
    const { code, stdout } = await runPlugin(["update", "--all"], dir);
    assertEquals(code, 0);
    assertStringIncludes(stdout, "Nothing to update");
  });
});

Deno.test("plugin update --all: attempts each registered plugin and exits 1 on failure", OPTS, async () => {
  await withTempDir(async (dir) => {
    await Deno.mkdir(join(dir, "src", "plugins"), { recursive: true });
    const reg: Registry = {
      "fake-plugin": {
        name: "fake-plugin",
        version: "1.0.0",
        description: "A fake plugin",
        source: "https://example.invalid/fake-plugin.git",
        author: "tester",
        installedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
    await Deno.writeTextFile(
      join(dir, "src", "plugins", ".registry.json"),
      JSON.stringify(reg, null, 2),
    );
    const { code, stderr } = await runPlugin(["update", "--all"], dir);
    // git clone of an invalid URL fails → exits 1
    assertEquals(code, 1);
    // The [error] line names the plugin
    assertStringIncludes(stderr, "fake-plugin");
  });
});

// ─── update multiple names ────────────────────────────────────────────────────

Deno.test("plugin update name1 unknown: skips unknown, prints summary, exits 1", OPTS, async () => {
  await withTempDir(async (dir) => {
    await Deno.mkdir(join(dir, "src", "plugins"), { recursive: true });
    const reg: Registry = {
      "known-plugin": {
        name: "known-plugin",
        version: "1.0.0",
        description: "Known",
        source: "https://example.invalid/known-plugin.git",
        author: "tester",
        installedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
    await Deno.writeTextFile(
      join(dir, "src", "plugins", ".registry.json"),
      JSON.stringify(reg, null, 2),
    );
    const { code, stdout, stderr } = await runPlugin(
      ["update", "known-plugin", "ghost-plugin"],
      dir,
    );
    // known-plugin → git clone fails; ghost-plugin → skipped
    assertEquals(code, 1);
    // "[skip]" message for unknown plugin
    assertStringIncludes(stderr, "ghost-plugin");
    // summary line (printed when >1 targets)
    assertStringIncludes(stdout, "Update complete");
    assertStringIncludes(stdout, "skipped");
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

// ─── search ───────────────────────────────────────────────────────────────────

Deno.test("plugin search: graceful error on unreachable registry", OPTS, async () => {
  await withTempDir(async (dir) => {
    const { code, stderr } = await runPlugin(
      ["search"],
      dir,
      { URSAMU_REGISTRY_URL: "http://127.0.0.1:1" },
    );
    assertEquals(code, 1);
    assertStringIncludes(stderr, "Could not reach plugin registry");
  });
});

Deno.test("plugin search: lists all plugins when no query", OPTS, async () => {
  await withLocalRegistry(
    {
      version: "1",
      plugins: [
        {
          name: "cool-plugin",
          description: "Does cool things",
          ursamu: ">=1.0.0",
          url: "https://example.com/cool.git",
          version: "1.0.0",
          author: "alice",
          tags: ["ai"],
        },
        {
          name: "other-plugin",
          description: "Does other things",
          ursamu: ">=1.0.0",
          url: "https://example.com/other.git",
          version: "2.0.0",
          author: "bob",
          tags: ["chargen"],
        },
      ],
    },
    async (registryUrl) => {
      await withTempDir(async (dir) => {
        const { code, stdout } = await runPlugin(
          ["search"],
          dir,
          { URSAMU_REGISTRY_URL: registryUrl },
        );
        assertEquals(code, 0);
        assertStringIncludes(stdout, "cool-plugin");
        assertStringIncludes(stdout, "other-plugin");
      });
    },
  );
});

Deno.test("plugin search: filters results by keyword", OPTS, async () => {
  await withLocalRegistry(
    {
      version: "1",
      plugins: [
        {
          name: "cool-plugin",
          description: "Does cool things",
          ursamu: ">=1.0.0",
          url: "https://example.com/cool.git",
          version: "1.0.0",
          author: "alice",
          tags: ["ai"],
        },
        {
          name: "other-plugin",
          description: "Does other things",
          ursamu: ">=1.0.0",
          url: "https://example.com/other.git",
          version: "2.0.0",
          author: "bob",
          tags: ["chargen"],
        },
      ],
    },
    async (registryUrl) => {
      await withTempDir(async (dir) => {
        const { code, stdout } = await runPlugin(
          ["search", "cool"],
          dir,
          { URSAMU_REGISTRY_URL: registryUrl },
        );
        assertEquals(code, 0);
        assertStringIncludes(stdout, "cool-plugin");
        assertEquals(stdout.includes("other-plugin"), false);
      });
    },
  );
});

Deno.test("plugin search: filters results by --tag", OPTS, async () => {
  await withLocalRegistry(
    {
      version: "1",
      plugins: [
        {
          name: "cool-plugin",
          description: "Does cool things",
          ursamu: ">=1.0.0",
          url: "https://example.com/cool.git",
          version: "1.0.0",
          author: "alice",
          tags: ["ai"],
        },
        {
          name: "other-plugin",
          description: "Does other things",
          ursamu: ">=1.0.0",
          url: "https://example.com/other.git",
          version: "2.0.0",
          author: "bob",
          tags: ["chargen"],
        },
      ],
    },
    async (registryUrl) => {
      await withTempDir(async (dir) => {
        const { code, stdout } = await runPlugin(
          ["search", "--tag", "chargen"],
          dir,
          { URSAMU_REGISTRY_URL: registryUrl },
        );
        assertEquals(code, 0);
        assertStringIncludes(stdout, "other-plugin");
        assertEquals(stdout.includes("cool-plugin"), false);
      });
    },
  );
});

Deno.test("plugin search: reports no match when nothing qualifies", OPTS, async () => {
  await withLocalRegistry(
    { version: "1", plugins: [] },
    async (registryUrl) => {
      await withTempDir(async (dir) => {
        const { code, stdout } = await runPlugin(
          ["search", "nonexistent"],
          dir,
          { URSAMU_REGISTRY_URL: registryUrl },
        );
        assertEquals(code, 0);
        assertStringIncludes(stdout, "No plugins found");
      });
    },
  );
});

Deno.test("plugin search: marks installed plugin with version badge", OPTS, async () => {
  await withLocalRegistry(
    {
      version: "1",
      plugins: [
        {
          name: "installed-plugin",
          description: "Already installed",
          ursamu: ">=1.0.0",
          url: "https://example.com/installed.git",
          version: "1.5.0",
          author: "carol",
          tags: [],
        },
      ],
    },
    async (registryUrl) => {
      await withTempDir(async (dir) => {
        // Seed the local registry as if it was already installed
        await Deno.mkdir(join(dir, "src", "plugins"), { recursive: true });
        const reg: Registry = {
          "installed-plugin": {
            name: "installed-plugin",
            version: "1.4.0",
            description: "Already installed",
            source: "https://example.com/installed.git",
            author: "carol",
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        };
        await Deno.writeTextFile(
          join(dir, "src", "plugins", ".registry.json"),
          JSON.stringify(reg, null, 2),
        );

        const { code, stdout } = await runPlugin(
          ["search"],
          dir,
          { URSAMU_REGISTRY_URL: registryUrl },
        );
        assertEquals(code, 0);
        assertStringIncludes(stdout, "installed-plugin");
        // Should show the locally-installed version in the badge
        assertStringIncludes(stdout, "installed v1.4.0");
      });
    },
  );
});
