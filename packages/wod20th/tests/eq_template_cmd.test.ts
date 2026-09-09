// tests/eq_template_cmd.test.ts -- Integration coverage for @eq template
// commands: @eq/copy, @eq/new, @eq/give, @eq/template.
//
// Uses the engine's in-memory TypeGraph store (auto-selected inside Deno.test)
// so items created via u.db.create and the template DBO share one database --
// mirroring production, where dbojs() and DBO() both back onto TypeGraph.

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { cmds } from "@ursamu/ursamu";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import "../commands/eq.ts";
import {
  createEqTemplate,
  findEqTemplateByName,
} from "../db/eqTemplateDb.ts";
import { captureEqTemplate } from "../core/eq.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function thing(id: string, name: string, state: Record<string, unknown>): IDBObj {
  return { id, name, flags: new Set(["thing"]), location: "room-1", state, contents: [] };
}

function mockU(opts: { me: IDBObj; args: string[] }): IUrsamuSDK {
  const sent: string[] = [];
  return Object.assign({
    me: opts.me,
    here: { id: "room-1", name: "Room", flags: new Set(["room"]), state: {}, location: "", contents: [] },
    cmd: { name: "@eq", original: "", args: opts.args ?? [], switches: [] },
    send: (m: string) => sent.push(m),
    broadcast: () => {},
    canEdit: async () => true,
    db: {
      modify: async () => {},
      search: async () => [],
      create: async (t: Partial<IDBObj>) => {
        // Mirror the engine: name/state -> state, mint a fresh id.
        return thing("new-" + Math.random().toString(16).slice(2), t.name ?? "thing", { ...(t.state ?? {}) });
      },
      destroy: async () => {},
    },
    util: {
      target: async () => opts.me, // resolve LHS to the calling thing in tests
      displayName: (o: IDBObj) => o.name ?? "Unknown",
      stripSubs: (s: string) => s.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, ""),
      center: (s: string) => s,
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
    },
  } as unknown as IUrsamuSDK, { _sent: sent });
}

function getExec(): (u: IUrsamuSDK) => Promise<void> {
  const c = cmds.find((x) => x.name === "@eq");
  if (!c) throw new Error("@eq not registered");
  return c.exec as (u: IUrsamuSDK) => Promise<void>;
}

Deno.test("@eq/copy: captures an item into a named template", OPTS, async () => {
  const sword = thing("s1", "Silver Klaive", {
    kind: "weapon", weaponType: "melee", damage: 4, damageType: "L", silver: true,
  });
  const exec = getExec();
  const u = mockU({ me: sword, args: ["copy", "silver klaive", "silver-klaive"] });

  await exec(u);
  const tpl = await findEqTemplateByName("silver-klaive");
  assert(tpl, "template should have been created");
  assertEquals(tpl.payload.eq?.kind, "weapon");
  assertEquals(tpl.payload.eq?.damage, 4);
  assertEquals(tpl.payload.eq?.silver, true);
});

Deno.test("@eq/template: lists and looks up templates", OPTS, async () => {
  await createEqTemplate("foo-sword", captureEqTemplate(thing("s1", "Foo", {
    kind: "weapon", damage: 2, damageType: "L",
  })));

  // list (bare)
  const listExec = getExec();
  const uList = mockU({ me: thing("s1", "Foo", {}), args: ["template", ""] });
  await listExec(uList);
  // deno-lint-ignore no-explicit-any
  const listSent = ((uList as any)._sent as string[]).join("\n");
  assertStringIncludes(listSent, "foo-sword");

  // show <name>
  const showExec = getExec();
  const uShow = mockU({ me: thing("s1", "Foo", {}), args: ["template", "foo-sword"] });
  await showExec(uShow);
  // deno-lint-ignore no-explicit-any
  const showSent = ((uShow as any)._sent as string[]).join("\n");
  assertStringIncludes(showSent, "foo-sword");
  assertStringIncludes(showSent, "kind: weapon");
});

Deno.test("@eq/new: spawns a new item from a template", OPTS, async () => {
  await createEqTemplate("klaive", captureEqTemplate(thing("s1", "Klaive", {
    kind: "weapon", weaponType: "melee", damage: 4, damageType: "L", silver: true,
  })));

  const exec = getExec();
  const created: IDBObj[] = [];
  const u = mockU({ me: thing("me", "Cass", {}), args: ["new", "klaive", "another klaive"] });
  u.db.create = async (t: Partial<IDBObj>) => {
    const c = thing("new-item", t.name ?? "thing", { ...(t.state ?? {}) });
    created.push(c);
    return c;
  };

  await exec(u);
  assertEquals(created.length, 1, "@eq/new should call u.db.create once");
  assertEquals(created[0].name, "another klaive");
  // deno-lint-ignore no-explicit-any
  const sent = ((u as any)._sent as string[]).join("\n");
  assertStringIncludes(sent, "Applied template");
});

Deno.test("@eq/give: reapplies a template to an existing item", OPTS, async () => {
  await createEqTemplate("klaive", captureEqTemplate(thing("s1", "Klaive", {
    kind: "weapon", weaponType: "melee", damage: 4, damageType: "L", silver: true,
  })));

  const exec = getExec();
  const target = thing("loot", "loot sword", {});
  const applyTo: Array<Record<string, unknown>> = [];
  const u = mockU({ me: target, args: ["give", "loot sword", "klaive"] });
  u.util.target = async () => target;
  u.db.modify = async (_id: string, _op: string, data: Record<string, unknown>) => {
    applyTo.push(data);
  };

  await exec(u);
  assert(applyTo.length >= 1, "should modify the target");
  const set = applyTo[0] as Record<string, unknown>;
  assertEquals(set["state.kind"], "weapon");
  assertEquals(set["state.damage"], 4);
  assertEquals(set["state.silver"], true);
  // deno-lint-ignore no-explicit-any
  const sent = ((u as any)._sent as string[]).join("\n");
  assertStringIncludes(sent, "Applied template");
});