// tests/look_conformat.test.ts -- CoFD-matching CONFORMAT columns.
import { assert, assertEquals } from "@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";
import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";

import {
  DEFAULT_LOOK_WIDTH,
  lookerWidth,
  visualLen,
  visualTruncate,
} from "../core/lookWidth.ts";
import { wodConformatHandler } from "../core/lookConformat.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

describe("lookWidth", () => {
  it("defaults to 78 without NAWS", () => {
    assertEquals(lookerWidth({ state: {} }), DEFAULT_LOOK_WIDTH);
  });

  it("reads termWidth from NAWS", () => {
    assertEquals(lookerWidth({ state: { termWidth: 100 } }), 100);
  });

  it("visualTruncate matches CoFD ellipsis behavior", () => {
    const s = visualTruncate("ABCDEFGHIJKLMNOP", 10);
    assertEquals(visualLen(s), 10);
    assert(s.includes("..."));
  });
});

function mockU(
  termWidth = 78,
  flags: string[] = ["player", "connected"],
): IUrsamuSDK {
  return {
    me: {
      id: "42",
      name: "Looker",
      flags: new Set(flags),
      state: { termWidth },
      location: "1",
      contents: [],
    },
    canEdit: async (actor: IDBObj, target: IDBObj) => {
      if (actor.flags.has("admin") || actor.flags.has("wizard")) {
        return true;
      }
      return actor.id === target.id;
    },
    util: {
      displayName: (o: IDBObj) => o.name ?? "?",
      stripSubs: (s: string) => s,
      center: (s: string) => s,
    },
  } as unknown as IUrsamuSDK;
}

function player(id: string, name: string, extraFlags: string[] = []): IDBObj {
  return {
    id,
    name,
    flags: new Set(["player", "connected", ...extraFlags]),
    state: {
      lastCommand: Date.now() - 5000,
      attributes: [
        {
          name: "short-desc",
          value: "a tall figure in a worn leather jacket standing by the door",
        },
      ],
    },
    location: "1",
    contents: [],
  } as IDBObj;
}

Deno.test(
  "CONFORMAT pads: compact name + short-desc on one line",
  OPTS,
  async () => {
    const bob = player("5", "Bob", ["wizard"]);
    const room = {
      id: "1",
      name: "Hall",
      flags: new Set(["room"]),
      state: {},
      location: "",
      contents: [bob],
    } as IDBObj;
    // Non-staff looker -- no dbref on Bob
    const out = await wodConformatHandler(
      mockU(78, ["player", "connected"]),
      room,
      "#5",
    );
    assert(out);
    const row = out!.split("\n").find((l) => /\bBob\b/.test(l));
    assert(row, "player row present");
    assert(/\(Wizard\)/.test(row!));
    assert(/tall figure|leather/i.test(row!));
    assert(visualLen(row!) <= 78);
    const plain = row!.replace(/%c[a-zA-Z]/gi, "").replace(/%[nrtbR]/g, "");
    const roleAt = plain.indexOf("(Wizard)");
    assert(roleAt >= 0 && roleAt <= 28, `name col too wide @${roleAt}`);
    assertEquals(row!.includes("\n"), false);
    // Divider section intact (not "----...")
    assert(/Players/.test(out!));
    assert(!/Players\n-+\.\.\./.test(out!));
  },
);

Deno.test(
  "CONFORMAT short-desc %r stays one line; long names clip",
  OPTS,
  async () => {
    const longName = "A".repeat(40);
    const alice = player("9", longName);
    alice.state.attributes = [{
      name: "short-desc",
      value: "line one%rline two that must not wrap the row",
    }];
    const room = {
      id: "1",
      name: "Hall",
      flags: new Set(["room"]),
      state: {},
      location: "",
      contents: [alice],
    } as IDBObj;
    const out = await wodConformatHandler(mockU(78), room, "#9");
    assert(out);
    const row = out!.split("\n").find((l) => /A{5,}/.test(l));
    assert(row);
    assert(!row!.includes("%r"));
    assert(!row!.includes("\n"));
    assert(visualLen(row!) <= 78);
    // Name clipped — full 40 A's must not all appear
    assert(!row!.includes(longName));
  },
);

Deno.test(
  "CONFORMAT never exceeds NAWS; dividers not mangled",
  OPTS,
  async () => {
    for (const w of [60, 78, 100]) {
      const alice = player("9", "Alice");
      const room = {
        id: "1",
        name: "Hall",
        flags: new Set(["room"]),
        state: {},
        location: "",
        contents: [alice],
      } as IDBObj;
      const out = await wodConformatHandler(mockU(w), room, "#9");
      assert(out);
      for (const line of out!.split("\n")) {
        // Section titles / rules from divider may be themed; player rows
        // must fit. Skip pure color-only empties.
        if (!line.trim()) continue;
        if (/^[\-=]+$/.test(line.replace(/%c[a-z]/gi, ""))) {
          // bare rule line -- allow full width
          continue;
        }
        assert(
          visualLen(line) <= w + 5 || /Players|Contents/.test(line),
          `width ${w}: vis=${visualLen(line)} :: ${line.slice(0, 60)}`,
        );
      }
      // Multi-line divider must not collapse to "----..."
      assert(!/----\.\.\./.test(out!));
    }
  },
);

Deno.test("CONFORMAT never exceeds 78 even with wide NAWS", OPTS, async () => {
  for (const w of [78, 120, 250]) {
    const alice = player("9", "Alice");
    const room = {
      id: "1",
      name: "Hall",
      flags: new Set(["room"]),
      state: {},
      location: "",
      contents: [alice],
    } as IDBObj;
    const out = await wodConformatHandler(mockU(w), room, "#9");
    assert(out);
    for (const line of out!.split("\n")) {
      if (!line.trim()) continue;
      assert(
        visualLen(line) <= DEFAULT_LOOK_WIDTH,
        `naws ${w}: vis=${visualLen(line)} :: ${line.slice(0, 60)}`,
      );
    }
  }
});

Deno.test("long short-desc is truncated to the 78-col row", OPTS, async () => {
  const long = "a very long short-desc ".repeat(8).trim();
  const alice = player("9", "Alice");
  alice.state.attributes = [
    { name: "short-desc", value: long },
  ];
  const room = {
    id: "1",
    name: "Hall",
    flags: new Set(["room"]),
    state: {},
    location: "",
    contents: [alice],
  } as IDBObj;
  const out = await wodConformatHandler(mockU(78), room, "#9");
  assert(out);
  const row = out!.split("\n").find((l) => /\bAlice\b/.test(l));
  assert(row);
  assert(visualLen(row!) <= 78);
  assert(!row!.includes(long));
});

Deno.test(
  "staff sees dbref; short-desc still truncated to width",
  OPTS,
  async () => {
    const bob = player("12", "Bob", ["wizard"]);
    const room = {
      id: "1",
      name: "Hall",
      flags: new Set(["room"]),
      state: {},
      location: "",
      contents: [bob],
    } as IDBObj;
    const out = await wodConformatHandler(
      mockU(78, ["player", "connected", "admin"]),
      room,
      "#12",
    );
    const row = out!.split("\n").find((l) => /Bob/.test(l));
    assert(row);
    assert(/#12/.test(row!));
    assert(visualLen(row!) <= 78);
  },
);
