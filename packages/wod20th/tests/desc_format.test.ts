// tests/desc_format.test.ts -- DESCFORMAT plane description for engine look.
import { assertEquals } from "@std/assert";
import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";
import { wodDescFormat } from "../core/descFormat.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mockU(reality: string): IUrsamuSDK {
  return {
    me: {
      id: "p1",
      name: "Storms",
      flags: new Set(["player"]),
      state: { reality },
      location: "r1",
      contents: [],
    },
    util: {
      parseDesc: async (s: string) => s,
    },
  } as unknown as IUrsamuSDK;
}

function room(state: Record<string, unknown>): IDBObj {
  return {
    id: "r1",
    name: "Pool",
    flags: new Set(["room"]),
    state,
    location: "",
    contents: [],
  } as IDBObj;
}

Deno.test("DESCFORMAT: material uses default (null)", OPTS, async () => {
  const out = await wodDescFormat(
    mockU("material"),
    room({
      description: "Still water.",
      penumbraDescription: "Silver portal.",
    }),
    "Still water.",
  );
  assertEquals(out, null);
});

Deno.test("DESCFORMAT: penumbra prefers plane desc", OPTS, async () => {
  const out = await wodDescFormat(
    mockU("penumbra"),
    room({
      description: "Still water.",
      penumbraDescription: "Silver portal.",
    }),
    "Still water.",
  );
  assertEquals(out, "Silver portal.");
});

Deno.test("DESCFORMAT: penumbra with no plane desc falls through", OPTS, async () => {
  const out = await wodDescFormat(
    mockU("penumbra"),
    room({ description: "Still water." }),
    "Still water.",
  );
  assertEquals(out, null);
});
