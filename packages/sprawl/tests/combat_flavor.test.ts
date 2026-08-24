import { assert, assertEquals } from "@std/assert";
import {
  combatFlavorLine,
  flavorEnabled,
  setFlavorEnabled,
} from "../engine/combat-flavor.ts";
import { defaultChar } from "../db/schemas.ts";
import type { IActionResult } from "../engine/action.ts";
import type { IDiceResult } from "../engine/dice.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function fakeResult(
  over: Partial<IActionResult> & {
    success: boolean;
  },
): IActionResult {
  const dice: IDiceResult = {
    dice: [3, 4],
    kept: [3, 4],
    total: 7,
    mode: "normal",
    doubleSix: false,
    explodeBonus: 0,
    ...(over.dice as object),
  };
  return {
    dice,
    mode: "normal",
    stat: "reaction",
    statValue: 2,
    bonuses: 0,
    total: 12,
    ds: 10,
    success: over.success,
    margin: 2,
    damageToTarget: over.success ? 2 : 0,
    damageToSelf: over.success ? 0 : 2,
    needNerveCheck: false,
    tags: [],
    ...over,
    dice: over.dice ?? dice,
  };
}

Deno.test("flavor picks hit line", OPTS, () => {
  const line = combatFlavorLine(
    {
      result: fakeResult({ success: true }),
      mode: "auto",
    },
    () => 0,
  );
  assert(line);
  assert(line!.length > 10);
  assert(line!.length <= 78);
});

Deno.test("flavor picks miss line", OPTS, () => {
  const line = combatFlavorLine(
    {
      result: fakeResult({ success: false, damageToSelf: 0 }),
      mode: "melee",
    },
    () => 0,
  );
  assert(line);
});

Deno.test("nerve beats generic miss", OPTS, () => {
  const line = combatFlavorLine(
    {
      result: fakeResult({
        success: false,
        needNerveCheck: true,
        damageToSelf: 0,
      }),
    },
    () => 0,
  );
  assert(line);
  assert(/nerve|1,1|shake|bluff/i.test(line!));
});

Deno.test("exceptional on double six hit", OPTS, () => {
  const line = combatFlavorLine(
    {
      result: fakeResult({
        success: true,
        dice: {
          dice: [6, 6],
          kept: [6, 6],
          total: 12,
          mode: "normal",
          doubleSix: true,
          explodeBonus: 0,
        },
      }),
    },
    () => 0,
  );
  assert(line);
  assert(/six|exceptional|lucky|Flow/i.test(line!));
});

Deno.test("flavor toggle default on", OPTS, () => {
  const c = defaultChar("Neon");
  assertEquals(flavorEnabled(c), true);
  const off = setFlavorEnabled(c, false);
  assertEquals(flavorEnabled(off), false);
  assertEquals(flavorEnabled(setFlavorEnabled(off, true)), true);
});

Deno.test("mono and horde keys", OPTS, () => {
  const mono = combatFlavorLine(
    {
      result: fakeResult({ success: true }),
      mono: true,
      mode: "melee",
    },
    () => 0,
  );
  assert(mono && /mono|hair-thin|whisper/i.test(mono));
  const horde = combatFlavorLine(
    {
      result: fakeResult({ success: true }),
      horde: true,
    },
    () => 0,
  );
  assert(horde && /mob|punk/i.test(horde));
});
