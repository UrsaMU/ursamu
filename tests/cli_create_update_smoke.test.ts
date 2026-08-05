/**
 * Smoke: create a game project and verify update/safe-update scaffolding
 * handles the Court-class failure modes (missing plugins, stale cache flags).
 *
 * Uses --local when available so CI does not need full JSR publish.
 * Also asserts JSR-mode scaffold includes safe-update.sh.
 */
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import { join } from "@std/path";
import { existsSync } from "@std/fs";

const CREATE_TS = new URL(
  "../packages/cli/src/create.ts",
  import.meta.url,
).pathname;
const OPTS = { sanitizeResources: false, sanitizeOps: false };

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

async function run(
  args: string[],
  cwd: string,
): Promise<RunResult> {
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

async function withTempDir(
  fn: (dir: string) => Promise<void>,
): Promise<void> {
  const dir = await Deno.makeTempDir({
    prefix: "ursamu_smoke_",
  });
  try {
    await fn(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test(
  "smoke create (JSR mode): ships safe-update.sh",
  OPTS,
  async () => {
    await withTempDir(async (dir) => {
      const r = await run(["smoke-game"], dir);
      assertEquals(r.code, 0, r.stderr || r.stdout);
      const root = join(dir, "smoke-game");
      assert(
        existsSync(join(root, "scripts", "safe-update.sh")),
        "missing scripts/safe-update.sh",
      );
      const sh = await Deno.readTextFile(
        join(root, "scripts", "safe-update.sh"),
      );
      assertStringIncludes(sh, "config.sample.json");
      assertStringIncludes(sh, "minimum-dependency-age=0");
      assertStringIncludes(sh, "server.plugins");

      const denoJson = JSON.parse(
        await Deno.readTextFile(join(root, "deno.json")),
      ) as { tasks?: Record<string, string> };
      assert(
        denoJson.tasks?.["safe-update"]?.includes("safe-update"),
        "deno.json missing safe-update task",
      );

      // Every new game ships game.layout header/footer chrome.
      const cfg = JSON.parse(
        await Deno.readTextFile(join(root, "config", "config.json")),
      ) as {
        game?: {
          layout?: {
            header?: string;
            footer?: string;
            divider?: string;
          };
        };
      };
      assert(
        typeof cfg.game?.layout?.header === "string" &&
          cfg.game.layout.header.length > 0,
        "config missing game.layout.header",
      );
      assert(
        typeof cfg.game?.layout?.footer === "string" &&
          cfg.game.layout.footer.length > 0,
        "config missing game.layout.footer",
      );
      const mainTs = await Deno.readTextFile(
        join(root, "src", "main.ts"),
      );
      assertStringIncludes(mainTs, "applyLayoutFromConfig");
      assertStringIncludes(mainTs, "game.layout");
    });
  },
);

Deno.test(
  "smoke update path: merge restores dropped plugin from sample",
  OPTS,
  async () => {
    const { mergeConfigFromSample } = await import(
      "../packages/mush/src/sys/merge-config.ts"
    );

    await withTempDir(async (dir) => {
      const r = await run(["merge-game"], dir);
      assertEquals(r.code, 0, r.stderr || r.stdout);
      const root = join(dir, "merge-game");
      const livePath = join(root, "config", "config.json");
      const samplePath = join(
        root,
        "config",
        "config.sample.json",
      );

      const sample = JSON.parse(
        await Deno.readTextFile(samplePath),
      );
      // Simulate production drift: live missing a plugin + map block
      // that sample (after staff edit) gained.
      sample.server.plugins = [
        ...sample.server.plugins,
        "@ursamu/map-plugin",
      ];
      sample.plugins = {
        ...(sample.plugins || {}),
        map: { theme: "hedge", realm: "default" },
      };
      await Deno.writeTextFile(
        samplePath,
        JSON.stringify(sample, null, 2),
      );

      const live = JSON.parse(
        await Deno.readTextFile(livePath),
      );
      // live is missing map-plugin (the Court bug)
      live.server.plugins = (live.server.plugins as string[])
        .filter((p: string) => p !== "@ursamu/map-plugin");
      delete live.plugins?.map;
      await Deno.writeTextFile(
        livePath,
        JSON.stringify(live, null, 2),
      );

      const merged = mergeConfigFromSample(live, sample);
      assertEquals(
        merged.addedPlugins.includes("@ursamu/map-plugin"),
        true,
      );
      assertEquals(
        (
          merged.config.server as { plugins: string[] }
        ).plugins.includes("@ursamu/map-plugin"),
        true,
      );
      assertEquals(
        (
          merged.config.plugins as {
            map: { theme: string };
          }
        ).map.theme,
        "hedge",
      );

      // Write + re-read as safe-update would
      await Deno.writeTextFile(
        livePath,
        JSON.stringify(merged.config, null, 2),
      );
      const again = JSON.parse(
        await Deno.readTextFile(livePath),
      );
      assert(
        (again.server.plugins as string[]).includes(
          "@ursamu/map-plugin",
        ),
      );
    });
  },
);

Deno.test(
  "smoke create: config.sample and config.json stay in sync at birth",
  OPTS,
  async () => {
    await withTempDir(async (dir) => {
      const r = await run(["sync-game"], dir);
      assertEquals(r.code, 0, r.stderr || r.stdout);
      const root = join(dir, "sync-game");
      const live = await Deno.readTextFile(
        join(root, "config", "config.json"),
      );
      const sample = await Deno.readTextFile(
        join(root, "config", "config.sample.json"),
      );
      assertEquals(live, sample);
      const cfg = JSON.parse(live);
      assert(Array.isArray(cfg.server?.plugins));
      assert(cfg.server.plugins.length > 0);
    });
  },
);
