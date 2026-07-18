/**
 * [HIGH] POST /objects/:id/eval and GET /objects/:id/tree skip canEdit.
 *
 * Any authenticated user who knows an object id can run softcode as that
 * object or dump its room graph without ownership.
 *
 * RED:   non-owner gets 200 on eval/tree of foreign object.
 * GREEN: non-owner gets 403; owner still succeeds.
 */
import { assertEquals } from "@std/assert";
import { objectsHandler, dbojs } from "@ursamu/mush";
import { DBO } from "@ursamu/core";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const OWNER_ID  = "sec_et_own1";
const OTHER_ID  = "sec_et_oth1";
const THING_ID  = "sec_et_th1";
const ROOM_ID   = "sec_et_rm1";

async function cleanup(...ids: string[]) {
  for (const id of ids) await dbojs.delete({ id }).catch(() => {});
}

Deno.test("[H1] non-owner POST /objects/:id/eval returns 403", OPTS, async () => {
  await cleanup(OWNER_ID, OTHER_ID, THING_ID);
  await dbojs.create({
    id: OWNER_ID,
    flags: "player connected",
    data: { name: "EvalOwner" },
    location: "1",
  });
  await dbojs.create({
    id: OTHER_ID,
    flags: "player connected",
    data: { name: "EvalOther" },
    location: "1",
  });
  await dbojs.create({
    id: THING_ID,
    flags: "thing",
    data: { name: "OwnedThing", owner: OWNER_ID },
    location: OWNER_ID,
  });

  const req = new Request(
    `http://localhost/api/v1/objects/${THING_ID}/eval`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "me" }),
    },
  );
  const res = await objectsHandler(req, OTHER_ID);
  assertEquals(
    res.status,
    403,
    `non-owner eval must be Forbidden, got ${res.status}`,
  );
  await cleanup(OWNER_ID, OTHER_ID, THING_ID);
});

Deno.test("[H1] owner POST /objects/:id/eval is allowed", OPTS, async () => {
  await cleanup(OWNER_ID, THING_ID);
  await dbojs.create({
    id: OWNER_ID,
    flags: "player connected",
    data: { name: "EvalOwner2" },
    location: "1",
  });
  await dbojs.create({
    id: THING_ID,
    flags: "thing",
    data: { name: "OwnedThing2", owner: OWNER_ID },
    location: OWNER_ID,
  });

  const req = new Request(
    `http://localhost/api/v1/objects/${THING_ID}/eval`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "me" }),
    },
  );
  const res = await objectsHandler(req, OWNER_ID);
  assertEquals(res.status, 200, `owner eval must succeed, got ${res.status}`);
  await cleanup(OWNER_ID, THING_ID);
});

Deno.test("[H2] non-owner GET /objects/:id/tree returns 403", OPTS, async () => {
  await cleanup(OWNER_ID, OTHER_ID, ROOM_ID);
  await dbojs.create({
    id: OWNER_ID,
    flags: "player connected",
    data: { name: "TreeOwner" },
    location: "1",
  });
  await dbojs.create({
    id: OTHER_ID,
    flags: "player connected",
    data: { name: "TreeOther" },
    location: "1",
  });
  await dbojs.create({
    id: ROOM_ID,
    flags: "room",
    data: { name: "SecretRoom", owner: OWNER_ID },
    location: "0",
  });

  const req = new Request(
    `http://localhost/api/v1/objects/${ROOM_ID}/tree`,
    { method: "GET" },
  );
  const res = await objectsHandler(req, OTHER_ID);
  assertEquals(
    res.status,
    403,
    `non-owner tree must be Forbidden, got ${res.status}`,
  );
  await cleanup(OWNER_ID, OTHER_ID, ROOM_ID);
});

Deno.test("security_objects_eval_tree_authz cleanup", OPTS, async () => {
  await cleanup(OWNER_ID, OTHER_ID, THING_ID, ROOM_ID);
  await DBO.close();
});
