/**
 * Vendor EB fund hooks.
 */
import { assertEquals } from "@std/assert";
import {
  initVendorHooks,
  removeVendorHooks,
} from "../src/integrations/vendor.ts";
import { buildNewCharacter } from "../engine/character.ts";
import { gameHooks } from "@ursamu/ursamu";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("vendor funds check/deduct/add EB", OPTS, async () => {
  initVendorHooks();
  try {
    const cpr = buildNewCharacter("fixer");
    cpr.eurodollars = 500;
    const charObj = {
      id: "p1",
      name: "Fixer",
      state: { cpr },
      flags: new Set(["player"]),
      contents: [],
    };
    const db = {
      search: async ({ id }: { id: string }) =>
        id === "p1" ? [charObj] : [],
      modify: async (
        id: string,
        _op: string,
        data: Record<string, unknown>,
      ) => {
        if (id === "p1" && data["state.cpr"]) {
          charObj.state.cpr = data["state.cpr"] as typeof cpr;
        }
      },
    };

    // deno-lint-ignore no-explicit-any
    const check: any = {
      actorId: "p1",
      price: 100,
      db,
    };
    await gameHooks.emit("vendor:check_funds" as never, check);
    assertEquals(check.hasFunds, true);
    assertEquals(check.currency, "eb");
    assertEquals(check.balance, 500);

    // deno-lint-ignore no-explicit-any
    const deduct: any = {
      actorId: "p1",
      price: 150,
      db,
    };
    await gameHooks.emit("vendor:deduct_funds" as never, deduct);
    assertEquals(deduct.success, true);
    assertEquals(deduct.balance, 350);
    assertEquals(charObj.state.cpr.eurodollars, 350);

    // deno-lint-ignore no-explicit-any
    const add: any = {
      actorId: "p1",
      amount: 50,
      db,
    };
    await gameHooks.emit("vendor:add_funds" as never, add);
    assertEquals(add.success, true);
    assertEquals(add.balance, 400);
  } finally {
    removeVendorHooks();
  }
});
