/**
 * tests/naws.test.ts
 *
 * Unit tests for the NAWS (Negotiate About Window Size, RFC 1073)
 * byte-sequence parser exported from the telnet service.
 *
 * These tests exercise parseNawsBytes() directly without starting a server.
 */
import { assertEquals, assertExists } from "@std/assert";
import { parseNawsBytes, MAX_MSG_BUFFER_SIZE } from "../src/services/telnet/telnet.ts";

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

// ---------------------------------------------------------------------------
// H1 — height must be bounded (1–255)
// ---------------------------------------------------------------------------

Deno.test("H1 — height = 0 is rejected (returns null)", () => {
  // height=0 has no valid rendering meaning — must be rejected
  assertEquals(parseNawsBytes(nawsSeq(80, 0)), null);
});

Deno.test("H1 — height = 65535 is rejected (max two-byte overflow)", () => {
  // 65535 = 0xFF 0xFF — must be rejected to prevent resource exhaustion
  assertEquals(parseNawsBytes(nawsSeq(80, 65535)), null);
});

Deno.test("H1 — height = 1 is valid (minimum)", () => {
  const result = parseNawsBytes(nawsSeq(80, 1));
  assertExists(result);
  assertEquals(result.height, 1);
});

Deno.test("H1 — height = 255 is valid (maximum)", () => {
  const result = parseNawsBytes(nawsSeq(80, 255));
  assertExists(result);
  assertEquals(result.height, 255);
});

// ---------------------------------------------------------------------------
// H2 — msgBuffer must have a hard cap
// ---------------------------------------------------------------------------

Deno.test("H2 — MAX_MSG_BUFFER_SIZE is exported and is a reasonable cap", () => {
  // Must exist — currently fails because constant not yet exported
  assertExists(MAX_MSG_BUFFER_SIZE);
  // Must be a sensible limit: between 50 and 1000
  if (MAX_MSG_BUFFER_SIZE < 50 || MAX_MSG_BUFFER_SIZE > 1000) {
    throw new Error(`H2: MAX_MSG_BUFFER_SIZE=${MAX_MSG_BUFFER_SIZE} is not in the expected 50–1000 range`);
  }
});

// ---------------------------------------------------------------------------
// M1 — WebSocket termWidth must be validated before DB write
// ---------------------------------------------------------------------------

Deno.test("M1 — negative termWidth from WS must be rejected", { sanitizeResources: false, sanitizeOps: false }, async () => {
  // Simulate what the WebSocket handler should do before writing to DB
  // The handler currently has no bounds check — import the validator when added
  const { clampTermWidth } = await import("../src/services/WebSocket/index.ts");
  assertEquals(clampTermWidth(-1), null, "negative termWidth must be rejected");
  assertEquals(clampTermWidth(0), null, "zero termWidth must be rejected");
  assertEquals(clampTermWidth(39), null, "too-narrow termWidth must be rejected");
  assertEquals(clampTermWidth(80), 80, "valid termWidth must pass through");
  assertEquals(clampTermWidth(250), 250, "max termWidth must pass through");
  assertEquals(clampTermWidth(999999), null, "huge termWidth must be rejected");
});

// ---------------------------------------------------------------------------
// M3 — NAWS sequence split across two TCP chunks must not be silently dropped
// ---------------------------------------------------------------------------

Deno.test("M3 — split NAWS sequence is handled via exported accumulator", { sanitizeResources: false, sanitizeOps: false }, async () => {
  const { accumulateNaws } = await import("../src/services/telnet/telnet.ts");

  const IAC = 255, SB = 250, SE = 240, NAWS = 31;
  const full = new Uint8Array([IAC, SB, NAWS, 0, 80, 0, 24, IAC, SE]);

  // Split after 4 bytes
  const part1 = full.subarray(0, 4);
  const part2 = full.subarray(4);

  const r1 = accumulateNaws(new Uint8Array(0), part1);
  assertEquals(r1.naws, null, "partial sequence should not produce a result");

  const r2 = accumulateNaws(r1.carry, part2);
  if (r2.naws === null) {
    throw new Error("M3 EXPLOIT: split NAWS sequence was silently dropped — width never stored");
  }
  const parsed = parseNawsBytes(r2.naws);
  assertEquals(parsed?.width, 80);
  assertEquals(parsed?.height, 24);
});
