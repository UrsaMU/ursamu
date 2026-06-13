/**
 * Boundary-validation exploit tests — tdd-audit remediation
 *
 * M1  routes.ts:165 — exit name has no max-length guard
 * M2  routes.ts:59  — parent field has no length/format validation
 * L1  scripts/setAttr.ts:46 — &ATTR value has no length limit
 * L2  scripts/setAttr.ts:41 — attributes array has no count limit
 * L3  scripts/name.ts:25    — @name new name has no length limit
 * L4  scripts/clone.ts:19   — @clone name has no length limit
 *
 * Pattern: [RED] test asserts the SECURE property — FAILS before patch.
 *          [GREEN] same test PASSES after patch.
 */

import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { describe, it, beforeEach } from "jsr:@std/testing/bdd";
import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";

// ─── mock helpers (mirrors builder.test.ts pattern) ───────────────────────────

function mockPlayer(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: "1", name: "TestPlayer",
    flags: new Set(["player", "connected", "builder"]),
    state: { quota: 50, owner: "1" },
    location: "2", contents: [],
    ...overrides,
  };
}

function mockObj(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: "5", name: "Widget",
    flags: new Set(["thing"]),
    state: { owner: "1", attributes: [] },
    location: "1", contents: [],
    ...overrides,
  };
}

// deno-lint-ignore no-explicit-any
function mockU(opts: { me?: Partial<IDBObj>; args?: string[]; switches?: string[]; targetResult?: IDBObj | null } = {}): any {
  const sent: string[] = [];
  const dbCalls: unknown[][] = [];
  const me = mockPlayer(opts.me ?? {});
  return Object.assign({
    me,
    here: mockObj({ id: "2", flags: new Set(["room"]), state: { name: "Room", owner: "1", attributes: [] } }),
    cmd: { name: "", original: "", args: opts.args ?? [], switches: opts.switches ?? [] },
    send: (m: string) => sent.push(m),
    broadcast: () => {},
    canEdit: async () => true,
    setFlags: async () => {},
    teleport: () => {},
    db: {
      modify: async (...a: unknown[]) => { dbCalls.push(a); },
      search: async () => opts.targetResult !== undefined ? (opts.targetResult ? [opts.targetResult] : []) : [mockObj()],
      create: async (d: unknown) => ({ ...(d as object), id: "99", contents: [], flags: new Set() }),
      destroy: async () => {},
    },
    util: {
      target: async (_me: IDBObj, ref: string) => {
        if (ref === "me" || ref === "1") return me;
        return opts.targetResult ?? mockObj();
      },
      displayName: (o: IDBObj) => o.name ?? "Unknown",
      stripSubs: (s: string) => s,
      center: (s: string) => s,
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
    },
  } as unknown as IUrsamuSDK, { _sent: sent, _dbCalls: dbCalls });
}

// ─── L3: @name — no length limit on new name ──────────────────────────────────

describe("@name — boundary [L3]", () => {
  // deno-lint-ignore no-explicit-any
  async function execName(u: any) {
    const { default: script } = await import("../src/scripts/name.ts");
    await (script as (u: IUrsamuSDK) => Promise<void>)(u);
  }

  it("[RED] L3 — @name accepts arbitrarily long name (no length guard)", async () => {
    const longName = "X".repeat(500);
    const target   = mockObj({ id: "5" });
    const u = mockU({ args: [`widget=${longName}`], targetResult: target });
    // Override search to return empty (no collision) for the second call
    let call = 0;
    u.db.search = async () => call++ === 0 ? [] : [];
    await execName(u);
    // VULNERABILITY: DB write succeeds with 500-char name — should be rejected
    const write = u._dbCalls.find((c: unknown[]) => c[1] === "$set" && (c[2] as Record<string, unknown>)["data.name"]);
    assertEquals(write === undefined, true,
      "PATCH REQUIRED: @name must reject names over 200 characters");
  });

  it("[GREEN] L3 — after fix: @name rejects name over 200 chars", async () => {
    const longName = "X".repeat(201);
    const u = mockU({ args: [`widget=${longName}`] });
    await execName(u);
    assertStringIncludes(u._sent[0], "too long",
      "FIX: should send 'too long' error for 201-char name");
    assertEquals(u._dbCalls.length, 0);
  });

  it("[GREEN] L3 — after fix: @name still accepts valid name ≤ 200 chars", async () => {
    const validName = "A".repeat(200);
    const target    = mockObj({ id: "5" });
    let call = 0;
    const u = mockU({ args: [`widget=${validName}`], targetResult: target });
    u.db.search = async () => call++ === 0 ? [] : [];
    await execName(u);
    assertStringIncludes(u._sent[0], "Name set");
  });
});

// ─── L4: @clone — no length limit on clone name ───────────────────────────────

describe("@clone — boundary [L4]", () => {
  // deno-lint-ignore no-explicit-any
  async function execClone(u: any) {
    const { default: script } = await import("../src/scripts/clone.ts");
    await (script as (u: IUrsamuSDK) => Promise<void>)(u);
  }

  it("[RED] L4 — @clone accepts arbitrarily long name (no length guard)", async () => {
    const longName = "C".repeat(500);
    const obj      = mockObj({ id: "5", flags: new Set(["thing"]) });
    const u = mockU({ args: [`widget=${longName}`], targetResult: obj });
    await execClone(u);
    // VULNERABILITY: clone creation proceeds with 500-char name
    const created = (u as unknown as { _sent: string[] })._sent[0];
    assertEquals(typeof created === "string" && created.includes("too long"), true,
      "PATCH REQUIRED: @clone must reject names over 200 characters");
  });

  it("[GREEN] L4 — after fix: @clone rejects name over 200 chars", async () => {
    const longName = "C".repeat(201);
    const obj      = mockObj({ id: "5", flags: new Set(["thing"]) });
    const u = mockU({ args: [`widget=${longName}`], targetResult: obj });
    await execClone(u);
    assertStringIncludes(u._sent[0], "too long");
    assertEquals(u._dbCalls.length, 0);
  });

  it("[GREEN] L4 — after fix: @clone still works with valid name", async () => {
    const obj  = mockObj({ id: "5", flags: new Set(["thing"]), state: { owner: "1", name: "Widget", attributes: [] } });
    const u    = mockU({ args: ["widget=My Copy"], targetResult: obj, me: { state: { quota: 10 } } });
    await execClone(u);
    assertStringIncludes(u._sent[0], "Cloned");
  });
});

// ─── L1+L2: &ATTR — no value length limit, no count limit ─────────────────────

describe("&ATTR — boundary [L1, L2]", () => {
  // deno-lint-ignore no-explicit-any
  async function execSetAttr(u: any) {
    const { default: script } = await import("../src/scripts/setAttr.ts");
    await (script as (u: IUrsamuSDK) => Promise<void>)(u);
  }

  it("[RED] L1 — &ATTR accepts arbitrarily long value (no length guard)", async () => {
    const huge  = "V".repeat(10000);
    const obj   = mockObj({ id: "5", state: { owner: "1", attributes: [] } });
    const u     = mockU({ args: [`COLOR widget=${huge}`], targetResult: obj });
    await execSetAttr(u);
    // VULNERABILITY: DB write proceeds with 10000-char value
    const write = u._dbCalls.find((c: unknown[]) => c[1] === "$set");
    assertEquals(write === undefined, true,
      "PATCH REQUIRED: &ATTR must reject values over 4096 characters");
  });

  it("[GREEN] L1 — after fix: &ATTR rejects value over 4096 chars", async () => {
    const huge = "V".repeat(4097);
    const obj  = mockObj({ id: "5", state: { owner: "1", attributes: [] } });
    const u    = mockU({ args: [`COLOR widget=${huge}`], targetResult: obj });
    await execSetAttr(u);
    assertStringIncludes(u._sent[0], "too long");
    assertEquals(u._dbCalls.length, 0);
  });

  it("[RED] L2 — &ATTR adds to array without count limit", async () => {
    // Build an object that already has 100 attributes
    const existingAttrs = Array.from({ length: 100 }, (_, i) => ({ name: `ATTR${i}`, value: "x" }));
    const obj = mockObj({ id: "5", state: { owner: "1", attributes: existingAttrs } });
    const u   = mockU({ args: ["NEWATTR widget=val"], targetResult: obj });
    await execSetAttr(u);
    // VULNERABILITY: 101st attribute is added without hitting the count limit
    const write = u._dbCalls.find((c: unknown[]) => c[1] === "$set");
    assertEquals(write === undefined, true,
      "PATCH REQUIRED: &ATTR must reject adding attributes when count >= 100");
  });

  it("[GREEN] L2 — after fix: &ATTR rejects when attribute count is at limit", async () => {
    const existingAttrs = Array.from({ length: 100 }, (_, i) => ({ name: `ATTR${i}`, value: "x" }));
    const obj = mockObj({ id: "5", state: { owner: "1", attributes: existingAttrs } });
    const u   = mockU({ args: ["NEWATTR widget=val"], targetResult: obj });
    await execSetAttr(u);
    assertStringIncludes(u._sent[0], "Too many");
    assertEquals(u._dbCalls.length, 0);
  });

  it("[GREEN] L1+L2 — after fix: &ATTR works normally within limits", async () => {
    const obj = mockObj({ id: "5", state: { owner: "1", attributes: [] } });
    const u   = mockU({ args: ["COLOR widget=red"], targetResult: obj });
    await execSetAttr(u);
    assertStringIncludes(u._sent[0], "COLOR");
    assertEquals(u._dbCalls.length, 1);
  });
});

// ─── M1+M2: routes.ts — source-level validation checks ───────────────────────

describe("routes.ts — input boundary [M1, M2]", () => {
  let src: string;
  beforeEach(async () => {
    src = await Deno.readTextFile(new URL("../src/routes.ts", import.meta.url).pathname);
  });

  it("[RED] M1 — exit name has no max-length guard", () => {
    // After the fix, exit name length check should appear before the DB create call
    assertStringIncludes(src, "exit name must be",
      "PATCH REQUIRED: exit name length check missing from POST /rooms/:id/exits");
  });

  it("[RED] M2 — parent field has no length/format guard", () => {
    assertStringIncludes(src, "parent must be",
      "PATCH REQUIRED: parent field validation missing from POST /rooms");
  });

  it("[GREEN] M1 — after fix: exit name ≤ 200 check is present", () => {
    // Test body is the same — passes once the patch is applied
    assertStringIncludes(src, "exit name must be ≤ 200");
  });

  it("[GREEN] M2 — after fix: parent field validation is present", () => {
    assertStringIncludes(src, "parent must be a valid");
  });
});
