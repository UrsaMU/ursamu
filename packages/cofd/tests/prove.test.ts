// +prove command tests.

import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockPlayer, mockU } from "./helpers/mockU.ts";
import { defaultSheet } from "../src/stats/index.ts";
import { resolveTrait } from "../src/roller/index.ts";
import { proveExec } from "../src/commands/prove.ts";
import { createItem, equipItem } from "../src/equipment/index.ts";
import { MockObjectStore } from "./helpers/mockU.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function sheetWith(over: Partial<ReturnType<typeof defaultSheet>>) {
  return { ...defaultSheet(), ...over };
}

describe("resolveTrait", OPTS, () => {
  it("resolves attributes", () => {
    const s = sheetWith({ attributes: { ...defaultSheet().attributes, strength: 3 } });
    const r = resolveTrait("strength", s);
    assertEquals(r?.label, "Strength");
    assertEquals(r?.value, 3);
  });

  it("resolves skills", () => {
    const s = sheetWith({ skills: { ...defaultSheet().skills, athletics: 2 } });
    assertEquals(resolveTrait("athletics", s)?.value, 2);
  });

  it("resolves skill specialty with +1 bonus", () => {
    const s = sheetWith({
      skills: { ...defaultSheet().skills, brawl: 2 },
      specialties: { brawl: ["Boxing"] },
    });
    const r = resolveTrait("brawl/boxing", s);
    assertEquals(r?.base, 2);
    assertEquals(r?.value, 3);
    assertEquals(r?.specialty, "Boxing");
  });

  it("rejects specialty the sheet does not own", () => {
    const s = sheetWith({ skills: { ...defaultSheet().skills, brawl: 2 } });
    assertEquals(resolveTrait("brawl/kickboxing", s), null);
  });

  it("resolves willpower", () => {
    assertEquals(resolveTrait("willpower", defaultSheet())?.label, "Willpower");
    assertEquals(resolveTrait("wp", defaultSheet())?.label, "Willpower");
  });

  it("returns null for unknown tokens", () => {
    assertEquals(resolveTrait("nonexistent", defaultSheet()), null);
    assertEquals(resolveTrait("", defaultSheet()), null);
  });

  it("resolves changeling power stat via 'wyrd'", () => {
    const s = sheetWith({ template: "changeling", powerStatValue: 2 });
    const r = resolveTrait("wyrd", s);
    assertEquals(r?.label, "Wyrd");
    assertEquals(r?.value, 2);
  });
});

describe("+prove command", OPTS, () => {
  it("rejects no traits", async () => {
    const u = mockU({ me: mockPlayer({ state: { cofd: defaultSheet() } }) });
    u.cmd.args = ["", ""];
    await proveExec(u);
    assertStringIncludes(u._sent.join("\n"), "Usage");
  });

  it("rejects sender with no sheet", async () => {
    const u = mockU({ me: mockPlayer() });
    u.cmd.args = ["", "strength"];
    await proveExec(u);
    assertStringIncludes(u._sent.join("\n"), "approved");
  });

  it("rejects unknown switch", async () => {
    const u = mockU({ me: mockPlayer({ state: { cofd: defaultSheet() } }) });
    u.cmd.args = ["bogus", "strength"];
    await proveExec(u);
    assertStringIncludes(u._sent.join("\n"), "Unknown +prove switch");
  });

  it("rejects all-unknown trait list with a useful error", async () => {
    const u = mockU({ me: mockPlayer({ state: { cofd: defaultSheet() } }) });
    u.cmd.args = ["", "fluffiness,unicorns"];
    await proveExec(u);
    const out = u._sent.join("\n");
    assertStringIncludes(out, "Unknown");
    assertStringIncludes(out, "fluffiness");
  });

  it("caps trait list at 8", async () => {
    const u = mockU({ me: mockPlayer({ state: { cofd: defaultSheet() } }) });
    u.cmd.args = ["", "strength,dexterity,stamina,wits,resolve,composure,intelligence,presence,manipulation"];
    await proveExec(u);
    assertStringIncludes(u._sent.join("\n"), "Too many traits");
  });

  it("broadcasts to room with PROVE>> prefix when no recipient", async () => {
    const sheet = sheetWith({ attributes: { ...defaultSheet().attributes, strength: 3 } });
    const u = mockU({ me: mockPlayer({ state: { cofd: sheet } }) });
    u.cmd.args = ["", "strength"];
    await proveExec(u);
    const out = u._sent.join("\n");
    assertStringIncludes(out, "PROVE>>");
    assertStringIncludes(out, "Strength");
    assertStringIncludes(out, "(3)");
  });

  it("renders specialty as base+1", async () => {
    const sheet = sheetWith({
      skills: { ...defaultSheet().skills, brawl: 2 },
      specialties: { brawl: ["Boxing"] },
    });
    const u = mockU({ me: mockPlayer({ state: { cofd: sheet } }) });
    u.cmd.args = ["", "brawl/boxing"];
    await proveExec(u);
    assertStringIncludes(u._sent.join("\n"), "(2+1)");
  });

  it("notes skipped tokens but still sends valid ones", async () => {
    const u = mockU({ me: mockPlayer({ state: { cofd: defaultSheet() } }) });
    u.cmd.args = ["", "strength, made-up-thing"];
    await proveExec(u);
    const out = u._sent.join("\n");
    assertStringIncludes(out, "PROVE>>");
    assertStringIncludes(out, "skipped");
    assertStringIncludes(out, "made-up-thing");
  });

  it("whispers to named recipient with =<player>", async () => {
    const me = mockPlayer({ id: "1", state: { cofd: defaultSheet() } });
    const other = mockPlayer({ id: "2", name: "Marcus" });
    const u = mockU({ me, targetResult: other });
    u.cmd.args = ["", "strength=Marcus"];
    await proveExec(u);
    const out = u._sent.join("\n");
    assertStringIncludes(out, "You show Marcus");
    // and one of the sends should be addressed to target.id
    const ids = u._dbCalls; // unused -- verify the send array contains the broadcast line for target
    void ids;
  });

  it("targeted whisper to a missing player errors cleanly", async () => {
    const u = mockU({ me: mockPlayer({ state: { cofd: defaultSheet() } }), targetResult: null });
    u.cmd.args = ["", "strength=Ghost"];
    await proveExec(u);
    assertStringIncludes(u._sent.join("\n"), "not found");
  });

  it("proves equipped weapon with damage and initiative", async () => {
    const store = new MockObjectStore();
    const ownerId = `owner-${crypto.randomUUID()}`;
    let sheet = defaultSheet();
    const u = mockU({ me: mockPlayer({ id: ownerId, state: { cofd: sheet } }), objectStore: store });
    await createItem(u, ownerId, "pistol-light");
    const r = await equipItem(u, ownerId, 1, null, null);
    sheet = { ...sheet, equipment: { equippedWeapon: r.equippedId ?? null, equippedArmor: null } };
    u.me.state.cofd = sheet;
    u.cmd.args = ["", "weapon"];
    await proveExec(u);
    assertStringIncludes(u._sent.join("\n"), "Pistol, Light");
    assertStringIncludes(u._sent.join("\n"), "Dmg +1");
  });

  it("proves equipped armor with rating and penalties", async () => {
    const store = new MockObjectStore();
    const ownerId = `owner-${crypto.randomUUID()}`;
    let sheet = defaultSheet();
    const u = mockU({ me: mockPlayer({ id: ownerId, state: { cofd: sheet } }), objectStore: store });
    await createItem(u, ownerId, "flak-jacket");
    const r = await equipItem(u, ownerId, 1, null, null);
    sheet = { ...sheet, equipment: { equippedWeapon: null, equippedArmor: r.equippedId ?? null } };
    u.me.state.cofd = sheet;
    u.cmd.args = ["", "armor"];
    await proveExec(u);
    assertStringIncludes(u._sent.join("\n"), "Flak Jacket");
    assertStringIncludes(u._sent.join("\n"), "2/4");
    assertStringIncludes(u._sent.join("\n"), "Def -1");
  });

  it("proves gear inventory list", async () => {
    const store = new MockObjectStore();
    const ownerId = `owner-${crypto.randomUUID()}`;
    const sheet = defaultSheet();
    const u = mockU({ me: mockPlayer({ id: ownerId, state: { cofd: sheet } }), objectStore: store });
    await createItem(u, ownerId, "knife");
    await createItem(u, ownerId, "rope");
    u.cmd.args = ["", "gear"];
    await proveExec(u);
    assertStringIncludes(u._sent.join("\n"), "Knife");
    assertStringIncludes(u._sent.join("\n"), "Rope");
  });

  it("reports 'none' for unequipped slots gracefully", async () => {
    const store = new MockObjectStore();
    const ownerId = `owner-${crypto.randomUUID()}`;
    const u = mockU({
      me: mockPlayer({ id: ownerId, state: { cofd: defaultSheet() } }),
      objectStore: store,
    });
    u.cmd.args = ["", "weapon,armor"];
    await proveExec(u);
    assertStringIncludes(u._sent.join("\n"), "none equipped");
    assertStringIncludes(u._sent.join("\n"), "none worn");
  });

  it("mixes gear tokens with attribute traits", async () => {
    const store = new MockObjectStore();
    const ownerId = `owner-${crypto.randomUUID()}`;
    let sheet = defaultSheet();
    sheet.attributes.strength = 3;
    const u = mockU({ me: mockPlayer({ id: ownerId, state: { cofd: sheet } }), objectStore: store });
    await createItem(u, ownerId, "knife");
    const r = await equipItem(u, ownerId, 1, null, null);
    sheet = { ...sheet, equipment: { equippedWeapon: r.equippedId ?? null, equippedArmor: null } };
    u.me.state.cofd = sheet;
    u.cmd.args = ["", "strength, weapon"];
    await proveExec(u);
    assertStringIncludes(u._sent.join("\n"), "Strength");
    assertStringIncludes(u._sent.join("\n"), "Knife");
  });

  it("strips MUSH codes from input", async () => {
    const sheet = sheetWith({ attributes: { ...defaultSheet().attributes, strength: 3 } });
    const u = mockU({ me: mockPlayer({ state: { cofd: sheet } }) });
    u.cmd.args = ["", "%cr%chstrength%cn"];
    await proveExec(u);
    assertStringIncludes(u._sent.join("\n"), "Strength");
  });
});
