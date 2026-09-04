/**
 * Parent-chain attribute resolution for softcode and world layer.
 */
import { assertEquals } from "@std/assert";
import { dbojs } from "../src/world/dbobjs.ts";
import {
  getAttribute,
  getAttributeValue,
} from "../src/world/get-attribute.ts";
import type { IDBOBJ } from "../src/world/types.ts";
import { runSoftcodeSimple } from "../src/softcode/engine.ts";
import "../src/softcode/stdlib/index.ts";
import { findDollarPattern } from "../src/world/dollar-patterns.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const PARENT = "par_attr_parent";
const CHILD = "par_attr_child";
const GRAND = "par_attr_grand";
const ACTOR = "par_attr_actor";

async function wipe(...ids: string[]): Promise<void> {
  for (const id of ids) {
    const prior = await dbojs.queryOne({ id });
    if (prior) await dbojs.delete({ id });
  }
}

async function seedChain(): Promise<void> {
  await wipe(PARENT, CHILD, GRAND, ACTOR);
  await dbojs.create({
    id: GRAND,
    flags: "thing",
    data: {
      name: "Grand",
      attributes: [
        { name: "FOO", value: "from-grand", setter: "" },
        { name: "BAR", value: "grand-bar", setter: "" },
      ],
    },
  });
  await dbojs.create({
    id: PARENT,
    flags: "thing",
    data: {
      name: "Parent",
      parent: GRAND,
      attributes: [
        { name: "FOO", value: "from-parent", setter: "" },
        { name: "$greet *", value: "@pemit %#=hi %0", setter: "" },
      ],
    },
  });
  await dbojs.create({
    id: CHILD,
    flags: "thing",
    data: {
      name: "Child",
      parent: PARENT,
      attributes: [
        { name: "LOCAL", value: "only-child", setter: "" },
      ],
    },
  });
  await dbojs.create({
    id: ACTOR,
    flags: "player connected",
    location: "0",
    data: { name: "Actor" },
  });
}

Deno.test("getAttribute: local wins over parent", OPTS, async () => {
  await seedChain();
  const child = await dbojs.queryOne({ id: CHILD }) as IDBOBJ;
  const a = await getAttribute(child, "LOCAL");
  assertEquals(a?.value, "only-child");
  const foo = await getAttribute(child, "FOO");
  assertEquals(foo?.value, "from-parent");
  await wipe(PARENT, CHILD, GRAND, ACTOR);
});

Deno.test("getAttribute: walks grandparent", OPTS, async () => {
  await seedChain();
  const child = await dbojs.queryOne({ id: CHILD }) as IDBOBJ;
  const bar = await getAttribute(child, "BAR");
  assertEquals(bar?.value, "grand-bar");
  await wipe(PARENT, CHILD, GRAND, ACTOR);
});

Deno.test("getAttribute: cycle does not hang", OPTS, async () => {
  await wipe("cyc_a", "cyc_b");
  await dbojs.create({
    id: "cyc_a",
    flags: "thing",
    data: {
      name: "A",
      parent: "cyc_b",
      attributes: [],
    },
  });
  await dbojs.create({
    id: "cyc_b",
    flags: "thing",
    data: {
      name: "B",
      parent: "cyc_a",
      attributes: [
        { name: "X", value: "loop", setter: "" },
      ],
    },
  });
  const a = await dbojs.queryOne({ id: "cyc_a" }) as IDBOBJ;
  const x = await getAttribute(a, "X");
  assertEquals(x?.value, "loop");
  await wipe("cyc_a", "cyc_b");
});

Deno.test(
  "getAttribute: no_inherit blocks parent walk",
  OPTS,
  async () => {
    await wipe("ni_p", "ni_c");
    await dbojs.create({
      id: "ni_p",
      flags: "thing",
      data: {
        name: "P",
        attributes: [
          { name: "SECRET", value: "nope", setter: "" },
        ],
      },
    });
    await dbojs.create({
      id: "ni_c",
      flags: "thing no_inherit",
      data: {
        name: "C",
        parent: "ni_p",
        attributes: [],
      },
    });
    const c = await dbojs.queryOne({ id: "ni_c" }) as IDBOBJ;
    assertEquals(await getAttribute(c, "SECRET"), undefined);
    assertEquals(await getAttributeValue(c, "SECRET"), null);
    await wipe("ni_p", "ni_c");
  },
);

Deno.test(
  "softcode get/hasattr/u walk parent chain",
  OPTS,
  async () => {
    await seedChain();
    // Name refs (slug ids are not #N dbrefs in softcode resolve)
    const get = await runSoftcodeSimple(
      "[get(Child/FOO)]",
      { actorId: ACTOR, executorId: CHILD },
    );
    assertEquals(get, "from-parent");

    const bar = await runSoftcodeSimple(
      "[xget(Child,BAR)]",
      { actorId: ACTOR, executorId: CHILD },
    );
    assertEquals(bar, "grand-bar");

    const has = await runSoftcodeSimple(
      "[hasattr(Child,FOO)]",
      { actorId: ACTOR, executorId: CHILD },
    );
    assertEquals(has, "1");

    const u = await runSoftcodeSimple(
      "[u(me/FOO)]",
      { actorId: ACTOR, executorId: CHILD },
    );
    assertEquals(u, "from-parent");

    const miss = await runSoftcodeSimple(
      "[get(Child/NOPE)]",
      { actorId: ACTOR, executorId: CHILD },
    );
    assertEquals(miss, "");

    await wipe(PARENT, CHILD, GRAND, ACTOR);
  },
);

Deno.test(
  "dollar $pattern matches parent attr",
  OPTS,
  async () => {
    await seedChain();
    const actor = await dbojs.queryOne({ id: ACTOR }) as IDBOBJ;
    // Put child in inventory so findDollarPattern scans it
    await dbojs.modify(
      { id: CHILD },
      "$set",
      { location: ACTOR } as Partial<IDBOBJ>,
    );
    const hit = await findDollarPattern(
      actor,
      "greet bob",
      "",
      dbojs,
    );
    assertEquals(hit?.attr.name, "$greet *");
    assertEquals(hit?.captures[0], "bob");
    assertEquals(hit?.obj.id, CHILD);
    await wipe(PARENT, CHILD, GRAND, ACTOR);
  },
);
