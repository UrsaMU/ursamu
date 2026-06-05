import { assertEquals, assertStringIncludes } from "@std/assert";
import { DBO } from "@ursamu/core";
import { dbojs } from "@ursamu/mush";
import { createNativeSDK } from "../src/services/SDK/index.ts";
import { execLook, defaultConformatHandler } from "@ursamu/mush";
import { _clearFormatHandlers, registerFormatHandler, hydrate } from "@ursamu/mush";
import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";

const OPTS = { sanitizeResources: false, sanitizeOps: false };
const SLOW = { timeout: 15000 };

const ROOM = "810001";
const ACTOR = "810002";
const BOB = "810003";
const SWORD = "810004";

async function cleanup() {
  for (const id of [ROOM, ACTOR, BOB, SWORD]) {
    await dbojs.delete({ id }).catch(() => {});
  }
}

async function seed(opts: {
  bobAttrs?: Array<{ name: string; value: string; setter: string; type: string }>;
  roomAttrs?: Array<{ name: string; value: string; setter: string; type: string }>;
} = {}) {
  await cleanup();
  _clearFormatHandlers();
  registerFormatHandler("CONFORMAT", defaultConformatHandler);

  await dbojs.create({
    id: ROOM,
    flags: "room",
    data: { name: "TestRoom", description: "A bare room.", attributes: opts.roomAttrs ?? [] },
  });

  await dbojs.create({
    id: ACTOR,
    flags: "player connected",
    data: { name: "Alice" },
    location: ROOM,
  });

  await dbojs.create({
    id: BOB,
    flags: "player connected",
    data: {
      name: "Bob",
      lastCommand: Date.now() - 5000,
      attributes: opts.bobAttrs ?? [],
    },
    location: ROOM,
  });

  await dbojs.create({
    id: SWORD,
    flags: "thing",
    data: {
      name: "Iron Sword",
      kind: "weapon",
      wielded: true,
      concealed: false,
    },
    location: BOB,
  });
}

async function makeContext(): Promise<{ u: IUrsamuSDK; target: IDBObj }> {
  const u = await createNativeSDK("conformat-sock", ACTOR, {
    name: "look", original: "look", args: [], switches: [],
  });

  // Hydrate the room from the database, including its populated contents
  const rawRoom = await dbojs.queryOne({ id: ROOM }) as unknown as IDBObj;
  const room = hydrate(rawRoom);

  // Load contents of the room
  const contents = await dbojs.query({ location: ROOM });
  room.contents = contents.map(c => hydrate(c as unknown as IDBObj));

  // Load contents of Bob
  const bobObj = room.contents.find(c => c.id === BOB);
  if (bobObj) {
    const bobContents = await dbojs.query({ location: BOB });
    bobObj.contents = bobContents.map(c => hydrate(c as unknown as IDBObj));
  }

  // Set the current room as here
  u.here = room;
  u.me = room.contents.find(c => c.id === ACTOR) || u.me;

  return { u, target: room };
}

Deno.test("conformat: default handler renders Rhost-style player rows", { ...OPTS, ...SLOW }, async () => {
  await seed({
    bobAttrs: [{ name: "short-desc", value: "A friendly lumberjack.", setter: ACTOR, type: "attribute" }]
  });
  const { u } = await makeContext();

  const sent: string[] = [];
  u.send = (m: string) => { sent.push(m); };

  await execLook(u);

  assertStringIncludes(sent[0], "Players");
  assertStringIncludes(sent[0], "Bob");
  assertStringIncludes(sent[0], "5s");
  assertStringIncludes(sent[0], "A friendly lumberjack.");

  await cleanup();
});

Deno.test("conformat: softcode @conformat overrides default handler", { ...OPTS, ...SLOW }, async () => {
  await seed({
    roomAttrs: [{ name: "CONFORMAT", value: "Bob is here, custom softcode!", setter: ACTOR, type: "attribute" }]
  });
  const { u } = await makeContext();

  const sent: string[] = [];
  u.send = (m: string) => { sent.push(m); };

  await execLook(u);

  assertStringIncludes(sent[0], "Bob is here, custom softcode!");
  assertEquals(sent[0].includes("Players"), false);

  await cleanup();
  await DBO.close();
});
