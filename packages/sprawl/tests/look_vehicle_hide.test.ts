import { assertEquals, assert } from "@std/assert";
import type { IDBObj } from "@ursamu/ursamu";
import { isHiddenInVehicle } from "../integrations/look.ts";
import { defaultChar } from "../db/schemas.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function player(
  id: string,
  activeVehicleId?: string,
): IDBObj {
  const c = defaultChar("Neon");
  c.chargenComplete = true;
  c.chargenStatus = "approved";
  if (activeVehicleId) c.activeVehicleId = activeVehicleId;
  return {
    id,
    name: id,
    flags: new Set(["player", "connected"]),
    state: { name: id, sprawl: c },
    contents: [],
    location: "room1",
  } as unknown as IDBObj;
}

Deno.test("isHiddenInVehicle when boarded", OPTS, () => {
  const onFoot = player("a");
  const inCar = player("b", "veh-9");
  assertEquals(isHiddenInVehicle(onFoot), false);
  assertEquals(isHiddenInVehicle(inCar), true);
  assertEquals(
    isHiddenInVehicle({
      id: "t",
      name: "Car",
      flags: new Set(["thing"]),
      state: {},
      contents: [],
    } as unknown as IDBObj),
    false,
  );
});

Deno.test("room list filter keeps vehicle things", OPTS, () => {
  const roomContents: IDBObj[] = [
    player("alice"),
    player("bob", "car-1"),
    {
      id: "car-1",
      name: "Ground Car",
      flags: new Set(["thing"]),
      state: {
        sprawl_item: {
          slug: "ground-car",
          kind: "vehicle",
          load: 0,
          ds: 12,
        },
      },
      contents: [],
      location: "room1",
    } as unknown as IDBObj,
  ];
  const visiblePlayers = roomContents.filter(
    (o) =>
      o.flags.has("player") &&
      o.flags.has("connected") &&
      !isHiddenInVehicle(o),
  );
  const things = roomContents.filter(
    (o) => !o.flags.has("player") && !o.flags.has("exit"),
  );
  assertEquals(visiblePlayers.map((p) => p.id), ["alice"]);
  assert(things.some((t) => t.id === "car-1"));
  assert(!visiblePlayers.some((p) => p.id === "bob"));
});
