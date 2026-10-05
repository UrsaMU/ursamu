/**
 * Softcode %x<#rrggbb> / %X<#rrggbb> — lowercase is foreground, uppercase is
 * background, matching the single-letter %xr / %XR convention.
 */
import { assertEquals } from "@std/assert";
import { runSoftcodeSimple } from "../src/softcode/engine.ts";
import "../src/softcode/stdlib/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

async function sc(code: string): Promise<string> {
  return await runSoftcodeSimple(code, {
    actorId: "ansi_hex_actor",
    executorId: "ansi_hex_actor",
  });
}

Deno.test("softcode ansi: lowercase hex is foreground", OPTS, async () => {
  assertEquals(await sc("%x<#ff8800>a"), "\x1b[38;2;255;136;0ma");
  assertEquals(await sc("%c<#003366>a"), "\x1b[38;2;0;51;102ma");
});

Deno.test("softcode ansi: uppercase hex is background", OPTS, async () => {
  assertEquals(await sc("%X<#ff8800>a"), "\x1b[48;2;255;136;0ma");
  assertEquals(await sc("%C<#003366>a"), "\x1b[48;2;0;51;102ma");
});

Deno.test("softcode ansi: single-letter case convention unchanged", OPTS, async () => {
  assertEquals(await sc("%xr%XR"), "\x1b[31m\x1b[41m");
});
