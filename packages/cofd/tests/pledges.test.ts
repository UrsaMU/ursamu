// Tests for Changeling pledges (seals, oaths, bargains).

import { assertEquals, assert } from "@std/assert";
import { defaultSheet } from "../src/stats/index.ts";
import { pledgeCommand } from "../src/commands/pledge.ts";
import { listPledges, pledgeDb } from "../src/pledges/index.ts";
import { mockU, mockPlayer, MockObjectStore } from "./helpers/mockU.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

async function clearDb() {
  const all = await pledgeDb.find({});
  for (const p of all) {
    await pledgeDb.delete({ id: p.id });
  }
}

function changelingSheet(over: Partial<ReturnType<typeof defaultSheet>> = {}) {
  const sheet = defaultSheet();
  sheet.template = "changeling";
  sheet.energyCurrent = 10;
  sheet.powerStatValue = 2;
  sheet.advantages.willpowerCurrent = 5;
  return { ...sheet, ...over };
}

Deno.test("Seal words - mortal target auto-accepts", OPTS, async () => {
  await clearDb();
  const store = new MockObjectStore();
  const alice = mockPlayer({ id: "1", name: "Alice", state: { cofd: changelingSheet() } });
  const bob = mockPlayer({ id: "2", name: "Bob", state: { cofd: defaultSheet() } });
  store.put(alice);
  store.put(bob);

  const u = mockU({
    me: alice,
    args: ["seal", "Bob=scene/Keep quiet/1 bashing"],
    targetResult: bob,
    objectStore: store,
  });

  await pledgeCommand(u);

  // Check Glamour deducted
  const alSheet = alice.state.cofd as ReturnType<typeof defaultSheet>;
  assertEquals(alSheet.energyCurrent, 9);

  // Check pledge is active
  const plgs = await listPledges();
  assertEquals(plgs.length, 1);
  assertEquals(plgs[0].status, "active");
  assertEquals(plgs[0].statement, "Keep quiet");
  assertEquals(plgs[0].sanction, "1 bashing");
});

Deno.test("Seal words - fae target proposed as pending", OPTS, async () => {
  await clearDb();
  const store = new MockObjectStore();
  const alice = mockPlayer({ id: "1", name: "Alice", state: { cofd: changelingSheet() } });
  const charlie = mockPlayer({ id: "3", name: "Charlie", state: { cofd: changelingSheet() } });
  store.put(alice);
  store.put(charlie);

  const u = mockU({
    me: alice,
    args: ["seal", "Charlie=Keep quiet/1 bashing"],
    targetResult: charlie,
    objectStore: store,
  });

  await pledgeCommand(u);

  const plgs = await listPledges();
  assertEquals(plgs.length, 1);
  assertEquals(plgs[0].status, "pending");

  // Charlie accepts
  const u2 = mockU({
    me: charlie,
    args: ["accept", plgs[0].id],
    objectStore: store,
  });
  await pledgeCommand(u2);

  const plgs2 = await listPledges();
  assertEquals(plgs2[0].status, "active");
});

Deno.test("Strengthened seal - spends Willpower", OPTS, async () => {
  await clearDb();
  const store = new MockObjectStore();
  const alice = mockPlayer({ id: "1", name: "Alice", state: { cofd: changelingSheet() } });
  const bob = mockPlayer({ id: "2", name: "Bob", state: { cofd: defaultSheet() } });
  store.put(alice);
  store.put(bob);

  const u = mockU({
    me: alice,
    args: ["seal/strengthen", "Bob=Keep quiet/1 lethal"],
    targetResult: bob,
    objectStore: store,
  });

  await pledgeCommand(u);

  const alSheet = alice.state.cofd as ReturnType<typeof defaultSheet>;
  assertEquals(alSheet.energyCurrent, 9);
  assertEquals(alSheet.advantages.willpowerCurrent, 4);

  const plgs = await listPledges();
  assertEquals(plgs[0].strengthened, true);
});

Deno.test("Oath creation and break - applies Oathbreaker condition", OPTS, async () => {
  await clearDb();
  const store = new MockObjectStore();
  const alice = mockPlayer({ id: "1", name: "Alice", state: { cofd: changelingSheet() } });
  const charlie = mockPlayer({ id: "3", name: "Charlie", state: { cofd: changelingSheet() } });
  store.put(alice);
  store.put(charlie);

  const u = mockU({
    me: alice,
    args: ["oath", "personal/Charlie=protect you/swap-pools/oathbreaker"],
    targetResult: charlie,
    objectStore: store,
  });

  await pledgeCommand(u);

  const plgs = await listPledges();
  assertEquals(plgs[0].status, "pending");

  const u2 = mockU({
    me: charlie,
    args: ["accept", plgs[0].id],
    objectStore: store,
  });
  await pledgeCommand(u2);

  const plgs2 = await listPledges();
  assertEquals(plgs2[0].status, "active");

  // Alice breaks it
  const u3 = mockU({
    me: alice,
    args: ["break", plgs2[0].id],
    objectStore: store,
  });
  await pledgeCommand(u3);

  const alSheet = alice.state.cofd as ReturnType<typeof defaultSheet>;
  assert(alSheet.conditions?.some((c) => c.key === "oathbreaker"));
});

Deno.test("Bargain creation - requires mien form", OPTS, async () => {
  await clearDb();
  const store = new MockObjectStore();
  const alice = mockPlayer({ id: "1", name: "Alice", state: { cofd: changelingSheet() } });
  const bob = mockPlayer({ id: "2", name: "Bob", state: { cofd: defaultSheet() } });
  store.put(alice);
  store.put(bob);

  // Fails initially because mask is up
  const u = mockU({
    me: alice,
    args: ["bargain", "Bob=sewing a dress/gold coins"],
    targetResult: bob,
    objectStore: store,
  });
  await pledgeCommand(u);
  assert(u._sent.join("\n").includes("Mask"));

  // Drop mask
  alice.state.cofd = changelingSheet({
    formState: { system: "mask", current: "mien" },
  });

  const u2 = mockU({
    me: alice,
    args: ["bargain", "Bob=sewing a dress/gold coins"],
    targetResult: bob,
    objectStore: store,
  });
  await pledgeCommand(u2);

  const plgs = await listPledges();
  assertEquals(plgs[0].status, "pending");

  // Accept bargain
  const u3 = mockU({
    me: bob,
    args: ["accept", plgs[0].id],
    targetResult: alice,
    objectStore: store,
  });
  await pledgeCommand(u3);

  const alSheet = alice.state.cofd as ReturnType<typeof defaultSheet>;
  assert(alSheet.conditions?.some((c) => c.key === "obliged"));
});

Deno.test("Seal - non-changeling rejected", OPTS, async () => {
  await clearDb();
  const store = new MockObjectStore();
  const mortal = mockPlayer({
    id: "1",
    name: "Mortal",
    state: { cofd: defaultSheet() },
  });
  const bob = mockPlayer({
    id: "2",
    name: "Bob",
    state: { cofd: defaultSheet() },
  });
  store.put(mortal);
  store.put(bob);

  const u = mockU({
    me: mortal,
    args: ["seal", "Bob=Keep quiet/1 bashing"],
    targetResult: bob,
    objectStore: store,
  });
  await pledgeCommand(u);

  assert(u._sent.some((m) => m.includes("Wyrd") || m.includes("changeling")));
  const plgs = await listPledges();
  assertEquals(plgs.length, 0);
});

Deno.test("Oath accept - societal court oath writes mantle:<court>", OPTS, async () => {
  await clearDb();
  const store = new MockObjectStore();
  const alice = mockPlayer({
    id: "1",
    name: "Alice",
    state: { cofd: changelingSheet() },
  });
  const charlie = mockPlayer({
    id: "3",
    name: "Charlie",
    state: { cofd: changelingSheet() },
  });
  store.put(alice);
  store.put(charlie);

  const u = mockU({
    me: alice,
    args: ["oath", "societal/Charlie=join Spring court/first dance/oathbreaker"],
    targetResult: charlie,
    objectStore: store,
  });
  await pledgeCommand(u);

  const plgs = await listPledges();
  assertEquals(plgs.length, 1);

  const u2 = mockU({
    me: charlie,
    args: ["accept", plgs[0].id],
    objectStore: store,
  });
  await pledgeCommand(u2);

  const charSheet = charlie.state.cofd as ReturnType<typeof defaultSheet>;
  // Mantle key must be `mantle:<court>` to match contract prereq checks
  assertEquals(charSheet.merits["mantle:spring"], 1);
});
