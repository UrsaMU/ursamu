import { assertEquals, assert } from "@std/assert";
import {
  assembleLook,
  composeBaseDesc,
  composeGearClause,
  fillOpener,
  frameStreetLook,
  paintMonikerInProse,
  resolveLookSync,
  resolveOpener,
  rollAffectation,
  wrapPara,
} from "../engine/desc.ts";
import {
  parseSex,
  pronounsFor,
} from "../engine/pronouns.ts";
import { LOOK_OPENERS } from "../engine/catalog.ts";
import { defaultChar } from "../db/schemas.ts";
import type { IDBObj } from "@ursamu/mush";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function thing(
  name: string,
  slot: "worn" | "wielded" | "carried",
  kind = "gear",
): IDBObj {
  return {
    id: name,
    name,
    flags: new Set(["thing"]),
    state: {
      sprawl_item: {
        slug: name.toLowerCase().replace(/\s+/g, "-"),
        kind,
        load: 1,
        slot,
      },
    },
    contents: [],
  } as unknown as IDBObj;
}

Deno.test("SEX parse and pronouns", OPTS, () => {
  assertEquals(parseSex("Female"), "female");
  assertEquals(pronounsFor("female").subj, "she");
});

Deno.test("look-openers d66 table is full", OPTS, () => {
  assertEquals(LOOK_OPENERS.length, 36);
});

Deno.test("fillOpener conjugates for she vs they", OPTS, () => {
  const tpl =
    "{name} {cuts} the figure of a {vibe} who {looks} tired";
  assertEquals(
    fillOpener(tpl, "Neon", "Nodejacker", pronounsFor("female")),
    "Neon cuts the figure of a Nodejacker who looks tired",
  );
  assertEquals(
    fillOpener(tpl, "Ghost", "Ghostrunner", pronounsFor("plural")),
    "Ghost cut the figure of a Ghostrunner who look tired",
  );
});

Deno.test("opener is sticky via lookOpener slug", OPTS, () => {
  const c = defaultChar("Neon");
  c.lookOpener = "debt-and-chrome";
  assertEquals(resolveOpener(c).slug, "debt-and-chrome");
});

Deno.test("@desc body (state.description) still gets live gear", OPTS, () => {
  const c = defaultChar("Neon");
  const me = {
    id: "p1",
    name: "Neon",
    flags: new Set(["player"]),
    state: { description: "A scarred goon in a cheap suit." },
    contents: [],
  } as unknown as IDBObj;
  const p = pronounsFor("female");
  const look = resolveLookSync("Neon", c, [
    thing("Charon PKD-45", "wielded", "firearm"),
    thing("Motorcycle Leathers", "worn", "armor"),
  ], p, me);
  assert(look.startsWith("A scarred goon in a cheap suit."));
  assert(look.includes("Motorcycle Leathers"));
  assert(look.includes("Charon PKD-45"));
  const stowed = resolveLookSync("Neon", c, [
    thing("Motorcycle Leathers", "worn", "armor"),
    thing("Charon PKD-45", "carried", "firearm"),
  ], p, me);
  assert(stowed.startsWith("A scarred goon in a cheap suit."));
  assert(!stowed.includes("Charon PKD-45"));
});

Deno.test("table base + gear", OPTS, () => {
  const c = defaultChar("Neon");
  c.backgroundName = "Nodejacker";
  c.affectations = ["NeonPunk"];
  c.lookOpener = "rain-wet-neon";
  const p = pronounsFor("female");
  const { text } = composeBaseDesc("Neon", c, p);
  assert(text.includes("rain-slick neon"));
  assert(!text.includes("Worn open"));
  const full = assembleLook(
    text,
    composeGearClause(p, [
      thing("Monoknife", "wielded", "melee"),
    ]),
  );
  assert(full.includes("Monoknife"));
});

function plain(s: string): string {
  return s
    .replace(/%c[a-z]/gi, "")
    .replace(/%[rntb]/gi, "")
    .replace(/<#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})>/g, "")
    .replace(/\x1b\[[0-9;]*m/g, "");
}

Deno.test("gear clause is cyberpunk street prose", OPTS, () => {
  const gear = composeGearClause(pronounsFor("male"), [
    thing("Motorcycle Leathers", "worn", "armor"),
  ]);
  assert(gear.includes("He move"));
  assert(gear.includes("Motorcycle Leathers"));
  const gun = composeGearClause(pronounsFor("female"), [
    thing("Charon PKD-45", "wielded", "firearm"),
  ]);
  assert(gun.includes("rides low"));
  assert(gun.includes("Charon PKD-45"));
});

Deno.test("boarded vehicle weaves into gear clause", OPTS, () => {
  const c = defaultChar("Neon");
  c.activeVehicleId = "v1";
  const items = [
    {
      id: "v1",
      name: "Tanksuit",
      flags: new Set(["thing"]),
      state: {
        sprawl_item: {
          slug: "tanksuit",
          kind: "vehicle",
          load: 0,
          ds: 14,
        },
      },
      contents: [],
    } as unknown as IDBObj,
  ];
  const look = resolveLookSync(
    "Neon",
    c,
    items,
    pronounsFor("female"),
  );
  const p = plain(look);
  assert(p.includes("jacked into"));
  assert(p.includes("the Tanksuit"));
  assert(p.includes("hull between her and the street"));
});

Deno.test("street tint keeps multi-word phrases", OPTS, () => {
  const t = assembleLook(
    "Under rain-slick neon, debt and chrome.",
    "She is jacked into the Tanksuit.",
  );
  assert(t.includes("%cc"));
  assert(plain(t).includes("jacked into"));
  assert(plain(t).includes("rain-slick neon"));
});

Deno.test("frameStreetLook wraps LOOK chrome", OPTS, () => {
  const f = frameStreetLook("She moves in leathers.", {
    name: "Neon",
  });
  assert(f.includes("LOOK"));
  assert(f.includes("NEON"));
  assert(f.includes("SPRAWL"));
  assert(f.includes("She moves in leathers."));
  for (const line of f.split("\n")) {
    if (!line.trim()) continue;
    assert(
      plain(line).length <= 78,
      `line over 78: ${plain(line).length} ${plain(line)}`,
    );
  }
});

Deno.test("paintMonikerInProse swaps plain name for moniker", OPTS, () => {
  const mon = "<#ff0000>g<#00ff00>Litch.exe";
  const prose =
    "Cargo-bay echoes seem to follow gLitch.exe, residual noise.";
  const out = paintMonikerInProse(prose, "gLitch.exe", mon);
  assert(out.includes("<#ff0000>"));
  assert(plain(out).includes("follow gLitch.exe"));
  // No extra moniker line — single prose block
  assert(!out.startsWith(mon));
  const framed = frameStreetLook(out, { name: "gLitch.exe" });
  assert(plain(framed).includes("GLITCH.EXE") || framed.includes("LOOK"));
  // Frame has no separate moniker nameHdr line with role
  assert(!plain(framed).includes("GANG WAR"));
});

Deno.test("wrapPara uses visible width for moniker words", OPTS, () => {
  const mon =
    "<#ff0000>g<#ff1100>L<#ff2200>i<#ff3300>t<#ff4400>c" +
    "<#ff5500>h<#ff6600>.<#ff7700>e<#ff8800>x<#ff9900>e";
  const text =
    `Cargo-bay echoes seem to follow ${mon}, residual ` +
    `noise of a working Gang War Surplus`;
  const wrapped = wrapPara(text, 60);
  const alone = wrapped.split("\n").some((l) => {
    const p = plain(l).trim();
    return p === "gLitch.exe," || p === "gLitch.exe";
  });
  assert(!alone, `name alone on a line:\n${wrapped}`);
  assert(plain(wrapped).includes("follow gLitch.exe"));
});

Deno.test("wrapPara peels weak endings and orphans", OPTS, () => {
  const text =
    "He moves in Motorcycle Leathers, cut for wet nights " +
    "and bad lighting, and an Orchard Technologies Machine " +
    "Link rides low and mean, safety off, street-ready in " +
    "his grip.";
  const wrapped = wrapPara(text, 76);
  const lines = wrapped.split("\n").map((l) => plain(l));
  for (const l of lines) {
    assert(l.length <= 76, `content over 76: ${l.length} ${l}`);
    assert(
      !/\b(a|an|and|the|of|to)$/i.test(l.trim()),
      `weak end: ${l}`,
    );
  }
});

Deno.test("framed look body lines stay ≤78", OPTS, () => {
  const mon = "<#ff0000>g<#00ff00>L<#0000ff>itch.exe";
  let base =
    "gLitch.exe looks borrowed from someone else's timeline: " +
    "a Gang War Surplus on temporary lease, his silhouette " +
    "cut hard toward synth tech-hair that shifts colour and " +
    "cut, and tactical gloves tucked where scanners might " +
    "miss them.";
  base = paintMonikerInProse(base, "gLitch.exe", mon);
  const gear = composeGearClause(pronounsFor("male"), [
    thing("Motorcycle Leathers", "worn", "armor"),
    thing(
      "Orchard Technologies® Machine Link",
      "wielded",
      "firearm",
    ),
  ]);
  const framed = frameStreetLook(assembleLook(base, gear), {
    name: "gLitch.exe",
  });
  for (const line of framed.split("\n")) {
    if (!line.trim()) continue;
    const p = plain(line);
    assert(
      p.length <= 78,
      `framed over 78 (${p.length}): ${p}`,
    );
  }
  const body = framed.split("\n")
    .map((l) => plain(l).trim())
    .filter((l) =>
      l && !/^[=-]+$/.test(l) && !/^LOOK/.test(l) &&
      l !== "SPRAWL"
    );
  assert(
    !body.some((l) => / (a|an|and)$/i.test(l)),
    `weak EOL in body:\n${body.join("\n")}`,
  );
});

Deno.test("rollAffectation shape", OPTS, () => {
  assert(rollAffectation([], () => 1)?.phrase);
});

Deno.test("assembleLook joins cleanly", OPTS, () => {
  const joined = assembleLook(
    "Base sentence.",
    "She wears leathers.",
  );
  assertEquals(plain(joined), "Base sentence.\nShe wears leathers.");
});

Deno.test("baseParagraph empty after clear (no opener)", OPTS, () => {
  const c = defaultChar("Neon");
  c.affectations = [];
  c.accessories = [];
  c.baseDesc = "";
  c.lookOpener = undefined;
  const me = {
    id: "p1",
    name: "Neon",
    flags: new Set(["player"]),
    state: { description: "" },
    contents: [],
  } as unknown as IDBObj;
  const look = resolveLookSync(
    "Neon",
    c,
    [],
    pronounsFor("female"),
    me,
  );
  assertEquals(plain(look).trim(), "");
});

Deno.test("accessories do not all end badge-scanner glare", OPTS, () => {
  const c = defaultChar("Neon");
  c.lookOpener = "rain-wet-neon";
  c.affectations = ["NeonPunk"];
  c.accessories = ["mirrorshades", "filter-mask"];
  const { text: a } = composeBaseDesc(
    "Neon",
    c,
    pronounsFor("female"),
  );
  c.lookOpener = "soft-threat";
  c.accessories = ["data-cables"];
  const { text: b } = composeBaseDesc(
    "Ghost",
    c,
    pronounsFor("male"),
  );
  // Old template was a single fixed closer on every kit
  const bothGlare =
    a.includes("badge-scanner glare") &&
    b.includes("badge-scanner glare");
  assert(!bothGlare, "every look used badge-scanner glare");
  assert(a.toLowerCase().includes("mirror") ||
    a.includes("filter") || a.includes("kit") ||
    a.includes("streetlight") || a.includes("scanner") ||
    a.includes("details"));
});
