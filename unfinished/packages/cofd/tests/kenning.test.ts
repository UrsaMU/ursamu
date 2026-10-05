// +kenning — fae perception (Wits + Wyrd).

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import { defaultSheet } from "../src/stats/index.ts";
import { kenningExec } from "../src/commands/kenning.ts";
import {
  mockPlayer,
  mockU,
  MockObjectStore,
} from "./helpers/mockU.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function ctlSheet() {
  const s = defaultSheet();
  s.template = "changeling";
  s.attributes.wits = 3;
  s.powerStatValue = 2;
  s.energyCurrent = 5;
  return s;
}

Deno.test("kenning happy path — no target rolls Wits+Wyrd", OPTS, async () => {
  const store = new MockObjectStore();
  const player = mockPlayer({
    id: "k1",
    name: "Pix",
    state: { cofd: ctlSheet() },
  });
  store.put(player);
  const u = mockU({
    me: player,
    args: ["", ""],
    objectStore: store,
  });
  await kenningExec(u);
  assert(u._sent.length >= 1);
  const out = u._sent.join("\n");
  assertStringIncludes(out, "Kenning");
  assertStringIncludes(out, "Wits+Wyrd");
});

Deno.test("kenning with target — mortal harvest read", OPTS, async () => {
  const store = new MockObjectStore();
  const player = mockPlayer({
    id: "k2",
    name: "Pix",
    state: { cofd: ctlSheet() },
  });
  const mortal = mockPlayer({
    id: "k3",
    name: "Alice",
    state: {
      cofd: (() => {
        const s = defaultSheet();
        s.template = "mortal";
        return s;
      })(),
    },
  });
  store.put(player);
  store.put(mortal);
  const u = mockU({
    me: player,
    args: ["", "Alice"],
    targetResult: mortal,
    objectStore: store,
  });
  await kenningExec(u);
  const out = u._sent.join("\n");
  assertStringIncludes(out, "Kenning");
  assert(
    out.includes("harvest") ||
      out.includes("Mortal") ||
      out.includes("Nothing useful") ||
      out.includes("misjudge"),
  );
});

Deno.test("kenning no sheet", OPTS, async () => {
  const u = mockU({
    me: mockPlayer({ id: "k4", state: {} }),
    args: ["", ""],
  });
  await kenningExec(u);
  assert(u._sent.some((m) =>
    m.toLowerCase().includes("no approved") ||
    m.toLowerCase().includes("character sheet")
  ));
});

Deno.test("kenning non-changeling rejected", OPTS, async () => {
  const sheet = defaultSheet();
  sheet.template = "mortal";
  const u = mockU({
    me: mockPlayer({
      id: "k5",
      state: { cofd: sheet },
    }),
    args: ["", ""],
  });
  await kenningExec(u);
  assert(u._sent.some((m) =>
    m.toLowerCase().includes("changeling")
  ));
});

Deno.test("kenning target not found", OPTS, async () => {
  const store = new MockObjectStore();
  const player = mockPlayer({
    id: "k6",
    state: { cofd: ctlSheet() },
  });
  store.put(player);
  const u = mockU({
    me: player,
    args: ["", "Nobody"],
    targetResult: null,
    objectStore: store,
  });
  await kenningExec(u);
  assert(u._sent.some((m) =>
    m.toLowerCase().includes("not found")
  ));
});

Deno.test("kenning target changeling — fae recognition path", OPTS, async () => {
  const store = new MockObjectStore();
  const player = mockPlayer({
    id: "k7",
    name: "Pix",
    state: { cofd: ctlSheet() },
  });
  const other = mockPlayer({
    id: "k8",
    name: "Thorn",
    state: { cofd: ctlSheet() },
  });
  store.put(player);
  store.put(other);
  const u = mockU({
    me: player,
    args: ["", "Thorn"],
    targetResult: other,
    objectStore: store,
  });
  await kenningExec(u);
  const out = u._sent.join("\n");
  assertStringIncludes(out, "Kenning");
  // On success path mentions fae/Lost; failure still rolls.
  assertEquals(typeof out, "string");
  assert(out.length > 10);
});
