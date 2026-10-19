/**
 * `update` must accept a game whose engine import is jsr:@ursamu/mush —
 * the specifier every game scaffolded since the mush rename uses.
 * Runs with --dry-run so nothing is written.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { fromFileUrl, join } from "@std/path";

const UPDATE_TS = fromFileUrl(
  new URL("../packages/cli/src/update.ts", import.meta.url),
);
const CLI_CONFIG = fromFileUrl(
  new URL("../packages/cli/deno.json", import.meta.url),
);
const OPTS = { sanitizeResources: false, sanitizeOps: false };

async function dryRun(specifier: string) {
  const dir = await Deno.makeTempDir({ prefix: "ursamu_update_" });
  try {
    await Deno.writeTextFile(
      join(dir, "deno.json"),
      JSON.stringify({
        imports: { "ursamu": specifier, "@ursamu/mush": specifier },
      }),
    );
    const cmd = new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "-A",
        "--config",
        CLI_CONFIG,
        UPDATE_TS,
        "--dry-run",
      ],
      cwd: dir,
      stdout: "piped",
      stderr: "piped",
    });
    const { code, stdout, stderr } = await cmd.output();
    const dec = new TextDecoder();
    return { code, out: dec.decode(stdout) + dec.decode(stderr) };
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test("update --dry-run accepts @ursamu/mush", OPTS, async () => {
  const { code, out } = await dryRun("jsr:@ursamu/mush@1.0.0");
  assertEquals(code, 0, out);
  assertStringIncludes(out, "jsr:@ursamu/mush@");
});

Deno.test(
  "update --dry-run still accepts legacy jsr:@ursamu/ursamu",
  OPTS,
  async () => {
    const { code, out } = await dryRun("jsr:@ursamu/ursamu@1.0.0");
    assertEquals(code, 0, out);
  },
);
