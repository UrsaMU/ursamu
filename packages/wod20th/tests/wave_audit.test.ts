// tests/wave_audit.test.ts -- Stage 4b /tdd-audit exploit suite for the
// Wave 1 + Wave 3 features. Each invariant has a Red test that would
// pass if the guard were removed.
//
// Coverage:
//   A. B-2b single-`spend` identifier sweep (spirit_interactions, npc).
//   B. Prototype-pollution guards on every new getter.
//   C. saveChar allowlist completeness for new IWoDChar fields.
//   D. Staff-gate guards on every privileged switch.
//   E. Frenzy-gate guards on spirit /bargain /chiminage /banish /bind.
//   F. Fail-closed cost spend across new commands.
//   G. Init-loop safety cap on NPC auto-turn.
//   H. Title engine: one-shot earning + correct renown award.

import { assert, assertEquals, assertFalse } from "@std/assert";
import { describe, it } from "jsr:@std/testing@^1.0.0/bdd";

import "../splats/wta/index.ts";
import "../splats/mortal/index.ts";
import "../splats/kinfolk/index.ts";
import "../commands/scar.ts";
import "../commands/title.ts";
import "../commands/npc.ts";
import "../commands/realm.ts";

import { getRealm } from "../core/realms.ts";
import { getTalen } from "../splats/wta/data/talens.ts";
import { getScar } from "../core/battleScars.ts";
import { getNpcTemplate } from "../splats/wta/data/wyrmNpcs.ts";
import { getTitle, maybeAwardTitles, WTA_TITLES } from "../core/titles.ts";
import { createChar, findByPlayer, saveChar, setStatus } from "../db/charDb.ts";
import type { IWoDChar } from "../core/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// -- A. B-2b spend-identifier sweep ---------------------------------------

const SPIRIT_SRC = await Deno.readTextFile(
  new URL("../commands/spirit.ts", import.meta.url),
);
const NPC_SRC = await Deno.readTextFile(
  new URL("../core/npc.ts", import.meta.url),
);
const CHARDB_SRC = await Deno.readTextFile(
  new URL("../db/charDb.ts", import.meta.url),
);
const SCAR_SRC = await Deno.readTextFile(
  new URL("../commands/scar.ts", import.meta.url),
);
const NPC_CMD_SRC = await Deno.readTextFile(
  new URL("../commands/npc.ts", import.meta.url),
);
const TITLE_CMD_SRC = await Deno.readTextFile(
  new URL("../commands/title.ts", import.meta.url),
);
const INIT_SRC = await Deno.readTextFile(
  new URL("../commands/init.ts", import.meta.url),
);

describe({
  name: "/tdd-audit Wave 1+3",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: () => {
  it("A-1: spirit interactions use the literal identifier `spend` for cost", () => {
    // Each interaction switch is expected to call spendPool and bind
    // it to a const named `spend` (matches audit invariant B-2b).
    const spendDecls = SPIRIT_SRC.match(/const spend = spendPool\(/g) ?? [];
    assert(spendDecls.length >= 4, `expected >=4 spend decls in spirit.ts, got ${spendDecls.length}`);
  });

  it("A-2: core/npc.ts has no orphan spendPool calls bound to other names", () => {
    // The AI driver does not spend pools via spendPool (it adjusts
    // rageCurrent in place). Any future spendPool added must use `spend`.
    const offenders = NPC_SRC.match(/const (?!spend\b)\w+ = spendPool\(/g) ?? [];
    assertEquals(offenders.length, 0, `non-spend identifier(s): ${offenders.join(", ")}`);
  });

  // -- B. Prototype-pollution guards on every new getter ---------------

  it("B-1: getRealm rejects prototype keys", () => {
    assertEquals(getRealm("toString"), undefined);
    assertEquals(getRealm("__proto__"), undefined);
    assertEquals(getRealm("constructor"), undefined);
  });

  it("B-2: getTalen rejects prototype keys", () => {
    assertEquals(getTalen("toString"), undefined);
    assertEquals(getTalen("__proto__"), undefined);
    assertEquals(getTalen("hasOwnProperty"), undefined);
  });

  it("B-3: getScar rejects prototype keys", () => {
    assertEquals(getScar("toString"), undefined);
    assertEquals(getScar("__proto__"), undefined);
  });

  it("B-4: getNpcTemplate rejects prototype keys", () => {
    assertEquals(getNpcTemplate("toString"), undefined);
    assertEquals(getNpcTemplate("__proto__"), undefined);
  });

  it("B-5: getTitle rejects prototype keys", () => {
    assertEquals(getTitle("toString"), undefined);
    assertEquals(getTitle("__proto__"), undefined);
  });

  // -- C. saveChar allowlist completeness ------------------------------

  it("C-1: saveChar persists every new IWoDChar field added in Wave 1+3", () => {
    const fields = [
      "scars", "isNpc", "npcTemplate", "npcRoomId", "npcKind",
      "npcKills", "titles",
    ];
    for (const f of fields) {
      assert(
        CHARDB_SRC.includes(`{ ${f}: char.${f} }`),
        `saveChar must persist char.${f}`,
      );
    }
  });

  // -- D. Staff-gate source guards -------------------------------------

  it("D-1: +scar/clear is staff-gated", () => {
    // The handler must check isStaffUser before mutating scars.
    const clearIdx = SCAR_SRC.indexOf('sw === "clear"');
    assert(clearIdx > 0);
    const body = SCAR_SRC.slice(clearIdx, clearIdx + 400);
    assert(/isStaffUser\(u\)/.test(body), "scar/clear must gate on isStaffUser");
  });

  it("D-2: +npc/spawn /despawn /act are staff-gated", () => {
    for (const sw of ["spawn", "despawn", "act"]) {
      const idx = NPC_CMD_SRC.indexOf(`sw === "${sw}"`);
      assert(idx > 0, `${sw} branch missing`);
      const body = NPC_CMD_SRC.slice(idx, idx + 400);
      assert(/isStaff\(u\)/.test(body), `npc/${sw} must gate on isStaff`);
    }
  });

  it("D-3: +init/addnpc is staff-gated", () => {
    const idx = INIT_SRC.indexOf('sw === "addnpc"');
    assert(idx > 0);
    const body = INIT_SRC.slice(idx, idx + 400);
    assert(/isStaff\(u\)/.test(body), "init/addnpc must gate on isStaff");
  });

  it("D-4: +title/award /revoke are staff-gated", () => {
    const idx = TITLE_CMD_SRC.indexOf('sw === "award" || sw === "revoke"');
    assert(idx > 0);
    const body = TITLE_CMD_SRC.slice(idx, idx + 400);
    assert(/isStaff\(u\)/.test(body), "title/award and /revoke must gate on isStaff");
  });

  // -- E. Frenzy-gate guards on spirit interactions --------------------

  it("E-1: spirit /bind frenzy-gates via frenzyBlockMessage", () => {
    // /bind is outside the umbra-gated path, so its frenzy check lives
    // in the /bind branch itself. The dispatcher splits compound
    // switches like "bind/talen" into swHead/swSub and gates the bind
    // branch on `swHead === "bind"`.
    const bindIdx = SPIRIT_SRC.indexOf('if (swHead === "bind") {');
    assert(bindIdx > 0, "bind branch missing");
    const body = SPIRIT_SRC.slice(bindIdx, bindIdx + 1500);
    assert(/frenzyBlockMessage\(char/.test(body), "bind must frenzy-gate");
  });

  // -- I. /bind/talen compound switch + Wyrm-taint botch path ----------

  it("I-1: spirit dispatcher splits compound switches (bind/talen)", () => {
    assert(
      /swParts\s*=\s*sw\.split\("\/"\)/.test(SPIRIT_SRC),
      "spirit dispatcher must parse compound switches via sw.split(\"/\")",
    );
    assert(
      /swHead\s*=\s*swParts\[0\]/.test(SPIRIT_SRC),
      "spirit dispatcher must extract swHead",
    );
    assert(
      /swSub\s*=\s*swParts\[1\]/.test(SPIRIT_SRC),
      "spirit dispatcher must extract swSub",
    );
  });

  it("I-2: /bind/talen shares the bind branch (single-source gating)", () => {
    // Talen path must reach the same branch as /bind so all gates
    // (rank, rite, frenzy, taint) apply identically.
    const bindIdx = SPIRIT_SRC.indexOf('if (swHead === "bind") {');
    assert(bindIdx > 0);
    const body = SPIRIT_SRC.slice(bindIdx, bindIdx + 4000);
    assert(/isTalen|talen/i.test(body),
      "bind branch must distinguish talen via swSub");
    assert(/swSub === "talen"|isTalen/.test(body),
      "bind branch must condition on the talen subswitch");
  });

  it("I-3: /bind botch writes wyrmTainted and does NOT write spiritSlug", () => {
    // Regression guard for the canon Wyrm-taint side-effect on botch.
    // The botch branch in /bind must (a) write state.wyrmTainted=true
    // and (b) never reach the success path that sets state.spiritSlug.
    const bindIdx = SPIRIT_SRC.indexOf('if (swHead === "bind") {');
    const body = SPIRIT_SRC.slice(bindIdx, bindIdx + 4000);
    // Locate the botch sub-branch.
    const botchIdx = body.indexOf("roll.botch");
    assert(botchIdx > 0, "no botch handling in /bind");
    const botchBody = body.slice(botchIdx, botchIdx + 800);
    assert(/state\.wyrmTainted.*true/s.test(botchBody),
      "botch must $set state.wyrmTainted=true");
    assert(!/state\.spiritSlug/.test(botchBody.slice(0, botchBody.indexOf("return") + 6)),
      "botch must NOT write spiritSlug before its return");
  });

  it("I-4: rite-of-the-fetish exists in the rite catalog", async () => {
    // Spirit binding's preferred gate is rite-of-the-fetish; legacy
    // rite-of-binding is accepted as a fallback. Both must be
    // browsable / learnable via the rite system.
    const { WTA_RITES } = await import("../splats/wta/data/rites.ts");
    assert(WTA_RITES["rite-of-the-fetish"] !== undefined,
      "rite-of-the-fetish missing from WTA_RITES");
    assert(WTA_RITES["rite-of-binding"] !== undefined,
      "rite-of-binding missing from WTA_RITES (legacy gate)");
  });

  it("E-2: spirit /bargain /chiminage /banish share a frenzy gate above their bodies", () => {
    // Look for the consolidated frenzy-gate after the Umbra check.
    const occurrences = (SPIRIT_SRC.match(/frenzyBlockMessage\(char/g) ?? []).length;
    assert(occurrences >= 2,
      `expected at least two frenzyBlockMessage uses (bind + shared), found ${occurrences}`);
  });

  // -- F. Fail-closed cost spend ---------------------------------------

  it("F-1: spirit interactions return on !spend.ok before any DB write", () => {
    // For each interaction, the pattern `if (!spend.ok) { ... return; }`
    // must follow the spendPool call.
    const matches = SPIRIT_SRC.match(/const spend = spendPool[^\n]*\s*\n\s*if \(!spend\.ok\)/g) ?? [];
    assert(matches.length >= 4, `expected >=4 fail-closed spends, got ${matches.length}`);
  });

  // -- G. Init-loop safety cap on NPC auto-turn ------------------------

  it("G-1: +init/next has a safety cap on the NPC auto-turn loop", () => {
    const idx = INIT_SRC.indexOf('sw === "next"');
    assert(idx > 0);
    const body = INIT_SRC.slice(idx, idx + 1800);
    // A bound integer counter that decrements; without it an all-NPC
    // order would loop forever.
    assert(/safety/.test(body), "no safety counter in /next loop");
    assert(/safety-- > 0/.test(body), "safety must be a decrementing-while-positive loop");
  });

  // -- H. Title engine: one-shot + correct reward ----------------------

  async function mkPc(playerId: string): Promise<IWoDChar> {
    const c = await createChar(playerId, "wta");
    await setStatus(c.id, "approved");
    const fresh = (await findByPlayer(playerId))!;
    fresh.renown = { glory: 0, honor: 0, wisdom: 0 };
    fresh.renownTemp = { glory: 0, honor: 0, wisdom: 0 };
    fresh.willpower = 5;
    await saveChar(fresh);
    return (await findByPlayer(playerId))!;
  }

  it("H-1: maybeAwardTitles is one-shot per title (re-check is a no-op)", async () => {
    const c = await mkPc("title-audit-1");
    c.npcKills = { bane: 5 };
    const first = maybeAwardTitles(c);
    assertFalse(first.length === 0);
    const banekiller = first.find((t) => t.slug === "bane-killer");
    assert(banekiller);
    const before = JSON.stringify(c.renownTemp);
    const second = maybeAwardTitles(c);
    assertEquals(second.length, 0, "re-evaluation must not re-award");
    assertEquals(JSON.stringify(c.renownTemp), before, "renown must not bump again");
  });

  it("H-2: every title's reward.track is glory|honor|wisdom and amount>=1", () => {
    for (const t of Object.values(WTA_TITLES)) {
      assert(["glory", "honor", "wisdom"].includes(t.reward.track),
        `bad track on ${t.slug}: ${t.reward.track}`);
      assert(t.reward.amount >= 1, `bad amount on ${t.slug}: ${t.reward.amount}`);
    }
  });

  it("H-3: bane-killer fires at 5 banes, scourge at 25, not before", async () => {
    const c = await mkPc("title-audit-3");
    c.npcKills = { bane: 4 };
    let r = maybeAwardTitles(c);
    assertEquals(r.length, 0, "no title at 4 banes");

    c.npcKills = { bane: 5 };
    r = maybeAwardTitles(c);
    assert(r.find((t) => t.slug === "bane-killer"), "bane-killer at 5");
    assertFalse(r.find((t) => t.slug === "bane-scourge"), "scourge not yet");

    c.npcKills = { bane: 25 };
    r = maybeAwardTitles(c);
    assert(r.find((t) => t.slug === "bane-scourge"), "scourge at 25");
  });

  it("H-4: war-scarred + the-marked fire on scar count thresholds", async () => {
    const c = await mkPc("title-audit-4");
    c.scars = Array.from({ length: 3 }, (_, i) => ({
      slug: `s${i}`, name: `Scar ${i}`, glory: 1,
      description: ".", acquiredAt: i,
    }));
    let r = maybeAwardTitles(c);
    assert(r.find((t) => t.slug === "war-scarred"));
    assertFalse(r.find((t) => t.slug === "the-marked"));

    c.scars = Array.from({ length: 5 }, (_, i) => ({
      slug: `s${i}`, name: `Scar ${i}`, glory: 1,
      description: ".", acquiredAt: i,
    }));
    r = maybeAwardTitles(c);
    assert(r.find((t) => t.slug === "the-marked"));
  });
  },
});
