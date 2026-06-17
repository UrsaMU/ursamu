/**
 * SECURITY — playerName in flags must be stripped of MUSH codes.
 *
 * The attack: a player with a moniker containing MUSH color codes flags a post.
 * The unsanitized name lands in the flags array and is displayed in +bbreview
 * with unstripped codes, potentially causing display corruption.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

interface IFlag { playerId: string; playerName: string; reason: string; createdAt: number; }

function stripSubs(s: string): string {
  return s.replace(/%c[a-zA-Z]/g, "").replace(/%[rntbR]/g, "");
}

// Vulnerable: stores name as-is
function buildFlagVulnerable(playerId: string, rawName: string, reason: string): IFlag {
  return { playerId, playerName: rawName, reason: stripSubs(reason), createdAt: 0 };
}

// Patched: strips name before storing
function buildFlagPatched(playerId: string, rawName: string, reason: string): IFlag {
  return { playerId, playerName: stripSubs(rawName), reason: stripSubs(reason), createdAt: 0 };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("flag playerName sanitization — vulnerable", () => {
  it("EXPLOIT: MUSH codes land in stored playerName without patch", () => {
    const flag = buildFlagVulnerable("p1", "%chAlice%cn", "spam");
    assertStringIncludes(flag.playerName, "%ch"); // codes present — bad
  });
});

describe("flag playerName sanitization — patched", () => {
  it("strips MUSH color codes from playerName before storing", () => {
    const flag = buildFlagPatched("p1", "%chAlice%cn", "spam");
    assertEquals(flag.playerName, "Alice");
    assertEquals(flag.playerName.includes("%ch"), false);
  });

  it("strips codes from reason as well", () => {
    const flag = buildFlagPatched("p1", "Alice", "%crBad content%cn");
    assertEquals(flag.reason, "Bad content");
  });

  it("preserves plain names unchanged", () => {
    assertEquals(buildFlagPatched("p1", "Bob", "test").playerName, "Bob");
  });
});
