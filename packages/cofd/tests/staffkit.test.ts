/**
 * +staffkit changeling — minimal staff splat setup.
 */
import { assertEquals, assert } from "jsr:@std/assert@^0.224.0";
import { buildChangelingKit, resolveStaffKit } from "../src/staffkit/index.ts";
import { isChangelingSheet } from "../src/form/mask.ts";
import { hasFaeSight } from "../src/support/sight.ts";
import { staffkitExec } from "../src/commands/staffkit.ts";
import { mockU, mockPlayer } from "./helpers/mockU.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("buildChangelingKit: template and locks", OPTS, () => {
  const kit = buildChangelingKit();
  assertEquals(kit.splat, "changeling");
  assert(isChangelingSheet(kit.sheet));
  assertEquals(kit.sheet.powerStatValue, 1);
  assert(kit.sheet.energyCurrent >= 5);
  assert(kit.flags.includes("fae"));
  assert(kit.flags.includes("approved"));
  assertEquals(kit.sheet.customFields.seeming, "Darkling");
});

Deno.test("resolveStaffKit aliases", OPTS, () => {
  assertEquals(resolveStaffKit("lost")?.splat, "changeling");
  assertEquals(resolveStaffKit("ctl")?.splat, "changeling");
  assertEquals(resolveStaffKit("nope"), null);
});

Deno.test("staffkitExec: applies sheet and flags to self", OPTS, async () => {
  const u = mockU({
    me: {
      id: "staff1",
      name: "Builder",
      flags: new Set([
        "player",
        "connected",
        "builder",
        "superuser",
      ]),
    },
    args: ["", "changeling"],
  });
  // deno-lint-ignore no-explicit-any
  (u as any)._store.put(u.me);

  await staffkitExec(u);

  // deno-lint-ignore no-explicit-any
  const sent = (u as any)._sent as string[];
  assert(sent.some((s) => /Staff kit applied/i.test(s)));
  assert(u.me.flags.has("fae"));
  assert(u.me.flags.has("approved"));
  const sheet = u.me.state.cofd as { template?: string };
  assertEquals(sheet?.template, "changeling");
  assert(
    hasFaeSight({
      id: u.me.id,
      flags: u.me.flags,
      state: u.me.state,
      contents: [],
    }),
  );
});

Deno.test("staffkitExec: rejects non-staff", OPTS, async () => {
  const u = mockU({
    me: {
      id: "p1",
      name: "Mortal",
      flags: new Set(["player", "connected"]),
    },
    args: ["", "changeling"],
  });
  await staffkitExec(u);
  // deno-lint-ignore no-explicit-any
  const sent = (u as any)._sent as string[];
  assert(sent.some((s) => /Permission denied/i.test(s)));
  assertEquals(u.me.state.cofd, undefined);
});

Deno.test("staffkitExec: clear restores mortal", OPTS, async () => {
  const u = mockU({
    me: {
      id: "staff1",
      name: "Builder",
      flags: new Set([
        "player",
        "connected",
        "wizard",
        "fae",
        "approved",
      ]),
      state: {
        cofd: buildChangelingKit().sheet,
      },
    },
    args: ["clear", ""],
  });
  await staffkitExec(u);
  assertEquals(
    (u.me.state.cofd as { template?: string })?.template,
    "mortal",
  );
  assertEquals(u.me.flags.has("fae"), false);
});

Deno.test("staffkitExec: unknown splat", OPTS, async () => {
  const u = mockU({
    me: mockPlayer({
      flags: new Set(["player", "connected", "admin"]),
    }),
    args: ["", "spacemarine"],
  });
  await staffkitExec(u);
  // deno-lint-ignore no-explicit-any
  const sent = (u as any)._sent as string[];
  assert(sent.some((s) => /Unknown splat/i.test(s)));
});
