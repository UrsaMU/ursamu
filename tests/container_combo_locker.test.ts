/**
 * TDD: combination locker via softcode + put/get containers.
 *
 * Situation
 * ---------
 * A room locker holds ammo. It is locked with @lock/enter so strangers
 * cannot put/get until they dial the correct combination. Softcode on
 * the locker validates the code against &COMBO and unlocks by setting
 * an enactor state flag that the enter-lock checks.
 *
 * Exact builder softcode (paste in-game)
 * -------------------------------------
 *   @create Gym Locker
 *   @create Ammo Box
 *   put Ammo Box in Gym Locker          (owner/staff seed)
 *
 *   &COMBO Gym Locker=4-2-9
 *
 *   @lock/enter Gym Locker=attr(locker_open,1)
 *
 *   &CMD_COMBO Gym Locker=
 *   $combo *:[switch(%0,[v(COMBO)],[pemit(%#,*click* The locker unlocks.)],[pemit(%#,Wrong combination.)])]
 *
 * After a correct combo the player needs state.locker_open = "1".
 * Softcode [set(...)] emits an atcmd sentinel; until that path
 * re-dispatches reliably, builders may also:
 *   &CMD_COMBO Gym Locker=
 *   $combo *:[switch(%0,[v(COMBO)],@force me=&locker_open me=1,)]
 * or staff can set the flag. This test applies the unlock the
 * softcode is designed to grant, then asserts put/get.
 *
 * Player use
 * ----------
 *   combo 0-0-0     → denied, still locked
 *   combo 4-2-9     → unlocks (locker_open=1)
 *   get ammo from gym locker
 *   put ammo in gym locker
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  dbojs,
  createNativeSDK,
  execGet,
  execPut,
  runSoftcodeSimple,
  matchGlob,
  evaluateLock,
  hydrate,
  DBO,
} from "@ursamu/mush";
import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";

const OPTS = { sanitizeResources: false, sanitizeOps: false, timeout: 15000 };

const ROOM = "cl_room1";
const ACTOR = "cl_actor1";
const LOCKER = "cl_locker1";
const AMMO = "cl_ammo1";

/** Exact combo action body (after the `$combo *:` prefix). */
export const COMBO_ACTION =
  "[switch(%0,[v(COMBO)],UNLOCK_OK,WRONG)]";

/** Full attribute value for pipeline matchSoftcodePattern (value form). */
export const COMBO_ATTR_VALUE = `$combo *:${COMBO_ACTION}`;

/** Exact secret stored on the locker. */
export const COMBO_SECRET = "4-2-9";

/** Enter-lock string builders set with @lock/enter. */
export const ENTER_LOCK = "attr(locker_open,1)";

async function cleanup(): Promise<void> {
  for (const id of [ROOM, ACTOR, LOCKER, AMMO]) {
    await dbojs.delete({ id }).catch(() => {});
  }
}

async function seedLocker(opts: {
  actorOpen?: boolean;
} = {}): Promise<void> {
  await cleanup();

  await dbojs.create({
    id: ROOM,
    flags: "room",
    data: { name: "Gym Hallway" },
  });

  await dbojs.create({
    id: ACTOR,
    flags: "player connected",
    location: ROOM,
    data: {
      name: "Alice",
      // Unlocked session flag the enter-lock checks.
      ...(opts.actorOpen ? { locker_open: "1" } : {}),
    },
  });

  await dbojs.create({
    id: LOCKER,
    flags: "thing",
    location: ROOM,
    data: {
      name: "Gym Locker",
      owner: "staff_seed",
      locks: { enter: ENTER_LOCK },
      attributes: [
        {
          name: "COMBO",
          value: COMBO_SECRET,
          setter: "staff_seed",
          type: "attribute",
        },
        {
          name: "CMD_COMBO",
          value: COMBO_ATTR_VALUE,
          setter: "staff_seed",
          type: "attribute",
        },
      ],
    },
  });

  await dbojs.create({
    id: AMMO,
    flags: "thing",
    location: LOCKER,
    data: { name: "Ammo Box", owner: "staff_seed" },
  });
}

async function makeU(args: string[]): Promise<IUrsamuSDK> {
  const u = await createNativeSDK("cl-sock", ACTOR, {
    name: "get",
    original: args.join(" "),
    args,
    switches: [],
  });
  const raw = await dbojs.queryOne({ id: ACTOR });
  if (raw) u.me = hydrate(raw as never);
  const room = await dbojs.queryOne({ id: ROOM });
  if (room) {
    u.here = {
      ...hydrate(room as never),
      broadcast: () => {},
    } as IUrsamuSDK["here"];
  }
  return u;
}

async function loadLocker(): Promise<IDBObj> {
  const raw = await dbojs.queryOne({ id: LOCKER });
  if (!raw) throw new Error("locker missing");
  return hydrate(raw as never);
}

// ── Softcode unit (exact expression) ───────────────────────────────────────

Deno.test(
  "combo softcode: correct code returns UNLOCK_OK",
  OPTS,
  async () => {
    await seedLocker();
    const out = await runSoftcodeSimple(COMBO_ACTION, {
      actorId: ACTOR,
      executorId: LOCKER,
      args: [COMBO_SECRET],
    });
    assertEquals(out, "UNLOCK_OK");
    await cleanup();
  },
);

Deno.test(
  "combo softcode: wrong code returns WRONG",
  OPTS,
  async () => {
    await seedLocker();
    const out = await runSoftcodeSimple(COMBO_ACTION, {
      actorId: ACTOR,
      executorId: LOCKER,
      args: ["0-0-0"],
    });
    assertEquals(out, "WRONG");
    await cleanup();
  },
);

Deno.test(
  "combo $pattern glob matches player input",
  OPTS,
  () => {
    // Same glob the pipeline / findDollarPattern use.
    assertEquals(matchGlob("combo *", "combo 4-2-9"), ["4-2-9"]);
    assertEquals(matchGlob("combo *", "combo 0-0-0"), ["0-0-0"]);
    assertEquals(matchGlob("combo *", "open locker"), null);
  },
);

// ── Enter lock (attr on enactor) ───────────────────────────────────────────

Deno.test(
  "enter lock: fails without locker_open, passes with it",
  OPTS,
  async () => {
    await seedLocker({ actorOpen: false });
    const locker = await loadLocker();
    const locked = hydrate(
      (await dbojs.queryOne({ id: ACTOR })) as never,
    );
    assertEquals(
      await evaluateLock(ENTER_LOCK, locked, locker),
      false,
    );

    await dbojs.modify(
      { id: ACTOR },
      "$set",
      { "data.locker_open": "1" } as never,
    );
    const open = hydrate(
      (await dbojs.queryOne({ id: ACTOR })) as never,
    );
    assertEquals(
      await evaluateLock(ENTER_LOCK, open, locker),
      true,
    );
    await cleanup();
  },
);

// ── RED: locked → put/get denied ───────────────────────────────────────────

Deno.test(
  "RED: get from locked locker is denied",
  OPTS,
  async () => {
    await seedLocker({ actorOpen: false });
    const u = await makeU(["ammo from gym locker"]);
    const sent: string[] = [];
    u.send = (m: string) => {
      sent.push(m);
    };

    await execGet(u);

    assertStringIncludes(sent.join("\n"), "can't get anything from");
    const ammo = await dbojs.queryOne({ id: AMMO });
    assertEquals(ammo?.location, LOCKER);
    await cleanup();
  },
);

Deno.test(
  "RED: put into locked locker is denied",
  OPTS,
  async () => {
    await seedLocker({ actorOpen: false });
    // Move ammo to actor inventory first (staff seed).
    await dbojs.modify(
      { id: AMMO },
      "$set",
      { location: ACTOR } as never,
    );

    const u = await makeU(["ammo in gym locker"]);
    const sent: string[] = [];
    u.send = (m: string) => {
      sent.push(m);
    };

    await execPut(u);

    assertStringIncludes(sent.join("\n"), "can't put anything in");
    const ammo = await dbojs.queryOne({ id: AMMO });
    assertEquals(ammo?.location, ACTOR);
    await cleanup();
  },
);

// ── GREEN: softcode unlock then put/get ────────────────────────────────────

Deno.test(
  "GREEN: correct combo softcode + unlock allows get from locker",
  OPTS,
  async () => {
    await seedLocker({ actorOpen: false });

    // 1) Softcode validates the dialed code (exact expression).
    const verdict = await runSoftcodeSimple(COMBO_ACTION, {
      actorId: ACTOR,
      executorId: LOCKER,
      args: [COMBO_SECRET],
    });
    assertEquals(verdict, "UNLOCK_OK");

    // 2) Side effect the softcode is meant to grant (enactor flag).
    await dbojs.modify(
      { id: ACTOR },
      "$set",
      { "data.locker_open": "1" } as never,
    );

    // 3) get <item> from <container> now succeeds.
    const u = await makeU(["ammo from gym locker"]);
    const sent: string[] = [];
    u.send = (m: string) => {
      sent.push(m);
    };
    await execGet(u);

    assertStringIncludes(sent.join("\n"), "take");
    const ammo = await dbojs.queryOne({ id: AMMO });
    assertEquals(ammo?.location, ACTOR);
    await cleanup();
  },
);

Deno.test(
  "GREEN: unlocked locker accepts put",
  OPTS,
  async () => {
    await seedLocker({ actorOpen: true });
    await dbojs.modify(
      { id: AMMO },
      "$set",
      { location: ACTOR } as never,
    );

    const u = await makeU(["ammo in gym locker"]);
    const sent: string[] = [];
    u.send = (m: string) => {
      sent.push(m);
    };
    await execPut(u);

    assertStringIncludes(sent.join("\n"), "put");
    const ammo = await dbojs.queryOne({ id: AMMO });
    assertEquals(ammo?.location, LOCKER);
    await cleanup();
    await DBO.close();
  },
);
