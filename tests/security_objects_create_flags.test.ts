/**
 * [CRITICAL] POST /api/v1/objects accepts arbitrary flags.
 *
 * A normal player with quota can create an object bearing wizard/admin
 * flags, escalating privilege for any code that trusts object flags.
 *
 * RED:   create with flags "thing wizard" succeeds and retains wizard.
 * GREEN: privileged flags are stripped (or request rejected).
 */
import { assertEquals, assert } from "@std/assert";
import { objectsHandler, dbojs } from "@ursamu/mush";
import { DBO } from "@ursamu/core";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const PLAYER_ID = "sec_obj_pl1";
const STAFF_ID  = "sec_obj_st1";

async function cleanup(...ids: string[]) {
  for (const id of ids) await dbojs.delete({ id }).catch(() => {});
}

Deno.test(
  "[C1] non-staff POST /objects cannot inject wizard flag",
  OPTS,
  async () => {
    await cleanup(PLAYER_ID);
    await dbojs.create({
      id: PLAYER_ID,
      flags: "player connected",
      data: { name: "FlagVictim", quota: 5 },
      location: "1",
    });

    const req = new Request("http://localhost/api/v1/objects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "EvilThing",
        flags: "thing wizard admin superuser",
      }),
    });
    const res = await objectsHandler(req, PLAYER_ID);
    assertEquals(res.status, 201, `expected 201, got ${res.status}`);
    const body = await res.json() as { id?: string; flags?: string };
    assert(body.id, "created object must have id");
    const flagStr = String(body.flags ?? "").toLowerCase();
    assert(
      !/\bwizard\b/.test(flagStr),
      `wizard must not appear in flags: ${flagStr}`,
    );
    assert(
      !/\badmin\b/.test(flagStr),
      `admin must not appear in flags: ${flagStr}`,
    );
    assert(
      !/\bsuperuser\b/.test(flagStr),
      `superuser must not appear in flags: ${flagStr}`,
    );

    const stored = await dbojs.queryOne({ id: body.id });
    const storedFlags = String(stored?.flags ?? "").toLowerCase();
    assert(!/\bwizard\b/.test(storedFlags), `DB retained wizard: ${storedFlags}`);
    await cleanup(PLAYER_ID, body.id!);
  },
);

Deno.test(
  "[C1] staff may still set builder-level object flags",
  OPTS,
  async () => {
    await cleanup(STAFF_ID);
    await dbojs.create({
      id: STAFF_ID,
      flags: "player wizard connected",
      data: { name: "FlagStaff" },
      location: "1",
    });

    const req = new Request("http://localhost/api/v1/objects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "StaffRoom", flags: "room abode" }),
    });
    const res = await objectsHandler(req, STAFF_ID);
    assertEquals(res.status, 201);
    const body = await res.json() as { id?: string; flags?: string };
    assert(/\broom\b/i.test(String(body.flags ?? "")));
    await cleanup(STAFF_ID, body.id!);
  },
);

Deno.test("security_objects_create_flags cleanup", OPTS, async () => {
  await cleanup(PLAYER_ID, STAFF_ID);
  await DBO.close();
});
