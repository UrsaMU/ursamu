// tests/backgrounds.test.ts -- W20 Backgrounds catalog invariants,
// prototype-pollution guard, and a command-renders smoke test.

import { assert, assertEquals } from "@std/assert";
import { cmds } from "@ursamu/ursamu";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

import "../commands/background.ts";

import {
  WTA_BACKGROUNDS,
  allBackgrounds,
  getBackground,
} from "../splats/wta/data/backgrounds.ts";
import { WTA_TRIBES } from "../splats/wta/data/tribes.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// -- Data catalog -----------------------------------------------------------

Deno.test("WTA_BACKGROUNDS: >=11 entries, slug==key, kebab slugs unique", OPTS, () => {
  const xs = allBackgrounds();
  assert(xs.length >= 11, `expected >=11 backgrounds, got ${xs.length}`);
  const slugs = new Set<string>();
  for (const [key, def] of Object.entries(WTA_BACKGROUNDS)) {
    assertEquals(key, def.slug, `key must equal slug for ${key}`);
    assert(/^[a-z0-9][a-z0-9-]*$/.test(def.slug), `bad slug: ${def.slug}`);
    assert(!slugs.has(def.slug), `dup slug: ${def.slug}`);
    slugs.add(def.slug);
    assert(def.name.length > 0, `name required: ${def.slug}`);
    assert(def.description.length > 0, `description required: ${def.slug}`);
  }
});

Deno.test("WTA_BACKGROUNDS: every entry describes all 5 dot levels", OPTS, () => {
  for (const def of allBackgrounds()) {
    for (const lvl of [1, 2, 3, 4, 5] as const) {
      const desc = def.dots[lvl];
      assert(typeof desc === "string" && desc.length > 0,
        `${def.slug}: dot ${lvl} must be a non-empty string`);
    }
  }
});

Deno.test("WTA_BACKGROUNDS: canon 11 are all present", OPTS, () => {
  for (const slug of [
    "allies", "ancestors", "contacts", "fetish", "kinfolk", "mentor",
    "past-life", "pure-breed", "resources", "rites", "totem",
  ]) {
    assert(getBackground(slug), `missing canon background: ${slug}`);
  }
});

Deno.test("WTA_BACKGROUNDS: restrictedTo arrays reference real tribe displayNames", OPTS, () => {
  const known = new Set(WTA_TRIBES.map((t) => t.displayName));
  for (const def of allBackgrounds()) {
    if (!def.restrictedTo) continue;
    assert(def.restrictedTo.length > 0,
      `${def.slug}: restrictedTo must be omitted or non-empty`);
    for (const tribe of def.restrictedTo) {
      assert(known.has(tribe),
        `${def.slug}: restrictedTo "${tribe}" is not a real tribe displayName`);
    }
  }
});

Deno.test("Pure Breed has the Silver Fang dot-ladder gating note", OPTS, () => {
  const pb = getBackground("pure-breed");
  assert(pb);
  assertEquals(pb!.restrictedTo, ["Silver Fangs"]);
  assert(/silver fang/i.test(pb!.notes ?? ""), "Pure Breed notes should mention Silver Fangs");
});

// -- Lookup guards ----------------------------------------------------------

Deno.test("getBackground: own-property guard rejects prototype keys", OPTS, () => {
  assertEquals(getBackground("toString"), undefined);
  assertEquals(getBackground("__proto__"), undefined);
  assertEquals(getBackground("constructor"), undefined);
  assertEquals(getBackground("hasOwnProperty"), undefined);
  assertEquals(getBackground(""), undefined);
});

Deno.test("getBackground: case-insensitive lookup on canonical slugs", OPTS, () => {
  const sample = Object.keys(WTA_BACKGROUNDS)[0];
  assert(getBackground(sample) !== undefined);
  assert(getBackground(sample.toUpperCase()) !== undefined);
  assert(getBackground(`  ${sample}  `) !== undefined);
});

// -- Command renders --------------------------------------------------------

function getExec(name: string): (u: IUrsamuSDK) => Promise<void> {
  const c = cmds.find((x) => x.name === name);
  if (!c) throw new Error(`command ${name} not registered`);
  return c.exec as (u: IUrsamuSDK) => Promise<void>;
}

function mockU(args: string[]) {
  const sent: string[] = [];
  const me: IDBObj = {
    id: "bg-tester",
    name: "Storms",
    flags: new Set(["player", "connected"]),
    state: {},
    location: "room-1",
    contents: [],
  };
  return Object.assign({
    me,
    here: { id: "room-1", name: "Room", flags: new Set(["room"]), state: {}, location: "", contents: [] },
    cmd: { name: "+background", original: "", args, switches: [] },
    send: (m: string) => sent.push(m),
    broadcast: () => {},
    canEdit: () => Promise.resolve(true),
    db: {
      modify: () => Promise.resolve(),
      search: () => Promise.resolve([]),
      create: () => Promise.resolve({}),
      destroy: () => Promise.resolve(),
    },
    util: {
      target: () => Promise.resolve(null),
      displayName: (o: IDBObj) => o.name ?? "Unknown",
      stripSubs: (s: string) => s.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, ""),
      center: (s: string) => s,
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
    },
  } as unknown as IUrsamuSDK, { _sent: sent });
}

Deno.test("+background lists all canon entries", OPTS, async () => {
  const exec = getExec("+background");
  const u = mockU([undefined as unknown as string, ""]);
  await exec(u);
  const out = (u as unknown as { _sent: string[] })._sent.join("\n");
  for (const name of ["Allies", "Ancestors", "Pure Breed", "Totem", "Resources"]) {
    assert(out.includes(name), `list should mention ${name}`);
  }
});

Deno.test("+background/info <slug> renders dot ladder", OPTS, async () => {
  const exec = getExec("+background");
  const u = mockU(["info", "pure-breed"]);
  await exec(u);
  const out = (u as unknown as { _sent: string[] })._sent.join("\n");
  assert(out.includes("Pure Breed"), "should render Pure Breed");
  assert(out.includes("Silver Fangs"), "should mention tribe gating");
  // All 5 dot rungs must appear.
  assert(/Noticeably well-bred/.test(out));
  assert(/near-mythic|mythic pedigree/i.test(out));
});

Deno.test("+background/info on unknown slug rejects", OPTS, async () => {
  const exec = getExec("+background");
  const u = mockU(["info", "nonsense"]);
  await exec(u);
  const out = (u as unknown as { _sent: string[] })._sent.join("\n");
  assert(/no background/i.test(out));
});
