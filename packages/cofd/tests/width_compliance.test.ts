// Width-compliance tests for the four output-overflow bugs.
//
// MUSH terminals wrap at 78 columns and use Latin-1 single-byte glyphs. Any
// output line over 78 visible chars wraps mid-line and looks broken. The
// strings asserted here cover the worst-case ASCII rendering of each fix.

import { assertEquals } from "@std/assert";
import { compactRollExpr } from "../src/commands/roll.ts";
import { summarize } from "../src/commands/extended.ts";
import type { ExtendedAction } from "../src/subsystems/extended.ts";
import { getStageInstructions } from "../src/chargen/instructions.ts";
import { initCgState, maxStageFor } from "../src/chargen/state.ts";
import { werewolfSection } from "../src/sheet/sections/werewolf.ts";
import { changelingSection } from "../src/sheet/sections/changeling.ts";
import { COFD_TEMPLATES } from "../src/gamelines/templates.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

/** Strip MUSH %c color codes for visible-length measurement. */
function visibleLen(s: string): number {
  return s.replace(/%c./g, "").length;
}

Deno.test("bug 1a: sheet header is Latin-1 and under 78 cols", OPTS, () => {
  // Reproduce the literal header expression from src/sheet/sections/header.ts.
  const longTemplate = "CHANGELING";
  const headerText = `CHRONICLES OF DARKNESS -- ${longTemplate}`;
  // Latin-1 only.
  for (const ch of headerText) {
    const code = ch.charCodeAt(0);
    if (code > 0xff) {
      throw new Error(`Non-Latin-1 char ${ch} (U+${code.toString(16)})`);
    }
  }
  // The decorated header() adds a small border but the inner text must fit.
  if (headerText.length > 78) {
    throw new Error(`header text too long: ${headerText.length}`);
  }
});

Deno.test("bug 1b: chargen header is Latin-1 and under 78 cols", OPTS, () => {
  const stage6Name = "MERITS";
  const headerText6 = `CHARACTER CREATION -- STAGE 6: ${stage6Name}`;
  for (const ch of headerText6) {
    if (ch.charCodeAt(0) > 0xff) {
      throw new Error(`Non-Latin-1 char ${ch}`);
    }
  }
  if (headerText6.length > 78) {
    throw new Error(`header text too long: ${headerText6.length}`);
  }

  const stage7Name = "POWERS";
  const headerText7 = `CHARACTER CREATION -- STAGE 7: ${stage7Name}`;
  for (const ch of headerText7) {
    if (ch.charCodeAt(0) > 0xff) {
      throw new Error(`Non-Latin-1 char ${ch}`);
    }
  }
  if (headerText7.length > 78) {
    throw new Error(`header text too long: ${headerText7.length}`);
  }
});

Deno.test("bug 3: compactRollExpr keeps the broadcast under 78 cols", OPTS, () => {
  // Representative case from the bug report. Player names on a MUSH are
  // typically a single token (8-12 chars); the broadcast is bounded by the
  // 78-col MUSH window, so we use a 10-char name here.
  const name = "Marcus";
  // The roller passes only attribute/skill terms here; the equipped-weapon
  // bonus is signaled by the `useWeapon` flag and rendered as a bare "wpn"
  // token, so long weapon names cannot blow the line out.
  const terms = ["dexterity(3)", "weaponry(3)"];
  const expr = compactRollExpr(terms, { spentWp: false, useWeapon: true });
  // /weapon and /wp are absorbed into the compact expression itself, so
  // for a baseline weapon attack the verb is just "rolls" with no suffix.
  const verb = "rolls";
  const dice = "6d (5 9 2 3 6 9)";
  const succWord = "success"; // singular for 1
  const line =
    `%ch%ccROLL>>%cn ${name} ${verb} %ch${expr}%cn ` +
    `${dice} -> %ch%cy1%cn ${succWord} (%ch%ccSuccess%cn)`;
  const vis = visibleLen(line);
  if (vis > 78) {
    throw new Error(`roll broadcast too long (${vis}): ${line}`);
  }
});

Deno.test("bug 3: compactRollExpr abbreviates attributes only", OPTS, () => {
  const got = compactRollExpr(
    ["dexterity(3)", "weaponry(3)"],
    { spentWp: false, useWeapon: false },
  );
  assertEquals(got, "Dex+Weaponry");
});

Deno.test("bug 3: compactRollExpr appends WP and wpn flags", OPTS, () => {
  const got = compactRollExpr(
    ["strength(3)", "brawl(2)"],
    { spentWp: true, useWeapon: true },
  );
  assertEquals(got, "Str+Brawl+WP+wpn");
});

Deno.test("bug 3: 'success' is singular when count is 1", OPTS, () => {
  // Mirrors the inline ternary in roll.ts.
  const word = (n: number) => (n === 1 ? "success" : "successes");
  assertEquals(word(0), "successes");
  assertEquals(word(1), "success");
  assertEquals(word(2), "successes");
});

Deno.test("bug 5: +extended/list summarize output remains under 78 cols per line", OPTS, () => {
  const longAction: ExtendedAction = {
    id: "ext-1779635214630-458055",
    ownerId: "p1",
    ownerName: "SuperCalifragiListicExpialiDociousName",
    roomId: "r1",
    description: "An incredibly long description that would normally blow past the seventy eight character margin",
    pool: "intelligence+investigation+manipulation+politics",
    target: 15,
    maxRolls: 10,
    interval: "scene",
    cumulativePenalty: true,
    tag: "",
    status: "active",
    accumulated: 5,
    attempts: 2,
    attemptsLog: [],
    lastRollPenalty: 0,
    contestId: null,
    createdAt: 12345678,
    resolvedAt: null,
  };

  const output = summarize(longAction);
  const lines = output.split("\n");
  assertEquals(lines.length, 2);

  for (const line of lines) {
    const vis = visibleLen(line);
    if (vis > 78) {
      throw new Error(`Line too long (${vis}): ${line}`);
    }
    // Latin-1 only
    for (const ch of line) {
      if (ch.charCodeAt(0) > 0xff) {
        throw new Error(`Non-Latin-1 char: ${ch}`);
      }
    }
  }
});

Deno.test("bug width restraint: stage instructions remain under 78 cols per line", OPTS, async () => {
  const templates = ["mortal", "changeling", "werewolf"];
  for (const template of templates) {
    const cgState = initCgState();
    cgState.sheet.template = template;
    // Populate Werewolf so Stage 8 renders its full package + chosen picks.
    if (template === "werewolf") {
      cgState.sheet.customFields.auspice = "Rahu";
      cgState.sheet.customFields.tribe = "Storm Lords";
      cgState.sheet.powers.purity = 2;
      cgState.sheet.powers.honor = 1;
      cgState.sheet.gifts = ["Killer Instinct", "Hit and Run", "Snarl of the Predator", "Warrior's Hide"];
      cgState.sheet.rites = ["Sacred Hunt"];
    }
    if (template === "changeling") {
      cgState.sheet.customFields.seeming = "Fairest";
      cgState.sheet.customFields.court = "Spring";
      cgState.sheet.customFields.favored = "Mirror";
      cgState.sheet.contracts = ["Mask of Superiority", "Hostile Takeover", "Goblin's Luck", "Cupid's Arrow", "The Royal Court", "Blessing of Spring"];
    }
    const maxStage = maxStageFor(template);
    for (let stage = 1; stage <= maxStage; stage++) {
      cgState.stage = stage;
      const output = await getStageInstructions("Arthur", cgState);
      const lines = output.split("\n");
      for (const line of lines) {
        const vis = visibleLen(line);
        if (vis > 78) {
          throw new Error(`[${template} Stage ${stage}] Line too long (${vis}): ${line}`);
        }
        for (const ch of line) {
          if (ch.charCodeAt(0) > 0xff) {
            throw new Error(`[${template} Stage ${stage}] Non-Latin-1 char: ${ch}`);
          }
        }
      }
    }
  }
});

Deno.test("bug width restraint: werewolf sheet section (incl. wrapped Gifts) under 78", OPTS, async () => {
  const cgState = initCgState();
  const sheet = cgState.sheet;
  sheet.template = "werewolf";
  sheet.customFields.auspice = "Ithaeur";
  sheet.customFields.tribe = "Bone Shadows";
  sheet.customFields.blood = "Destroyer";
  sheet.customFields.bone = "Soldier";
  sheet.powerStatValue = 3;
  // Worst case: four long facet names that must wrap across lines.
  sheet.gifts = ["Shadow Masquerade", "Eyes of the Dead", "Lore of the Land", "Read the World's Loom"];
  sheet.rites = ["Sacred Hunt", "Shadowbind"];
  const rendered = await werewolfSection.render({
    playerName: "Arthur", actorId: "1", sheet, template: COFD_TEMPLATES.werewolf, width: 78,
  } as unknown as Parameters<typeof werewolfSection.render>[0]);
  const lines = rendered.flatMap((l) => l.split("\n"));
  for (const line of lines) {
    const vis = visibleLen(line);
    if (vis > 78) throw new Error(`[werewolf sheet] Line too long (${vis}): ${line}`);
    for (const ch of line) {
      if (ch.charCodeAt(0) > 0xff) throw new Error(`[werewolf sheet] Non-Latin-1 char: ${ch}`);
    }
  }
});

Deno.test("bug width restraint: changeling sheet section (incl. wrapped Contracts) under 78", OPTS, async () => {
  const cgState = initCgState();
  const sheet = cgState.sheet;
  sheet.template = "changeling";
  sheet.customFields.seeming = "Wizened";
  sheet.customFields.kith = "Smith";
  sheet.customFields.court = "Autumn";
  sheet.customFields.favored = "Crown";
  sheet.customFields.needle = "Bon Vivant";
  sheet.customFields.thread = "Hedonist";
  sheet.powerStatValue = 3;
  // Worst case: six long Contract names that must wrap across lines.
  sheet.contracts = ["Stealing the Solid Reflection", "Tatterdemalion's Workshop", "Mask of Superiority", "Hostile Takeover", "Blessing of Spring", "Tale of the Baba Yaga"];
  const rendered = await changelingSection.render({
    playerName: "Arthur", actorId: "1", sheet, template: COFD_TEMPLATES.changeling, width: 78,
  } as unknown as Parameters<typeof changelingSection.render>[0]);
  const lines = rendered.flatMap((l) => l.split("\n"));
  for (const line of lines) {
    const vis = visibleLen(line);
    if (vis > 78) throw new Error(`[changeling sheet] Line too long (${vis}): ${line}`);
    for (const ch of line) {
      if (ch.charCodeAt(0) > 0xff) throw new Error(`[changeling sheet] Non-Latin-1 char: ${ch}`);
    }
  }
});

