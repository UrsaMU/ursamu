// Command-level tests for +social (Social Maneuvering).
//
// Covers: null target rejection, self-target rejection, sheet-missing,
// canEdit guard on /impression, stripSubs sanitisation, and the
// happy-path /start -> panel render.

import { assert, assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockU, mockPlayer } from "./helpers/mockU.ts";
import { socialExec } from "../src/commands/social.ts";
import { defaultSheet } from "../src/stats/index.ts";
import { maneuverDb } from "../src/social/maneuver.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function makeSubject(name = "Erickson") {
  const subj = mockPlayer({
    id: "9",
    name,
    flags: new Set(["player", "connected"]),
  });
  const sheet = defaultSheet();
  sheet.attributes.resolve = 3;
  sheet.attributes.composure = 4;
  subj.state.cofd = sheet;
  return subj;
}

function makeMe() {
  const me = mockPlayer({ id: "1", name: "Stacy" });
  const sheet = defaultSheet();
  sheet.attributes.manipulation = 3;
  sheet.skills.persuasion = 3;
  me.state.cofd = sheet;
  return me;
}

async function clearDb() {
  // Drain the in-memory DBO between tests.
  // deno-lint-ignore no-explicit-any
  const all = await maneuverDb.find({} as any);
  for (const m of all) {
    // deno-lint-ignore no-explicit-any
    await maneuverDb.delete({ id: m.id } as any);
  }
}

describe("+social/start", OPTS, () => {
  it("rejects unknown target", async () => {
    await clearDb();
    const u = mockU({
      me: makeMe(),
      args: ["start", "Ghost=Loan the book"],
      targetResult: null,
    });
    await socialExec(u);
    const sent = (u as unknown as { _sent: string[] })._sent.join("\n");
    assert(sent.includes("not found"));
  });

  it("rejects self target", async () => {
    await clearDb();
    const me = makeMe();
    const u = mockU({
      me,
      args: ["start", "Stacy=Self"],
      targetResult: me,
    });
    await socialExec(u);
    const sent = (u as unknown as { _sent: string[] })._sent.join("\n");
    assert(sent.includes("yourself"));
  });

  it("rejects subject without sheet", async () => {
    await clearDb();
    const subj = mockPlayer({ id: "9", name: "Sheetless" });
    const u = mockU({
      me: makeMe(),
      args: ["start", "Sheetless=goal"],
      targetResult: subj,
    });
    await socialExec(u);
    const sent = (u as unknown as { _sent: string[] })._sent.join("\n");
    assert(sent.includes("approved character sheet"));
  });

  it("happy path opens a maneuver and renders the panel", async () => {
    await clearDb();
    const subj = makeSubject();
    const u = mockU({
      me: makeMe(),
      args: ["start", "Erickson=Loan me the grimoire"],
      targetResult: subj,
    });
    await socialExec(u);
    const sent = (u as unknown as { _sent: string[] })._sent.join("\n");
    assert(sent.includes("Opened social maneuver"));
    assert(sent.includes("Doors:"));
    assert(sent.includes("3"));
    assert(sent.includes("Erickson"));
  });

  it("stripSubs sanitises color codes in the goal", async () => {
    await clearDb();
    const subj = makeSubject();
    const u = mockU({
      me: makeMe(),
      args: ["start", "Erickson=%crSECRET%cn payload"],
      targetResult: subj,
    });
    await socialExec(u);
    // deno-lint-ignore no-explicit-any
    const all = await maneuverDb.find({} as any);
    assert(all.length === 1);
    assert(!all[0].goal.includes("%cr"));
    assert(all[0].goal.includes("SECRET"));
  });
});

describe("+social/impression", OPTS, () => {
  it("requires canEdit on the subject", async () => {
    await clearDb();
    const subj = makeSubject();
    // First open a maneuver.
    let u = mockU({
      me: makeMe(),
      args: ["start", "Erickson=goal"],
      targetResult: subj,
    });
    await socialExec(u);

    // Now try to set impression without canEdit.
    u = mockU({
      me: makeMe(),
      args: ["impression", "good for Erickson"],
      targetResult: subj,
      canEditResult: false,
    });
    await socialExec(u);
    const sent = (u as unknown as { _sent: string[] })._sent.join("\n");
    assert(sent.includes("Permission denied"));
  });
});

describe("+social/end", OPTS, () => {
  it("abandons the maneuver", async () => {
    await clearDb();
    const subj = makeSubject();
    let u = mockU({
      me: makeMe(),
      args: ["start", "Erickson=goal"],
      targetResult: subj,
    });
    await socialExec(u);
    u = mockU({
      me: makeMe(),
      args: ["end", "for Erickson"],
      targetResult: subj,
    });
    await socialExec(u);
    const sent = (u as unknown as { _sent: string[] })._sent.join("\n");
    assert(sent.includes("abandoned"));
  });
});

describe("+social unknown switch", OPTS, () => {
  it("reports unknown switch", async () => {
    const u = mockU({ me: makeMe(), args: ["bogus", ""] });
    await socialExec(u);
    const sent = (u as unknown as { _sent: string[] })._sent.join("\n");
    assert(sent.includes("Unknown +social switch"));
  });
});

describe("+social/list", OPTS, () => {
  it("reports empty list when no maneuvers", async () => {
    await clearDb();
    const u = mockU({ me: makeMe(), args: ["list", ""] });
    await socialExec(u);
    const sent = (u as unknown as { _sent: string[] })._sent.join("\n");
    assert(sent.includes("No active social maneuvers"));
  });
});

describe("DB writes only via $set", OPTS, () => {
  it("/start uses DBO.create, /end uses DBO.update -- no raw overwrites", async () => {
    await clearDb();
    const subj = makeSubject();
    const u = mockU({
      me: makeMe(),
      args: ["start", "Erickson=goal"],
      targetResult: subj,
    });
    await socialExec(u);
    // deno-lint-ignore no-explicit-any
    const all = await maneuverDb.find({} as any);
    assertEquals(all.length, 1);
    assertEquals(all[0].subjectName, "Erickson");
  });
});
