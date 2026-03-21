/**
 * tests/naws.test.ts
 *
 * Unit tests for the NAWS (Negotiate About Window Size, RFC 1073)
 * byte-sequence parser exported from the telnet service.
 *
 * These tests exercise parseNawsBytes() directly without starting a server.
 */
import { assertEquals, assertExists } from "@std/assert";
import { parseNawsBytes } from "../src/services/telnet/telnet.ts";

// Telnet protocol constants (mirrors telnet.ts)
const IAC = 255;
const SB = 250;
const SE = 240;
const NAWS = 31;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a well-formed IAC SB NAWS <whi> <wlo> <hhi> <hlo> IAC SE sequence. */
function nawsSeq(width: number, height: number): Uint8Array {
  return new Uint8Array([
    IAC, SB, NAWS,
    (width >> 8) & 0xff, width & 0xff,
    (height >> 8) & 0xff, height & 0xff,
    IAC, SE,
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("NAWS — standard 80×24 terminal", () => {
  const result = parseNawsBytes(nawsSeq(80, 24));
  assertExists(result);
  assertEquals(result.width, 80);
  assertEquals(result.height, 24);
});

Deno.test("NAWS — wide 200×50 terminal", () => {
  const result = parseNawsBytes(nawsSeq(200, 50));
  assertExists(result);
  assertEquals(result.width, 200);
  assertEquals(result.height, 50);
});

Deno.test("NAWS — two-byte width: 300 (0x01 0x2C)", () => {
  // 300 = 256 + 44 = (1 << 8) | 44
  const result = parseNawsBytes(nawsSeq(300, 24));
  // 300 > 250, so this falls outside the accepted range and must return null
  assertEquals(result, null);
});

Deno.test("NAWS — two-byte width within range: 250 (max allowed)", () => {
  const result = parseNawsBytes(nawsSeq(250, 24));
  assertExists(result);
  assertEquals(result.width, 250);
});

Deno.test("NAWS — invalid: width too narrow (< 40) returns null", () => {
  const result = parseNawsBytes(nawsSeq(30, 24));
  assertEquals(result, null);
});

Deno.test("NAWS — invalid: width = 0 returns null", () => {
  assertEquals(parseNawsBytes(nawsSeq(0, 24)), null);
});

Deno.test("NAWS — invalid: width > 250 returns null", () => {
  assertEquals(parseNawsBytes(nawsSeq(251, 24)), null);
});

Deno.test("NAWS — invalid: sequence too short returns null", () => {
  const short = new Uint8Array([IAC, SB, NAWS, 0, 80]);
  assertEquals(parseNawsBytes(short), null);
});

Deno.test("NAWS — invalid: wrong magic bytes returns null", () => {
  // Starts with 0xFE instead of IAC
  const bad = new Uint8Array([0xFE, SB, NAWS, 0, 80, 0, 24, IAC, SE]);
  assertEquals(parseNawsBytes(bad), null);
});

Deno.test("NAWS — invalid: missing IAC SE terminator returns null", () => {
  const noTerminator = new Uint8Array([IAC, SB, NAWS, 0, 80, 0, 24, 0, 0]);
  assertEquals(parseNawsBytes(noTerminator), null);
});

Deno.test("NAWS — minimum valid width = 40", () => {
  const result = parseNawsBytes(nawsSeq(40, 24));
  assertExists(result);
  assertEquals(result.width, 40);
});
