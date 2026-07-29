import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { parseNawsBytes, IAC, SB, SE, NAWS_OPTION } from "../../src/server/telnet.ts";

describe("parseNawsBytes", () => {
  it("should parse valid NAWS bytes", () => {
    // 80x24: IAC SB NAWS 0 80 0 24 IAC SE
    const bytes = new Uint8Array([IAC, SB, NAWS_OPTION, 0, 80, 0, 24, IAC, SE]);
    const result = parseNawsBytes(bytes);
    assertEquals(result, { width: 80, height: 24 });
  });

  it("should return null for incomplete sequence (too short)", () => {
    const bytes = new Uint8Array([IAC, SB, NAWS_OPTION, 0, 80, 0, 24, IAC]);
    const result = parseNawsBytes(bytes);
    assertEquals(result, null);
  });

  it("should return null for invalid start sequence", () => {
    const bytes = new Uint8Array([255, 251, NAWS_OPTION, 0, 80, 0, 24, IAC, SE]);
    const result = parseNawsBytes(bytes);
    assertEquals(result, null);
  });

  it("should return null for invalid end sequence", () => {
    const bytes = new Uint8Array([IAC, SB, NAWS_OPTION, 0, 80, 0, 24, IAC, 255]);
    const result = parseNawsBytes(bytes);
    assertEquals(result, null);
  });

  it("should return null for width too small", () => {
    // Width 39
    const bytes = new Uint8Array([IAC, SB, NAWS_OPTION, 0, 39, 0, 24, IAC, SE]);
    const result = parseNawsBytes(bytes);
    assertEquals(result, null);
  });

  it("should return null for width too large", () => {
    // Width 251
    const bytes = new Uint8Array([IAC, SB, NAWS_OPTION, 0, 251, 0, 24, IAC, SE]);
    const result = parseNawsBytes(bytes);
    assertEquals(result, null);
  });

  it("should return null for height too small", () => {
    // Height 0
    const bytes = new Uint8Array([IAC, SB, NAWS_OPTION, 0, 80, 0, 0, IAC, SE]);
    const result = parseNawsBytes(bytes);
    assertEquals(result, null);
  });

  it("should return null for height too large", () => {
    // Height 256
    const bytes = new Uint8Array([IAC, SB, NAWS_OPTION, 0, 80, 1, 0, IAC, SE]);
    const result = parseNawsBytes(bytes);
    assertEquals(result, null);
  });
});
