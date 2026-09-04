import { assertEquals } from "@std/assert";
import { DBO } from "@ursamu/mush";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

type Enc = {
  id: string;
  roomId: string;
  status: string;
  n: number;
  participants?: unknown[];
};

Deno.test("DBO update full doc then findInRoom $in", OPTS, async () => {
  const db = new DBO<Enc>("test.encsave2");
  await db.clear();
  await db.create({ id: "e1", roomId: "r1", status: "intent", n: 1 });
  await db.update({ id: "e1" }, {
    id: "e1",
    roomId: "r1",
    status: "active",
    n: 2,
    participants: [{ a: 1 }],
  } as never);
  const got = await db.findOne({ id: "e1" });
  console.log("got", JSON.stringify(got));
  assertEquals(got?.status, "active");
  const byRoom = await db.query({
    roomId: "r1",
    status: { $in: ["intent", "active"] },
  } as never);
  console.log("byRoom", byRoom.length, byRoom[0]?.status);
  assertEquals(byRoom.length, 1);
  await DBO.close();
});
