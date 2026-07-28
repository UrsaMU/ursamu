/**
 * Telnet pure helpers (IAC strip + NAWS parse).
 */
import { assertEquals } from "@std/assert";
import {
  IAC,
  SB,
  SE,
  NAWS_OPTION,
  parseNawsBytes,
  stripIacBytes,
  accumulateNaws,
} from "../mod.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("stripIacBytes removes WILL/DO negotiations", OPTS, () => {
  // IAC WILL 1, then "hi"
  const chunk = Uint8Array.from([IAC, 251, 1, 104, 105]);
  const out = stripIacBytes(chunk);
  assertEquals(Array.from(out), [104, 105]);
});

Deno.test("parseNawsBytes reads width and height", OPTS, () => {
  // IAC SB NAWS hi lo hi lo IAC SE  -> 80 x 24
  const bytes = Uint8Array.from([
    IAC,
    SB,
    NAWS_OPTION,
    0,
    80,
    0,
    24,
    IAC,
    SE,
  ]);
  const naws = parseNawsBytes(bytes);
  assertEquals(naws, { width: 80, height: 24 });
});

Deno.test("parseNawsBytes rejects tiny width", OPTS, () => {
  const bytes = Uint8Array.from([
    IAC,
    SB,
    NAWS_OPTION,
    0,
    20,
    0,
    24,
    IAC,
    SE,
  ]);
  assertEquals(parseNawsBytes(bytes), null);
});

Deno.test("accumulateNaws assembles split SB", OPTS, () => {
  const part1 = Uint8Array.from([IAC, SB, NAWS_OPTION, 0, 100]);
  const part2 = Uint8Array.from([0, 30, IAC, SE]);
  const step1 = accumulateNaws(new Uint8Array(0), part1);
  assertEquals(step1.naws, null);
  const step2 = accumulateNaws(step1.carry, part2);
  assertEquals(step2.naws !== null, true);
  const parsed = parseNawsBytes(step2.naws!);
  assertEquals(parsed, { width: 100, height: 30 });
});
