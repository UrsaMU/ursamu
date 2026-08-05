import { assertEquals, assert } from "@std/assert";
import { defaultSheet } from "../src/stats/index.ts";
import { contractExec } from "../src/commands/contract.ts";
import { mockU, mockPlayer, MockObjectStore } from "./helpers/mockU.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function changelingSheet(overrides: any = {}) {
  const sheet = defaultSheet();
  sheet.template = "changeling";
  sheet.experience = 10;
  sheet.customFields = {
    seeming: "Wizened",
    favored: "Crown", // Wizened favored: Jewels + chose Crown
    court: "Spring",
    ...overrides.customFields,
  };
  sheet.merits = {
    "mantle:spring": 1,
    ...overrides.merits,
  };
  sheet.contracts = overrides.contracts ?? [];
  return sheet;
}

Deno.test("Court Contracts - learn own court common with Mantle 1", OPTS, async () => {
  const store = new MockObjectStore();
  const player = mockPlayer({
    id: "2",
    name: "Player",
    state: { cofd: changelingSheet({}) },
  });
  store.put(player);

  const u = mockU({
    me: player,
    args: ["learn", "Cupid's Arrow"], // Spring Common
    objectStore: store,
  });

  await contractExec(u);

  const updated = store.get("2")!;
  const sheet = updated.state.cofd as ReturnType<typeof changelingSheet>;
  assert(sheet.contracts.includes("Cupid's Arrow"));
  assertEquals(sheet.experience, 7); // 10 - 3
});

Deno.test("Court Contracts - learn external court common exception", OPTS, async () => {
  const store = new MockObjectStore();
  const player = mockPlayer({
    id: "2",
    name: "Player",
    state: { cofd: changelingSheet({}) },
  });
  store.put(player);

  const u = mockU({
    me: player,
    args: ["learn", "Witches' Intuition"], // Autumn Common
    objectStore: store,
  });

  await contractExec(u);

  const updated = store.get("2")!;
  const sheet = updated.state.cofd as ReturnType<typeof changelingSheet>;
  assert(sheet.contracts.includes("Witches' Intuition"));
  assertEquals(sheet.experience, 7);
});

Deno.test("Court Contracts - fail second external court common without requirements", OPTS, async () => {
  const store = new MockObjectStore();
  const initialSheet = changelingSheet({
    contracts: ["Witches' Intuition"],
  });
  const player = mockPlayer({
    id: "2",
    name: "Player",
    state: { cofd: initialSheet },
  });
  store.put(player);

  const u = mockU({
    me: player,
    args: ["learn", "Baleful Sense"], // Summer Common
    objectStore: store,
  });

  await contractExec(u);

  const updated = store.get("2")!;
  const sheet = (updated.state?.cofd ?? initialSheet) as ReturnType<typeof changelingSheet>;
  const contracts = sheet.contracts ?? [];
  assert(!contracts.includes("Baleful Sense"));
  assertEquals(sheet.experience, 10); // Not deducted
  assert(u._sent.some((m) => m.includes("Prerequisite error")));
});

Deno.test("Court Contracts - learn external court royal requires Goodwill 4", OPTS, async () => {
  const store = new MockObjectStore();
  const player = mockPlayer({
    id: "2",
    name: "Player",
    state: {
      cofd: changelingSheet({
        merits: {
          "court goodwill:autumn": 4,
        },
      }),
    },
  });
  store.put(player);

  const u = mockU({
    me: player,
    args: ["learn", "Sorcerer's Rebuke"], // Autumn Royal
    objectStore: store,
  });

  await contractExec(u);

  const updated = store.get("2")!;
  const sheet = (updated.state?.cofd ?? {}) as ReturnType<typeof changelingSheet>;
  const contracts = sheet.contracts ?? [];
  assert(contracts.includes("Sorcerer's Rebuke"));
  assertEquals(sheet.experience, 6); // 10 - 4
});

Deno.test("Court Contracts - learn Royal Arcadian requires favored Regalia", OPTS, async () => {
  const store = new MockObjectStore();
  const player = mockPlayer({
    id: "2",
    name: "Player",
    state: { cofd: changelingSheet({}) },
  });
  store.put(player);

  // Chrysalis is Royal Steed (unfavored: Jewels and Crown are favored)
  const u = mockU({
    me: player,
    args: ["learn", "Chrysalis"],
    objectStore: store,
  });

  await contractExec(u);

  const updated = store.get("2")!;
  const sheet = (updated.state?.cofd ?? {}) as ReturnType<typeof changelingSheet>;
  const contracts = sheet.contracts ?? [];
  assert(!contracts.includes("Chrysalis"));
  assert(u._sent.some((m) => m.includes("Prerequisite error")));
});

Deno.test("Court Contracts - staff can grant contract directly", OPTS, async () => {
  const store = new MockObjectStore();
  const staff = mockPlayer({
    id: "1",
    name: "Staff",
    flags: new Set(["player", "connected", "admin"]),
  });
  const player = mockPlayer({
    id: "2",
    name: "Player",
    state: { cofd: changelingSheet({}) },
  });
  store.put(staff);
  store.put(player);

  // Grant Chrysalis (Royal Steed) directly, bypassing prerequisites and XP
  const u = mockU({
    me: staff,
    args: ["grant", "Player=Chrysalis"],
    targetResult: player,
    objectStore: store,
  });

  await contractExec(u);

  const updated = store.get("2")!;
  const sheet = updated.state.cofd as ReturnType<typeof changelingSheet>;
  assert(sheet.contracts.includes("Chrysalis"));
  assertEquals(sheet.experience, 10); // Free
});

Deno.test(
  "Goblin Contract learn incurs 1 Goblin Debt",
  OPTS,
  async () => {
    const store = new MockObjectStore();
    const player = mockPlayer({
      id: "2",
      name: "Player",
      state: { cofd: changelingSheet({}) },
    });
    store.put(player);

    const u = mockU({
      me: player,
      args: ["learn", "Glib Tongue"],
      objectStore: store,
    });

    await contractExec(u);

    const updated = store.get("2")!;
    const sheet = updated.state.cofd as ReturnType<
      typeof changelingSheet
    > & {
      hedgeState?: { debts?: { amount: number; note: string }[] };
    };
    assert(sheet.contracts.includes("Glib Tongue"));
    const debts = sheet.hedgeState?.debts ?? [];
    assertEquals(debts.length, 1);
    assertEquals(debts[0].amount, 1);
    assert(
      u._sent.some((m) =>
        m.includes("Goblin Debt incurred")
      ),
    );
  },
);

Deno.test(
  "Non-goblin Contract learn does not add debt",
  OPTS,
  async () => {
    const store = new MockObjectStore();
    const player = mockPlayer({
      id: "2",
      name: "Player",
      state: { cofd: changelingSheet({}) },
    });
    store.put(player);

    const u = mockU({
      me: player,
      args: ["learn", "Cupid's Arrow"],
      objectStore: store,
    });

    await contractExec(u);

    const updated = store.get("2")!;
    const sheet = updated.state.cofd as ReturnType<
      typeof changelingSheet
    > & {
      hedgeState?: { debts?: unknown[] };
    };
    assert(sheet.contracts.includes("Cupid's Arrow"));
    assertEquals(sheet.hedgeState?.debts?.length ?? 0, 0);
    assert(
      !u._sent.some((m) =>
        m.includes("Goblin Debt incurred")
      ),
    );
  },
);
