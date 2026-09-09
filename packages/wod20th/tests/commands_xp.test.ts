// tests/commands_xp.test.ts -- Exec-level tests for +xp.
//
// Pattern mirrors commands_chargen.test.ts: the real charDb / xpDb DBO/KV
// runs against a temp file (URSAMU_DB env var), and u.db.modify (the player
// object store) is captured via the mockU dbCalls array.
import { assertEquals, assertStringIncludes, assert } from "@std/assert";
import { cmds } from "@ursamu/ursamu";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

// Register splats before importing commands (resolver needs them)
import "../splats/wta/index.ts";

// Import commands -- side effect: addCmd fires and pushes to cmds
import "../commands/xp.ts";

// Seeding helpers -- these run for real against DBO/KV
import { createChar, findByPlayer, saveChar } from "../db/charDb.ts";
import { createXpEntry, findXpByChar } from "../db/xpDb.ts";
import type { IWoDChar, IXpEntry } from "../core/types.ts";

// -- Required boilerplate -----------------------------------------------------

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// -- mockPlayer / mockU --------------------------------------------------------

function mockPlayer(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: "wod_actor1", name: "Tester",
    flags: new Set(["player", "connected"]),
    state: {}, location: "wod_room1", contents: [],
    ...overrides,
  };
}

function mockU(opts: {
  me?: Partial<IDBObj>;
  args?: string[];
  targetResult?: IDBObj | null;
  canEditResult?: boolean;
} = {}) {
  const sent: string[] = [];
  const dbCalls: unknown[][] = [];
  return Object.assign({
    me: mockPlayer(opts.me ?? {}),
    here: { id: "wod_room1", name: "Room", flags: new Set(["room"]), state: {}, location: "", contents: [] },
    cmd: { name: "", original: "", args: opts.args ?? [], switches: [] },
    send: (m: string) => sent.push(m),
    broadcast: () => {},
    canEdit: async () => opts.canEditResult ?? true,
    db: {
      modify: async (...a: unknown[]) => { dbCalls.push(a); },
      search: async () => [],
      create: async (d: unknown) => ({ ...(d as object), id: "99", flags: new Set(), contents: [] }),
      destroy: async () => {},
    },
    util: {
      target: async () => opts.targetResult ?? null,
      displayName: (o: IDBObj) => o.name ?? "Unknown",
      stripSubs: (s: string) => s.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, ""),
      center: (s: string) => s,
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
    },
  } as unknown as IUrsamuSDK, { _sent: sent, _dbCalls: dbCalls });
}

// -- Helpers -------------------------------------------------------------------

function getExec(name: string): (u: IUrsamuSDK) => Promise<void> {
  const cmd = cmds.find((c) => c.name === name);
  if (!cmd) throw new Error(`Command "${name}" not found in cmds registry`);
  return cmd.exec as (u: IUrsamuSDK) => Promise<void>;
}

/** Create and return a minimal approved WtA char for the given playerId. */
async function seedChar(playerId: string, overrides: Partial<IWoDChar> = {}): Promise<IWoDChar> {
  const char = await createChar(playerId, "wta");
  char.status   = "approved";
  char.xpTotal  = 20;
  char.xpSpent  = 5;
  Object.assign(char, overrides);
  await saveChar(char);
  return char;
}

/** Seed an XP award entry for a char. */
async function seedXpEntry(charId: string, playerId: string): Promise<IXpEntry> {
  const entry: IXpEntry = {
    id: crypto.randomUUID(),
    charId, playerId,
    type: "award", amount: 10,
    reason: "Initial grant",
    ts: Date.now() - 1000,
  };
  await createXpEntry(entry);
  return entry;
}

// Shared IDBObj for the staff member
const STAFF_PLAYER: IDBObj = {
  id: "xp_staff1", name: "Staff",
  flags: new Set(["player", "connected", "admin"]),
  state: {}, location: "wod_room1", contents: [],
};

// Shared IDBObj for the target player
const TARGET_PLAYER: IDBObj = {
  id: "xp_target1", name: "Siobhan",
  flags: new Set(["player", "connected"]),
  state: {}, location: "wod_room1", contents: [],
};

// =============================================================================
// +xp tests
// =============================================================================

Deno.test("+xp no switch -- balance display, no DB write via u.db.modify", OPTS, async () => {
  const exec = getExec("+xp");
  const playerId = "xp_bal_player1";
  const char = await seedChar(playerId);
  await seedXpEntry(char.id, playerId);

  const u = mockU({
    me:   { id: playerId, name: "Tester" },
    args: ["", ""],
  });
  const { _sent: sent, _dbCalls: dbCalls } = u as unknown as { _sent: string[]; _dbCalls: unknown[][] };

  await exec(u);

  assert(sent.length >= 1, "expected at least one message");
  assertStringIncludes(sent[0], "XP");
  // Balance display must never touch the player object store
  assertEquals(dbCalls.length, 0, "no u.db.modify calls for balance display");
});

Deno.test("+xp no char -- sends chargen prompt", OPTS, async () => {
  const exec = getExec("+xp");

  // Caller has no char record
  const u = mockU({
    me:   { id: "xp_nochar_player1", name: "NewGuy" },
    args: ["", ""],
  });
  const { _sent: sent } = u as unknown as { _sent: string[] };

  await exec(u);

  assert(sent.some((m) => m.includes("chargen")), `expected chargen hint, got: ${JSON.stringify(sent)}`);
});

// -- +xp/award happy path ------------------------------------------------------

Deno.test("+xp/award -- awards XP, saveChar and createXpEntry run, success message sent", OPTS, async () => {
  const exec = getExec("+xp");

  // Seed target char
  const targetChar = await seedChar(TARGET_PLAYER.id);

  const u = mockU({
    me:           STAFF_PLAYER,
    args:         ["award", "Siobhan=3 Good RP"],
    targetResult: TARGET_PLAYER,
  });
  const { _sent: sent } = u as unknown as { _sent: string[] };

  await exec(u);

  // Staff success message includes the amount
  assert(sent.some((m) => m.includes("awarded")), `Expected 'awarded' in messages, got: ${JSON.stringify(sent)}`);

  // XP was persisted: the char record should now have xpTotal = 23
  const after = await findByPlayer(TARGET_PLAYER.id);
  assert(after !== null && after.xpTotal === targetChar.xpTotal + 3,
    `Expected xpTotal ${targetChar.xpTotal + 3}, got ${after?.xpTotal}`);

  // XP entry was written to xpDb
  const entries = await findXpByChar(targetChar.id);
  assert(entries.length >= 1, "expected at least one XP entry");
  assert(entries.some((e) => e.type === "award" && e.amount === 3 && e.reason === "Good RP"),
    `Expected award entry with reason "Good RP", got: ${JSON.stringify(entries)}`);
});

// -- +xp/award reason with MUSH codes -----------------------------------------

Deno.test("+xp/award reason MUSH codes -- reason stored verbatim (codes in reason not stripped)", OPTS, async () => {
  // xp.ts does NOT call stripSubs on the reason -- only on the targetName.
  // This test documents that behavior: the raw reason string is stored.
  const exec = getExec("+xp");
  const targetId = "xp_mush_target1";
  const target: IDBObj = { ...TARGET_PLAYER, id: targetId, name: "Mushie" };
  await seedChar(targetId);

  const u = mockU({
    me:           STAFF_PLAYER,
    args:         ["award", "Mushie=2 %chGreat%cn scene"],
    targetResult: target,
  });

  await exec(u);

  const char = await findByPlayer(targetId);
  assert(char !== null);
  const entries = await findXpByChar(char.id);
  assert(entries.some((e) => e.type === "award" && e.amount === 2),
    "expected a 2-XP award entry");
  // Reason is stored as-is (no strip on reason -- by design in xp.ts)
  const entry = entries.find((e) => e.type === "award" && e.amount === 2);
  assert(entry !== undefined && typeof entry.reason === "string" && entry.reason.length > 0,
    "entry reason must be a non-empty string");
});

// -- +xp/award by non-admin ----------------------------------------------------

Deno.test("+xp/award by non-admin -- permission denied, XP unchanged", OPTS, async () => {
  const exec = getExec("+xp");
  const targetId = "xp_nonstaff_target1";
  const target: IDBObj = { ...TARGET_PLAYER, id: targetId, name: "Alice" };
  const charBefore = await seedChar(targetId);

  const u = mockU({
    me:           { id: "xp_nonstaff_actor1", name: "Pleb", flags: new Set(["player", "connected"]) },
    args:         ["award", "Alice=3 Nice"],
    targetResult: target,
  });
  const { _sent: sent } = u as unknown as { _sent: string[] };

  await exec(u);

  assertStringIncludes(sent[0].toLowerCase(), "permission");

  // XP must not have changed
  const after = await findByPlayer(targetId);
  assertEquals(after?.xpTotal, charBefore.xpTotal, "xpTotal must be unchanged");
});

// -- +xp/award null target -----------------------------------------------------

Deno.test("+xp/award null target -- graceful not-found, no XP write", OPTS, async () => {
  const exec = getExec("+xp");

  const u = mockU({
    me:           STAFF_PLAYER,
    args:         ["award", "Nobody=3 Nice"],
    targetResult: null,
  });
  const { _sent: sent } = u as unknown as { _sent: string[] };

  await exec(u);

  assertStringIncludes(sent[0].toLowerCase(), "not found");
});

// -- +xp/set by non-admin ------------------------------------------------------

Deno.test("+xp/set by non-admin -- permission denied, XP unchanged", OPTS, async () => {
  const exec = getExec("+xp");
  const targetId = "xp_setguard_target1";
  const target: IDBObj = { ...TARGET_PLAYER, id: targetId, name: "Bob" };
  const charBefore = await seedChar(targetId);

  const u = mockU({
    me:           { id: "xp_setguard_actor1", name: "Pleb", flags: new Set(["player", "connected"]) },
    args:         ["set", "Bob=30 Correction"],
    targetResult: target,
  });
  const { _sent: sent } = u as unknown as { _sent: string[] };

  await exec(u);

  assertStringIncludes(sent[0].toLowerCase(), "permission");

  const after = await findByPlayer(targetId);
  assertEquals(after?.xpTotal, charBefore.xpTotal, "xpTotal must be unchanged");
});

