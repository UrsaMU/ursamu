import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { getAbilityMod, migrateSheet } from "../src/stats/modern_sheet.ts";
import { getCgState, cgListExec } from "../src/commands/cg.ts";
import type { IUrsamuSDK } from "@ursamu/ursamu";

function mockPlayer(overrides = {}) {
  return {
    id: "test_Marcus",
    name: "Marcus",
    flags: new Set(["player", "connected"]),
    state: {},
    contents: [],
    ...overrides
  };
}

function mockU(opts: {
  // deno-lint-ignore no-explicit-any
  me?: any;
  args?: string[];
  sw?: string;
} = {}) {
  const sent: string[] = [];
  return {
    me: mockPlayer(opts.me ?? {}),
    cmd: { name: "", original: "", args: opts.args ?? [] },
    send: (m: string) => sent.push(m),
    util: {
      // deno-lint-ignore no-explicit-any
      displayName: (o: any) => o.name ?? "Unknown",
      stripSubs: (s: string) => s.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, ""),
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w)
    },
    db: {
      modify: async () => {}
    },
    _sent: sent
  } as unknown as IUrsamuSDK & { _sent: string[] };
}

describe("d20 Modern Sheet stats", () => {
  it("calculates modifiers correctly", () => {
    assertEquals(getAbilityMod(8), -1);
    assertEquals(getAbilityMod(10), 0);
    assertEquals(getAbilityMod(12), 1);
    assertEquals(getAbilityMod(15), 2);
    assertEquals(getAbilityMod(16), 3);
  });

  it("migrates empty sheet to defaults", () => {
    const s = migrateSheet(null);
    assertEquals(s.class, "");
    assertEquals(s.level, 1);
    assertEquals(s.abilities.strength, 8);
    assertEquals(s.actionPoints, 5);
    assertEquals(s.talent, "");
    assertEquals(s.allegiances, []);
  });

  it("migrates talents and allegiances", () => {
    const s = migrateSheet({
      talent: "melee_smash",
      allegiances: ["good", "lawful"]
    });
    assertEquals(s.talent, "melee_smash");
    assertEquals(s.allegiances, ["good", "lawful"]);
  });
});

describe("d20 Modern Chargen Commands", () => {
  it("initializes character builder state with defaults", () => {
    const u = mockU();
    const state = getCgState(u);
    assertEquals(state.stage, 1);
    assertEquals(state.abilities.strength, 8);
    assertEquals(state.talent, "");
    assertEquals(state.allegiances, []);
  });

  it("lists available occupations", () => {
    const u = mockU();
    cgListExec(u, "occupations");
    const output = u._sent.join("\n");
    assertStringIncludes(output, "ACADEMIC");
    assertStringIncludes(output, "ATHLETE");
  });
});
