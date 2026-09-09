// tests/chargen_width.test.ts -- Chargen/sheet lines stay ≤ 78 visual cols.
import { assert } from "@std/assert";
import "../splats/wta/index.ts";
import "../splats/mortal/index.ts";
import "../splats/kinfolk/index.ts";
import "../splats/vtm/index.ts";

import {
  formatDashboard,
  formatBudget,
  formatQueue,
  formatGiftList,
  formatSheet,
} from "../core/renderer.ts";
import { header, divider, footer, vlen, WIDTH } from "../core/format.ts";
import type { IWoDChar, IStepBudget } from "../core/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function assertFits78(label: string, text: string): void {
  const lines = text.split(/%r|\n/);
  const bad: string[] = [];
  for (const ln of lines) {
    const n = vlen(ln);
    if (n > WIDTH) {
      const plain = ln
        .replace(/%c[a-zA-Z]/g, "")
        .replace(/%[rntbR]/g, "");
      bad.push(`vis=${n} :: ${plain.slice(0, 90)}`);
    }
  }
  assert(
    bad.length === 0,
    `${label}: ${bad.length} line(s) > ${WIDTH}\n` +
      bad.join("\n"),
  );
}

function baseChar(over: Partial<IWoDChar> = {}): IWoDChar {
  return {
    id: "test-1",
    playerId: "player-with-a-very-long-name-xxxxxxxx",
    splat: "wta",
    status: "draft",
    chargenStep: 3,
    fullName: "Very Long Full Character Name That Goes On Forever",
    moniker: "",
    concept: "A really long concept string that should stress columns hard",
    nature: "Architect of the Long Word",
    demeanor: "Gallant Hero of Many Virtues",
    age: "25",
    breed: "homid",
    auspice: "ahroun",
    tribe: "fianna",
    attributePriority: ["physical", "social", "mental"],
    attributes: {
      Strength: 3, Dexterity: 2, Stamina: 2,
      Charisma: 2, Manipulation: 2, Appearance: 1,
      Perception: 1, Intelligence: 1, Wits: 1,
    },
    attributeSpecialties: {
      Strength: "Grappling With An Extremely Long Specialty Name",
    },
    abilityPriority: ["talents", "skills", "knowledges"],
    abilities: {
      Brawl: 3, Athletics: 3, Alertness: 3,
      Melee: 3, Drive: 2, Etiquette: 2,
      Academics: 2, Computer: 2, Enigmas: 1,
    },
    abilitySpecialties: {},
    backgrounds: {
      Allies: 3, Kinfolk: 2, Resources: 3,
      Contacts: 2, "Pure Breed": 2,
    },
    gifts: [
      "Razor Claws",
      "Something With A Really Long Gift Name Indeed",
      "Falling Touch",
      "Inspiration",
    ],
    rites: ["Rite of the Extremely Long Named Ceremony"],
    merits: { "Huge Merit Name That Is Quite Long": 3 },
    flaws: { "Enormous Flaw Description Name": 2 },
    renown: { glory: 2, honor: 1, wisdom: 0 },
    rage: 5,
    gnosis: 1,
    willpower: 4,
    freebiesRemaining: 15,
    freebiesLog: [],
    xpTotal: 0,
    xpSpent: 0,
    notes: [
      { name: "Long Note Name Here OK", isPublic: true, text: "x" },
    ],
    staffNotes: "A".repeat(100),
    statLog: [
      {
        trait: "Strength",
        old: 1,
        new: 3,
        staffId: "staff-with-long-id",
        at: 0,
      },
    ],
    createdAt: 0,
    updatedAt: 0,
    ...over,
  } as unknown as IWoDChar;
}

Deno.test("chrome helpers stay within 78", OPTS, () => {
  assertFits78("header", header("CHARGEN - Werewolf: The Apocalypse"));
  assertFits78("header long", header("X".repeat(120)));
  assertFits78("divider", divider("Attributes"));
  assertFits78("divider color", divider("%ch%crErrors%cn"));
  assertFits78("footer", footer());
});

Deno.test("formatDashboard stays within 78", OPTS, async () => {
  assertFits78("dashboard wta", await formatDashboard(baseChar()));
  assertFits78(
    "dashboard long mortal fields",
    await formatDashboard(baseChar({
      splat: "mortal",
      concept: "X".repeat(50),
      nature: "Y".repeat(50),
      demeanor: "Z".repeat(50),
      breed: undefined,
      auspice: undefined,
      tribe: undefined,
    })),
  );
});

Deno.test("formatBudget stays within 78", OPTS, async () => {
  const wide: IStepBudget = {
    step: 4,
    complete: false,
    remaining: {
      physicalDots: 2,
      socialDots: 0,
      mentalDots: 1,
      talentDots: 5,
      skillDots: 3,
      knowledgeDots: 2,
    },
    spent: {},
    caps: {},
    issues: [
      "This is a very long validation issue that goes way past " +
        "seventy eight columns and must be clipped",
    ],
  } as unknown as IStepBudget;
  assertFits78("budget wide", await formatBudget(wide));
});

Deno.test("formatQueue stays within 78", OPTS, async () => {
  assertFits78(
    "queue",
    await formatQueue([
      baseChar({ playerId: "P".repeat(40) }),
      baseChar({ tribe: "children-of-gaia", auspice: "galliard" }),
    ]),
  );
});

Deno.test("formatGiftList stays within 78", OPTS, async () => {
  // Gate message and full-table browse both must fit.
  assertFits78("gifts gate", await formatGiftList(baseChar()));
  assertFits78(
    "gifts all",
    await formatGiftList(baseChar(), "breed", "all"),
  );
});

Deno.test("formatSheet stays within 78", OPTS, async () => {
  assertFits78(
    "sheet",
    await formatSheet(baseChar(), true, "PlayerName"),
  );
  assertFits78(
    "sheet long moniker",
    await formatSheet(
      baseChar({ moniker: "M".repeat(80), fullName: "F".repeat(80) }),
      true,
    ),
  );
});
