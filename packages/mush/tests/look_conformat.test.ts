/**
 * Default CONFORMAT rows: compact name column, short-desc one line.
 */
import { assert, assertEquals } from "@std/assert";
import { defaultConformatHandler } from "../src/verbs/look.ts";
import type { IDBObj, IUrsamuSDK } from "../src/commands/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };
const WIDTH = 78;

const visualLen = (s: string): number =>
  s.replace(/<#[0-9a-fA-F]{6}>/g, "")
    .replace(/%c[a-zA-Z]/g, "")
    .replace(/%[nrtbR]/g, "")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .length;

function mockObj(
  id: string,
  name: string,
  flags: string[],
  state: Record<string, unknown> = {},
): IDBObj {
  return {
    id,
    name,
    flags: new Set(flags),
    state: { name, lastCommand: Date.now() - 3000, ...state },
    location: "1",
    contents: [],
  };
}

function mockU(meFlags: string[] = ["player", "connected"]): IUrsamuSDK {
  return {
    me: mockObj("42", "Looker", meFlags),
    canEdit: async (a: IDBObj, t: IDBObj) =>
      a.flags.has("admin") || a.id === t.id,
    util: {
      displayName: (o: IDBObj) => o.name ?? "?",
      stripSubs: (s: string) => s,
    },
  } as unknown as IUrsamuSDK;
}

Deno.test(
  "default CONFORMAT name col is compact; row fits 78",
  OPTS,
  async () => {
    const longSd =
      "a tall figure in a worn leather jacket watching " +
      "the rain fall outside the cafe window";
    const bob = mockObj("5", "Bob", ["player", "connected", "wizard"], {
      attributes: [{ name: "short-desc", value: longSd }],
    });
    const room = mockObj("1", "Hall", ["room"]);
    room.contents = [bob];

    const out = await defaultConformatHandler(mockU(), room, "#5");
    assert(out);
    const row = out.split("\n").find((l) => /\bBob\b/.test(l));
    assert(row, "player row present");
    assert(visualLen(row!) <= WIDTH, `row too wide: ${visualLen(row!)}`);
    // Name column was 39; short names must not leave a huge gap before role.
    const plain = row!.replace(/%c[a-zA-Z]/gi, "").replace(/%[nrtbR]/g, "");
    const roleAt = plain.indexOf("(Wizard)");
    assert(roleAt >= 0);
    assert(
      roleAt <= 28,
      `name column too wide: role starts at ${roleAt}`,
    );
    assert(/tall figure|leather/i.test(row!));
    // One physical line — no mid-prompt wrap
    assertEquals(row!.includes("\n"), false);
  },
);

Deno.test(
  "default CONFORMAT short-desc does not wrap via %r",
  OPTS,
  async () => {
    const alice = mockObj("9", "Alice", ["player", "connected"], {
      attributes: [{
        name: "short-desc",
        value: "first line%rsecond line that would wrap",
      }],
    });
    const room = mockObj("1", "Hall", ["room"]);
    room.contents = [alice];

    const out = await defaultConformatHandler(mockU(), room, "#9");
    const row = out!.split("\n").find((l) => /\bAlice\b/.test(l));
    assert(row);
    assertEquals(row!.includes("%r"), false);
    assertEquals(row!.includes("\n"), false);
    assert(visualLen(row!) <= WIDTH);
    assert(/first line/.test(row!));
  },
);
