// Tilts subsystem + +tilt command tests.

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockPlayer, mockU } from "./helpers/mockU.ts";
import { defaultSheet } from "../src/stats/index.ts";
import {
  addTilt,
  clearTilts,
  hasTilt,
  lookupTilt,
  removeTilt,
  TILTS,
} from "../src/subsystems/tilts.ts";
import { tiltExec } from "../src/commands/tilt.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

describe("tilts catalog", OPTS, () => {
  it("includes both personal and environmental scopes", () => {
    const scopes = new Set(Object.values(TILTS).map((t) => t.scope));
    assert(scopes.has("personal"));
    assert(scopes.has("environmental"));
  });

  it("looks up by key (case/trim insensitive)", () => {
    assertEquals(lookupTilt("STUNNED")?.name, "Stunned");
    assertEquals(lookupTilt("  ice  ")?.scope, "environmental");
    assertEquals(lookupTilt("not-a-tilt"), undefined);
  });
});

describe("tilts pure functions", OPTS, () => {
  it("adds and removes a tilt", () => {
    let sheet = defaultSheet();
    sheet = addTilt(sheet, "stunned");
    assert(hasTilt(sheet, "stunned"));
    sheet = removeTilt(sheet, "stunned");
    assert(!hasTilt(sheet, "stunned"));
  });

  it("unknown keys are no-ops", () => {
    const sheet = addTilt(defaultSheet(), "made-up");
    assertEquals(sheet.tilts!.length, 0);
  });

  it("duplicates are no-ops (uniqueness by key)", () => {
    let sheet = defaultSheet();
    sheet = addTilt(sheet, "ice");
    sheet = addTilt(sheet, "ice");
    assertEquals(sheet.tilts!.length, 1);
  });

  it("clearTilts wipes all tilts", () => {
    let sheet = defaultSheet();
    sheet = addTilt(sheet, "ice");
    sheet = addTilt(sheet, "stunned");
    sheet = clearTilts(sheet);
    assertEquals(sheet.tilts!.length, 0);
  });

  it("removing or clearing never modifies Beats", () => {
    let sheet = defaultSheet();
    sheet.beats = 2;
    sheet = addTilt(sheet, "stunned");
    sheet = removeTilt(sheet, "stunned");
    assertEquals(sheet.beats, 2);
    sheet = addTilt(sheet, "ice");
    sheet = clearTilts(sheet);
    assertEquals(sheet.beats, 2);
  });
});

describe("+tilt command", OPTS, () => {
  it("happy path add then clear via DB", async () => {
    const me = mockPlayer({ state: { cofd: defaultSheet() } });
    const u = mockU({
      me,
      dbModify: (_id, op, data) => {
        const d = data as Record<string, unknown>;
        if (op === "$set" && d["data.cofd"]) me.state.cofd = d["data.cofd"];
        return Promise.resolve();
      },
    });
    u.cmd.args = ["add", "stunned"];
    await tiltExec(u);
    const sheetA = me.state.cofd as ReturnType<typeof defaultSheet>;
    assertEquals(sheetA.tilts!.length, 1);

    u.cmd.args = ["clear", ""];
    u._sent.length = 0;
    await tiltExec(u);
    const sheetB = me.state.cofd as ReturnType<typeof defaultSheet>;
    assertEquals(sheetB.tilts!.length, 0);
    assertStringIncludes(u._sent.join("\n"), "cleared");
  });

  it("unknown key is rejected", async () => {
    const me = mockPlayer({ state: { cofd: defaultSheet() } });
    const u = mockU({ me });
    u.cmd.args = ["add", "death"];
    await tiltExec(u);
    assertStringIncludes(u._sent.join("\n"), "Unknown Tilt");
  });

  it("no-sheet player is blocked", async () => {
    const u = mockU({ me: mockPlayer() });
    u.cmd.args = ["add", "stunned"];
    await tiltExec(u);
    assertStringIncludes(u._sent.join("\n"), "does not have an approved character sheet");
  });

  it("strips MUSH codes from notes", async () => {
    const me = mockPlayer({ state: { cofd: defaultSheet() } });
    const u = mockU({
      me,
      dbModify: (_id, op, data) => {
        const d = data as Record<string, unknown>;
        if (op === "$set" && d["data.cofd"]) me.state.cofd = d["data.cofd"];
        return Promise.resolve();
      },
    });
    u.cmd.args = ["add", "stunned/%cr%chHit by%cn pipe"];
    await tiltExec(u);
    const sheet = me.state.cofd as ReturnType<typeof defaultSheet>;
    const note = sheet.tilts![0].note ?? "";
    assertEquals(note.includes("%c"), false);
  });

  it("cross-player without canEdit is blocked", async () => {
    const me = mockPlayer({ id: "1", state: { cofd: defaultSheet() } });
    const other = mockPlayer({ id: "2", name: "Marcus", state: { cofd: defaultSheet() } });
    const u = mockU({ me, targetResult: other, canEditResult: false });
    u.cmd.args = ["add", "stunned for Marcus"];
    await tiltExec(u);
    assertStringIncludes(u._sent.join("\n"), "Permission denied");
  });
});
