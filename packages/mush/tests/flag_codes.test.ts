/**
 * Flag short-codes on staff dbrefs: (#12ed) for exit+dark, etc.
 */
import { assertEquals } from "@std/assert";
import {
  flagCodes,
  dbrefWithFlags,
  flags,
  unknownFlagNames,
} from "../src/world/flags.ts";
import { execLook } from "../src/verbs/look.ts";
import type { IDBObj, IUrsamuSDK } from "../src/commands/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("flagCodes maps known flags", OPTS, () => {
  assertEquals(flagCodes("dark"), "d");
  assertEquals(flagCodes("exit dark"), "ed");
  assertEquals(flagCodes(new Set(["exit", "dark"])), "ed");
  assertEquals(flagCodes("enter_ok"), "E");
  assertEquals(flagCodes("builder dark"), "bd");
  assertEquals(flagCodes("fae"), "F");
  assertEquals(flagCodes("forsaken"), "N");
});

Deno.test("flagCodes are single-letter and case-distinct", OPTS, () => {
  // wizard W vs staff w — upper/lower are different flags
  assertEquals(flagCodes("wizard"), "W");
  assertEquals(flagCodes("staff"), "w");
  assertEquals(flagCodes("wizard staff"), "Ww");
  assertEquals(flagCodes("superuser"), "U");
  assertEquals(flagCodes("storyteller"), "T");
  assertEquals(flagCodes("werewolf"), "f");
  assertEquals(flagCodes("ghoul"), "G");
  // every emitted code is exactly one character
  assertEquals(flagCodes("approved"), "A");
  assertEquals(flagCodes("ic"), "I");
  const sample = flagCodes(
    "superuser admin wizard staff storyteller builder approved " +
      "player safe void dark guest room ic exit connected " +
      "mortal ghoul vampire werewolf kinfolk fae forsaken " +
      "link_ok enter_ok visual opaque",
  );
  assertEquals([...sample].every((ch) => ch.length === 1), true);
  assertEquals(sample.includes("wiz"), false);
  assertEquals(sample.includes("su"), false);
  assertEquals(sample.includes("["), false);
});

Deno.test("flagCodes skips unknown flags", OPTS, () => {
  assertEquals(flagCodes("dark not_a_flag"), "d");
  assertEquals(flagCodes(""), "");
  assertEquals(flagCodes(undefined), "");
});

Deno.test("fae and forsaken are registered for Tags.set", OPTS, () => {
  assertEquals(!!flags.exists("fae"), true);
  assertEquals(!!flags.exists("forsaken"), true);
  const r = flags.set("player connected", {}, "fae");
  assertEquals(/\bfae\b/.test(r.tags), true);
  const r2 = flags.set(r.tags, {}, "!fae forsaken");
  assertEquals(/\bfae\b/.test(r2.tags), false);
  assertEquals(/\bforsaken\b/.test(r2.tags), true);
});

Deno.test("unknownFlagNames catches unregistered adds", OPTS, () => {
  assertEquals(unknownFlagNames("fae"), []);
  assertEquals(unknownFlagNames("!fae"), []);
  assertEquals(unknownFlagNames("not_a_real_flag"), ["not_a_real_flag"]);
  assertEquals(
    unknownFlagNames("fae bogon !dark"),
    ["bogon"],
  );
});

Deno.test("dbrefWithFlags joins id and codes", OPTS, () => {
  assertEquals(
    dbrefWithFlags("12", new Set(["exit", "dark"])),
    "#12ed",
  );
  assertEquals(dbrefWithFlags("5", "room"), "#5r");
});

function mockObj(
  id: string,
  flags: string[],
  extra: Partial<IDBObj> = {},
): IDBObj {
  return {
    id,
    name: id,
    flags: new Set(flags),
    state: { name: id },
    location: "room1",
    contents: [],
    ...extra,
  };
}

function mockU(opts: {
  meFlags?: string[];
  here: IDBObj;
  canEditIds?: string[];
}): IUrsamuSDK & { _sent: string[] } {
  const sent: string[] = [];
  const me = mockObj("p1", opts.meFlags ?? ["player", "connected"]);
  me.location = opts.here.id;
  const canEditIds = new Set(opts.canEditIds ?? []);
  return {
    me,
    here: opts.here,
    cmd: { name: "look", original: "look", args: [], switches: [] },
    send: (m: string) => {
      sent.push(m);
    },
    broadcast: () => {},
    canEdit: (_a: IDBObj, t: IDBObj) => Promise.resolve(canEditIds.has(t.id)),
    db: {
      modify: () => Promise.resolve(),
      search: () => Promise.resolve([]),
      create: () => Promise.resolve(mockObj("99", [])),
      destroy: () => Promise.resolve(),
    },
    attr: {
      get: () => Promise.resolve(null),
      set: () => Promise.resolve(),
      clear: () => Promise.resolve(false),
    },
    util: {
      target: () => Promise.resolve(null),
      displayName: (o: IDBObj) =>
        (o.state?.name as string) || o.name || "?",
      stripSubs: (s: string) => s,
      center: (s: string) => s,
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
    },
    _sent: sent,
  } as unknown as IUrsamuSDK & { _sent: string[] };
}

Deno.test(
  "staff look shows flag codes on dark exits",
  OPTS,
  async () => {
    const dark = mockObj("12", ["exit", "dark"], {
      state: { name: "Secret;s" },
    });
    const room = mockObj("1", ["room"], {
      state: { name: "Hall", description: "A hall." },
      contents: [dark],
    });
    const u = mockU({
      meFlags: ["player", "connected", "wizard"],
      here: room,
      canEditIds: [],
    });
    await execLook(u);
    const out = u._sent[0];
    // Dark exit visible to staff with #12ed
    assertEquals(out.includes("Secret"), true);
    assertEquals(out.includes("(#12ed)"), true);
  },
);

Deno.test("IC room look title includes [IC] tag", OPTS, async () => {
  const room = mockObj("14", ["room", "ic"], {
    state: {
      name: "Blackfriars Circus;IC;hub",
      description: "Fog.",
    },
    contents: [],
  });
  const u = mockU({
    meFlags: ["player", "connected"],
    here: room,
  });
  await execLook(u);
  const out = u._sent[0] ?? "";
  assertEquals(out.includes("Blackfriars Circus"), true);
  assertEquals(out.includes("[IC]"), true);
  // aliases stripped from title
  assertEquals(out.includes("Circus;IC"), false);
});

Deno.test(
  "mortal look does not show dbref flag codes",
  OPTS,
  async () => {
    const lit = mockObj("12", ["exit"], {
      state: { name: "East;e" },
    });
    const room = mockObj("1", ["room"], {
      state: { name: "Hall", description: "A hall." },
      contents: [lit],
    });
    const u = mockU({
      meFlags: ["player", "connected"],
      here: room,
      canEditIds: [],
    });
    await execLook(u);
    const out = u._sent[0];
    assertEquals(out.includes("East"), true);
    assertEquals(out.includes("(#12"), false);
  },
);
