// deno-lint-ignore-file no-explicit-any require-await
import { addCmd } from "../services/commands/index.ts";
import { dbojs, chans, DBO } from "../services/Database/index.ts";
// mail-plugin owns "mail.messages" — access via DBO directly to avoid plugin import coupling
const mail = new DBO<{ id: string; from: string; to: string[]; subject: string; message: string; date: number; read: boolean }>("mail.messages");
import { send } from "../services/broadcast/index.ts";
import { setFlags } from "../utils/setFlags.ts";
import { evaluateLock, hydrate } from "../utils/evaluateLock.ts";
import { Obj } from "../services/DBObjs/DBObjs.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

export default () =>
  addCmd({
    name: "test",
    pattern: /^@test(?:\s+(.*))?$/i,
    lock: "superuser",
    exec: async (u: IUrsamuSDK) => {
      const suite = (u.cmd.args[0] || "").trim().toLowerCase() || "all";
      const results: { name: string; pass: boolean; detail?: string }[] = [];
      const socketId = u.socketId || "";
      const ts = Date.now();

      async function assert(name: string, fn: () => Promise<boolean | string>) {
        try {
          const result = await fn();
          if (result === true) {
            results.push({ name, pass: true });
          } else {
            results.push({ name, pass: false, detail: typeof result === "string" ? result : "assertion failed" });
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          results.push({ name, pass: false, detail: msg });
        }
      }

      // Helper: create a test object with known fields
      async function makeTestObj(id: string, extra?: Record<string, unknown>) {
        await dbojs.create({
          id,
          flags: "thing",
          data: {
            name: "TestObj_" + id,
            description: "original",
            money: 999,
            password: "fakehash",
            quota: 50,
            home: "1",
            customField: "keep_me",
            ...extra,
          },
          location: u.me.id,
        });
      }

      // Helper: verify all standard fields survive
      async function verifyIntact(id: string, label: string): Promise<true | string> {
        const obj = await dbojs.queryOne({ id });
        if (!obj) return `${label}: not found`;
        if (obj.data?.money !== 999) return `${label}: money wiped (${obj.data?.money})`;
        if (obj.data?.password !== "fakehash") return `${label}: password wiped`;
        if (obj.data?.quota !== 50) return `${label}: quota wiped (${obj.data?.quota})`;
        if (obj.data?.home !== "1") return `${label}: home wiped`;
        if (obj.data?.customField !== "keep_me") return `${label}: customField wiped`;
        return true;
      }

      send([socketId], `%ch--- Running @test (suite: ${suite}) ---%cn`);

      // ============================
      // 1. DB INTEGRITY
      // ============================
      if (suite === "all" || suite === "db") {
        const id = "db_" + ts;
        await makeTestObj(id);

        await assert("db: $set dot-notation preserves siblings", async () => {
          await dbojs.modify({ id }, "$set", { "data.mood": "happy" } as any);
          const obj = await dbojs.queryOne({ id });
          if (!obj) return "not found";
          if (obj.data?.mood !== "happy") return `mood not set`;
          return verifyIntact(id, "after $set");
        });

        await assert("db: $set description preserves other fields", async () => {
          await dbojs.modify({ id }, "$set", { "data.description": "updated" } as any);
          const obj = await dbojs.queryOne({ id });
          if (!obj || obj.data?.description !== "updated") return "not updated";
          return verifyIntact(id, "after desc");
        });

        await assert("db: $unset removes field, preserves siblings", async () => {
          await dbojs.modify({ id }, "$unset", { "data.mood": 1 } as any);
          const obj = await dbojs.queryOne({ id });
          if (!obj) return "not found";
          if (obj.data?.mood !== undefined) return `not removed`;
          return verifyIntact(id, "after $unset");
        });

        await assert("db: $set/$unset alias round-trip", async () => {
          await dbojs.modify({ id }, "$set", { "data.alias": "tst" } as any);
          let obj = await dbojs.queryOne({ id });
          if (!obj || obj.data?.alias !== "tst") return "alias not set";
          await dbojs.modify({ id }, "$unset", { "data.alias": 1 } as any);
          obj = await dbojs.queryOne({ id });
          if (!obj || obj.data?.alias !== undefined) return "alias not removed";
          return verifyIntact(id, "after alias round-trip");
        });

        await assert("db: login-style update preserves all fields", async () => {
          await dbojs.modify({ id }, "$set", { "data.lastLogin": ts, "data.failedAttempts": 0 } as any);
          const obj = await dbojs.queryOne({ id });
          if (!obj || obj.data?.lastLogin === undefined) return "lastLogin not set";
          return verifyIntact(id, "after login update");
        });

        await dbojs.delete({ id });
        await assert("db: cleanup", async () => !(await dbojs.queryOne({ id })) ? true : "still exists");
      }

      // ============================
      // 2. FLAGS
      // ============================
      if (suite === "all" || suite === "flags") {
        const id = "flags_" + ts;
        await makeTestObj(id);

        await assert("flags: set 'dark'", async () => {
          const obj = await dbojs.queryOne({ id });
          if (!obj) return "not found";
          await setFlags(obj, "dark");
          const u2 = await dbojs.queryOne({ id });
          return u2?.flags.includes("dark") ? true : "dark not set";
        });

        await assert("flags: data survives set", async () => verifyIntact(id, "after flag set"));

        await assert("flags: unset 'dark'", async () => {
          const obj = await dbojs.queryOne({ id });
          if (!obj) return "not found";
          await setFlags(obj, "!dark");
          const u2 = await dbojs.queryOne({ id });
          return u2 && !u2.flags.includes("dark") ? true : "dark still set";
        });

        await assert("flags: data survives unset", async () => verifyIntact(id, "after flag unset"));

        await dbojs.delete({ id });
        await assert("flags: cleanup", async () => !(await dbojs.queryOne({ id })) ? true : "still exists");
      }

      // ============================
      // 3. COMMANDS DATA-INTEGRITY
      // ============================
      if (suite === "all" || suite === "commands") {
        const id = "cmd_" + ts;
        await makeTestObj(id);

        await assert("cmd: @describe preserves fields", async () => {
          await dbojs.modify({ id }, "$set", { "data.description": "new desc" } as any);
          const obj = await dbojs.queryOne({ id });
          if (!obj || obj.data?.description !== "new desc") return "desc not set";
          return verifyIntact(id, "@describe");
        });

        await assert("cmd: @name preserves fields", async () => {
          await dbojs.modify({ id }, "$set", { "data.name": "NewName" } as any);
          await dbojs.modify({ id }, "$unset", { "data.moniker": 1 } as any);
          const obj = await dbojs.queryOne({ id });
          if (!obj || obj.data?.name !== "NewName") return "name not set";
          return verifyIntact(id, "@name");
        });

        await assert("cmd: @alias preserves fields", async () => {
          await dbojs.modify({ id }, "$set", { "data.alias": "cnt" } as any);
          const obj = await dbojs.queryOne({ id });
          if (!obj || obj.data?.alias !== "cnt") return "alias not set";
          return verifyIntact(id, "@alias");
        });

        await assert("cmd: @set preserves fields", async () => {
          await dbojs.modify({ id }, "$set", { "data.NOTES": "some notes" } as any);
          const obj = await dbojs.queryOne({ id });
          if (!obj || obj.data?.NOTES !== "some notes") return "attr not set";
          return verifyIntact(id, "@set");
        });

        await assert("cmd: @set clear uses $unset", async () => {
          await dbojs.modify({ id }, "$unset", { "data.NOTES": 1 } as any);
          const obj = await dbojs.queryOne({ id });
          if (!obj || obj.data?.NOTES !== undefined) return "attr not removed";
          return verifyIntact(id, "@set clear");
        });

        await assert("cmd: @doing set and clear", async () => {
          await dbojs.modify({ id }, "$set", { "data.doing": "testing" } as any);
          let obj = await dbojs.queryOne({ id });
          if (!obj || obj.data?.doing !== "testing") return "doing not set";
          await dbojs.modify({ id }, "$unset", { "data.doing": 1 } as any);
          obj = await dbojs.queryOne({ id });
          if (obj?.data?.doing !== undefined) return "doing not cleared";
          return verifyIntact(id, "@doing");
        });

        await dbojs.delete({ id });
        await assert("cmd: cleanup", async () => !(await dbojs.queryOne({ id })) ? true : "still exists");
      }

      // ============================
      // 4. PERMISSIONS / LOCKS
      // ============================
      if (suite === "all" || suite === "permissions") {
        const playerRaw = await dbojs.queryOne({ id: u.me.id });
        if (!playerRaw) {
          results.push({ name: "perms: setup", pass: false, detail: "player not found" });
        } else {
          const player = hydrate(playerRaw);

          await assert("perms: superuser passes 'superuser'", async () => evaluateLock("superuser", player, player));
          await assert("perms: superuser passes 'admin+'", async () => evaluateLock("admin+", player, player));
          await assert("perms: superuser passes 'connected & admin+'", async () => evaluateLock("connected & admin+", player, player));
          await assert("perms: superuser passes 'builder+'", async () => evaluateLock("builder+", player, player));
          await assert("perms: empty lock passes", async () => evaluateLock("", player, player));
          await assert("perms: dbref matches own id", async () => evaluateLock(`#${u.me.id}`, player, player));
          await assert("perms: dbref rejects wrong id", async () => (await evaluateLock("#99999", player, player)) === false ? true : "should reject");
          await assert("perms: NOT operator", async () => (await evaluateLock("!guest", player, player)) ? true : "should pass");
          await assert("perms: OR operator", async () => (await evaluateLock("guest | superuser", player, player)) ? true : "should pass");
          await assert("perms: AND with failing side rejects", async () => (await evaluateLock("superuser & guest", player, player)) === false ? true : "should fail");
          await assert("perms: nested parens", async () => (await evaluateLock("(superuser | guest) & connected", player, player)) ? true : "should pass");
          await assert("perms: double NOT", async () => (await evaluateLock("!!superuser", player, player)) ? true : "should pass");
        }
      }

      // ============================
      // 5. CHANNELS
      // ============================
      if (suite === "all" || suite === "channels") {
        const chanId = "testchan_" + ts;

        await assert("chan: create", async () => {
          await chans.create({ id: chanId, name: chanId, header: "[TEST]", alias: "tch" });
          return (await chans.queryOne({ id: chanId })) ? true : "not created";
        });

        await assert("chan: query", async () => {
          const ch = await chans.queryOne({ id: chanId });
          return ch?.name === chanId ? true : `name wrong: ${ch?.name}`;
        });

        await assert("chan: modify header", async () => {
          await chans.modify({ id: chanId }, "$set", { header: "[UPDATED]" } as any);
          const ch = await chans.queryOne({ id: chanId });
          return ch?.header === "[UPDATED]" ? true : `header wrong: ${ch?.header}`;
        });

        await assert("chan: delete", async () => {
          await chans.delete({ id: chanId });
          return !(await chans.queryOne({ id: chanId })) ? true : "still exists";
        });
      }

      // ============================
      // 6. EXITS
      // ============================
      if (suite === "all" || suite === "exits") {
        const rA = "roomA_" + ts, rB = "roomB_" + ts, exF = "exF_" + ts, exB = "exB_" + ts;
        await dbojs.create({ id: rA, flags: "room", data: { name: "Room A" } });
        await dbojs.create({ id: rB, flags: "room", data: { name: "Room B" } });
        await dbojs.create({ id: exF, flags: "exit", location: rA, data: { name: "north;n", destination: rB } });
        await dbojs.create({ id: exB, flags: "exit", location: rB, data: { name: "south;s", destination: rA } });

        await assert("exits: rooms created", async () => {
          return (await dbojs.queryOne({ id: rA })) && (await dbojs.queryOne({ id: rB })) ? true : "missing";
        });

        await assert("exits: forward exit in room A", async () => {
          const ex = await dbojs.queryOne({ id: exF });
          return ex?.data?.destination === rB ? true : "wrong dest";
        });

        await assert("exits: back exit in room B", async () => {
          const ex = await dbojs.queryOne({ id: exB });
          return ex?.data?.destination === rA ? true : "wrong dest";
        });

        await assert("exits: semicolon alias parsing", async () => {
          const ex = await dbojs.queryOne({ id: exF });
          const parts = (ex?.data?.name as string || "").split(";");
          return parts[0] === "north" && parts[1] === "n" ? true : `wrong: ${parts}`;
        });

        await assert("exits: modify preserves exit data", async () => {
          await dbojs.modify({ id: exF }, "$set", { "data.lock": "player+" } as any);
          const ex = await dbojs.queryOne({ id: exF });
          if (ex?.data?.lock !== "player+") return "lock not set";
          if (ex?.data?.name !== "north;n") return "name wiped";
          if (ex?.data?.destination !== rB) return "dest wiped";
          return true;
        });

        for (const x of [exF, exB, rA, rB]) await dbojs.delete({ id: x });
        await assert("exits: cleanup", async () => !(await dbojs.queryOne({ id: rA })) ? true : "still exists");
      }

      // ============================
      // 7. MAIL
      // ============================
      if (suite === "all" || suite === "mail") {
        const mId = crypto.randomUUID();

        await assert("mail: send", async () => {
          await mail.create({ id: mId, from: `#${u.me.id}`, to: [`#${u.me.id}`], subject: "Test", message: "body", date: ts, read: false });
          return true;
        });

        await assert("mail: read back", async () => {
          const m = (await mail.query({ id: mId } as any))[0];
          return m?.message === "body" ? true : "not found or mismatch";
        });

        await assert("mail: delete and verify", async () => {
          await mail.delete({ id: mId });
          return (await mail.query({ id: mId } as any)).length === 0 ? true : "still exists";
        });
      }

      // ============================
      // 8. CONNECT (login data flow)
      // ============================
      if (suite === "all" || suite === "connect") {
        const id = "conn_" + ts;
        await dbojs.create({
          id, flags: "player",
          data: { name: "LoginTest", password: "hash123", money: 200, quota: 15, home: "1", alias: "LT", channels: [] },
        });

        await assert("connect: login update preserves password", async () => {
          await dbojs.modify({ id }, "$set", { "data.lastLogin": ts, "data.failedAttempts": 0 } as any);
          const obj = await dbojs.queryOne({ id });
          if (!obj) return "not found";
          if (obj.data?.password !== "hash123") return `password wiped: ${obj.data?.password}`;
          if (obj.data?.name !== "LoginTest") return `name wiped`;
          if (obj.data?.money !== 200) return `money wiped`;
          if (obj.data?.alias !== "LT") return `alias wiped`;
          return true;
        });

        await assert("connect: multiple login updates don't corrupt", async () => {
          for (let i = 0; i < 5; i++) {
            await dbojs.modify({ id }, "$set", { "data.lastLogin": ts + i, "data.failedAttempts": 0 } as any);
          }
          const obj = await dbojs.queryOne({ id });
          if (!obj) return "not found";
          if (obj.data?.password !== "hash123") return `password wiped after 5 logins`;
          if (obj.data?.money !== 200) return `money wiped after 5 logins`;
          if (obj.data?.quota !== 15) return `quota wiped`;
          return true;
        });

        await dbojs.delete({ id });
        await assert("connect: cleanup", async () => !(await dbojs.queryOne({ id })) ? true : "still exists");
      }

      // ============================
      // 9. OBJECTS (create/destroy, quota)
      // ============================
      if (suite === "all" || suite === "objects") {
        const ownerId = "owner_" + ts;
        const thingId = "thing_" + ts;
        await dbojs.create({
          id: ownerId, flags: "player", location: "1",
          data: { name: "Builder", quota: 10, money: 100 },
        });

        await assert("objects: create thing", async () => {
          await dbojs.create({ id: thingId, flags: "thing", location: ownerId, data: { name: "Widget", owner: ownerId } });
          const thing = await dbojs.queryOne({ id: thingId });
          return thing?.data?.name === "Widget" ? true : "not created";
        });

        await assert("objects: thing in owner's inventory", async () => {
          const thing = await dbojs.queryOne({ id: thingId });
          return thing?.location === ownerId ? true : `wrong location: ${thing?.location}`;
        });

        await assert("objects: decrement quota preserves data", async () => {
          await dbojs.modify({ id: ownerId }, "$set", { "data.quota": 9 } as any);
          const owner = await dbojs.queryOne({ id: ownerId });
          if (!owner) return "not found";
          if (owner.data?.quota !== 9) return `quota wrong: ${owner.data?.quota}`;
          if (owner.data?.name !== "Builder") return `name wiped`;
          if (owner.data?.money !== 100) return `money wiped`;
          return true;
        });

        await assert("objects: destroy thing", async () => {
          await dbojs.delete({ id: thingId });
          return !(await dbojs.queryOne({ id: thingId })) ? true : "still exists";
        });

        await dbojs.delete({ id: ownerId });
        await assert("objects: cleanup", async () => !(await dbojs.queryOne({ id: ownerId })) ? true : "still exists");
      }

      // ============================
      // 10. SEARCH (Obj.get edge cases)
      // ============================
      if (suite === "all" || suite === "search") {
        const id = "search_" + ts;
        await dbojs.create({ id, flags: "thing", data: { name: "Searchable", alias: "srch" }, location: u.me.id });

        await assert("search: Obj.get('') returns null", async () => {
          const result = await Obj.get("");
          return result === null ? true : "should be null";
        });

        await assert("search: Obj.get by #id", async () => {
          const result = await Obj.get(`#${id}`);
          return result?.id === id ? true : `wrong: ${result?.id}`;
        });

        await assert("search: Obj.get by name", async () => {
          const result = await Obj.get("Searchable");
          return result?.id === id ? true : `wrong: ${result?.id}`;
        });

        await assert("search: Obj.get by alias", async () => {
          const result = await Obj.get("srch");
          return result?.id === id ? true : `wrong: ${result?.id}`;
        });

        await assert("search: Obj.get non-existent returns null", async () => {
          const result = await Obj.get("xyznonexistent999");
          return result === null ? true : "should be null";
        });

        await assert("search: Obj.get undefined returns null", async () => {
          const result = await Obj.get(undefined);
          return result === null ? true : "should be null";
        });

        await dbojs.delete({ id });
        await assert("search: cleanup", async () => !(await dbojs.queryOne({ id })) ? true : "still exists");
      }

      // ============================
      // 11. ATTRIBUTES (custom &attrs)
      // ============================
      if (suite === "all" || suite === "attributes") {
        const id = "attr_" + ts;
        await makeTestObj(id);

        await assert("attr: set custom attribute", async () => {
          const attrs = [{ name: "NOTE", value: "hello world", setter: u.me.id, type: "attribute" }];
          await dbojs.modify({ id }, "$set", { "data.attributes": attrs } as any);
          const obj = await dbojs.queryOne({ id });
          const a = (obj?.data?.attributes as any[])?.[0];
          return a?.value === "hello world" ? true : "attr not set";
        });

        await assert("attr: set preserves other data", async () => verifyIntact(id, "after attr set"));

        await assert("attr: add second attribute", async () => {
          const obj = await dbojs.queryOne({ id });
          const attrs = (obj?.data?.attributes as any[]) || [];
          attrs.push({ name: "MOOD", value: "happy", setter: u.me.id, type: "attribute" });
          await dbojs.modify({ id }, "$set", { "data.attributes": attrs } as any);
          const obj2 = await dbojs.queryOne({ id });
          return (obj2?.data?.attributes as any[])?.length === 2 ? true : "wrong count";
        });

        await assert("attr: clear all attributes", async () => {
          await dbojs.modify({ id }, "$set", { "data.attributes": [] } as any);
          const obj = await dbojs.queryOne({ id });
          return (obj?.data?.attributes as any[])?.length === 0 ? true : "not cleared";
        });

        await assert("attr: clear preserves other data", async () => verifyIntact(id, "after attr clear"));

        await dbojs.delete({ id });
        await assert("attr: cleanup", async () => !(await dbojs.queryOne({ id })) ? true : "still exists");
      }

      // ============================
      // 12. TELEPORT
      // ============================
      if (suite === "all" || suite === "teleport") {
        const roomId = "telroom_" + ts;
        const objId = "telobj_" + ts;
        await dbojs.create({ id: roomId, flags: "room", data: { name: "TelRoom" } });
        await makeTestObj(objId);

        await assert("teleport: move object to room", async () => {
          await dbojs.modify({ id: objId }, "$set", { location: roomId } as any);
          const obj = await dbojs.queryOne({ id: objId });
          return obj?.location === roomId ? true : `wrong location: ${obj?.location}`;
        });

        await assert("teleport: data survives move", async () => verifyIntact(objId, "after teleport"));

        await assert("teleport: move back", async () => {
          await dbojs.modify({ id: objId }, "$set", { location: u.me.id } as any);
          const obj = await dbojs.queryOne({ id: objId });
          return obj?.location === u.me.id ? true : "wrong location";
        });

        await dbojs.delete({ id: objId });
        await dbojs.delete({ id: roomId });
        await assert("teleport: cleanup", async () => !(await dbojs.queryOne({ id: roomId })) ? true : "still exists");
      }

      // ============================
      // 13. INVENTORY (get/drop)
      // ============================
      if (suite === "all" || suite === "inventory") {
        const roomId = "invroom_" + ts;
        const playerId = "invplayer_" + ts;
        const itemId = "invitem_" + ts;
        await dbojs.create({ id: roomId, flags: "room", data: { name: "InvRoom" } });
        await dbojs.create({ id: playerId, flags: "player", location: roomId, data: { name: "Holder" } });
        await dbojs.create({ id: itemId, flags: "thing", location: roomId, data: { name: "Sword", damage: 10 } });

        await assert("inv: item starts in room", async () => {
          const item = await dbojs.queryOne({ id: itemId });
          return item?.location === roomId ? true : "wrong location";
        });

        await assert("inv: pick up (move to player)", async () => {
          await dbojs.modify({ id: itemId }, "$set", { location: playerId } as any);
          const item = await dbojs.queryOne({ id: itemId });
          return item?.location === playerId ? true : "not picked up";
        });

        await assert("inv: item data survives pickup", async () => {
          const item = await dbojs.queryOne({ id: itemId });
          if (item?.data?.name !== "Sword") return "name wiped";
          if (item?.data?.damage !== 10) return "damage wiped";
          return true;
        });

        await assert("inv: drop (move to room)", async () => {
          await dbojs.modify({ id: itemId }, "$set", { location: roomId } as any);
          const item = await dbojs.queryOne({ id: itemId });
          return item?.location === roomId ? true : "not dropped";
        });

        for (const x of [itemId, playerId, roomId]) await dbojs.delete({ id: x });
        await assert("inv: cleanup", async () => !(await dbojs.queryOne({ id: itemId })) ? true : "still exists");
      }

      // ============================
      // 14. $INC OPERATOR
      // ============================
      if (suite === "all" || suite === "inc") {
        const id = "inc_" + ts;
        await dbojs.create({ id, flags: "player", data: { name: "Banker", money: 100, xp: 0 } });

        await assert("inc: add money", async () => {
          await dbojs.modify({ id }, "$inc", { "data.money": 50 } as any);
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.money === 150 ? true : `wrong: ${obj?.data?.money}`;
        });

        await assert("inc: subtract money", async () => {
          await dbojs.modify({ id }, "$inc", { "data.money": -30 } as any);
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.money === 120 ? true : `wrong: ${obj?.data?.money}`;
        });

        await assert("inc: preserves name", async () => {
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.name === "Banker" ? true : `name wiped: ${obj?.data?.name}`;
        });

        await assert("inc: multiple fields", async () => {
          await dbojs.modify({ id }, "$inc", { "data.money": 10, "data.xp": 25 } as any);
          const obj = await dbojs.queryOne({ id });
          if (obj?.data?.money !== 130) return `money wrong: ${obj?.data?.money}`;
          if (obj?.data?.xp !== 25) return `xp wrong: ${obj?.data?.xp}`;
          return true;
        });

        await dbojs.delete({ id });
        await assert("inc: cleanup", async () => !(await dbojs.queryOne({ id })) ? true : "still exists");
      }

      // ============================
      // 15. STRESS (rapid sequential)
      // ============================
      if (suite === "all" || suite === "stress") {
        const id = "stress_" + ts;
        await makeTestObj(id);

        await assert("stress: 20 rapid modifies", async () => {
          for (let i = 0; i < 20; i++) {
            await dbojs.modify({ id }, "$set", { [`data.field_${i}`]: `value_${i}` } as any);
          }
          const obj = await dbojs.queryOne({ id });
          if (!obj) return "not found";
          for (let i = 0; i < 20; i++) {
            if (obj.data?.[`field_${i}`] !== `value_${i}`) return `field_${i} missing`;
          }
          return verifyIntact(id, "after 20 modifies");
        });

        await dbojs.delete({ id });
        await assert("stress: cleanup", async () => !(await dbojs.queryOne({ id })) ? true : "still exists");
      }

      // ============================
      // 16. CONCURRENT (two fields same object)
      // ============================
      if (suite === "all" || suite === "concurrent") {
        const id = "conc_" + ts;
        await makeTestObj(id);

        await assert("concurrent: two sequential modifies same object", async () => {
          await dbojs.modify({ id }, "$set", { "data.fieldA": "alpha" } as any);
          await dbojs.modify({ id }, "$set", { "data.fieldB": "beta" } as any);
          const obj = await dbojs.queryOne({ id });
          if (obj?.data?.fieldA !== "alpha") return `fieldA missing`;
          if (obj?.data?.fieldB !== "beta") return `fieldB missing`;
          return verifyIntact(id, "after concurrent");
        });

        await dbojs.delete({ id });
        await assert("concurrent: cleanup", async () => !(await dbojs.queryOne({ id })) ? true : "still exists");
      }

      // ============================
      // 17. UNICODE
      // ============================
      if (suite === "all" || suite === "unicode") {
        const id = "uni_" + ts;
        await dbojs.create({ id, flags: "thing", data: { name: "UniTest" }, location: u.me.id });

        await assert("unicode: accented characters", async () => {
          await dbojs.modify({ id }, "$set", { "data.name": "Ren\u00e9 M\u00fcller" } as any);
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.name === "Ren\u00e9 M\u00fcller" ? true : `wrong: ${obj?.data?.name}`;
        });

        await assert("unicode: CJK characters", async () => {
          await dbojs.modify({ id }, "$set", { "data.description": "\u6e38\u620f\u4e16\u754c" } as any);
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.description === "\u6e38\u620f\u4e16\u754c" ? true : "CJK lost";
        });

        await assert("unicode: emoji", async () => {
          await dbojs.modify({ id }, "$set", { "data.mood": "\u2764\ufe0f\ud83d\ude80\ud83c\udf1f" } as any);
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.mood === "\u2764\ufe0f\ud83d\ude80\ud83c\udf1f" ? true : "emoji lost";
        });

        await assert("unicode: special symbols", async () => {
          await dbojs.modify({ id }, "$set", { "data.note": "a < b & c > d \"quoted\" 'apos'" } as any);
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.note === "a < b & c > d \"quoted\" 'apos'" ? true : "symbols lost";
        });

        await dbojs.delete({ id });
        await assert("unicode: cleanup", async () => !(await dbojs.queryOne({ id })) ? true : "still exists");
      }

      // ============================
      // 18. LONGTEXT
      // ============================
      if (suite === "all" || suite === "longtext") {
        const id = "long_" + ts;
        await makeTestObj(id);
        const longStr = "A".repeat(4000);

        await assert("longtext: store 4000 chars", async () => {
          await dbojs.modify({ id }, "$set", { "data.description": longStr } as any);
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.description === longStr ? true : `length: ${(obj?.data?.description as string)?.length}`;
        });

        await assert("longtext: preserves other fields", async () => verifyIntact(id, "after longtext"));

        await dbojs.delete({ id });
        await assert("longtext: cleanup", async () => !(await dbojs.queryOne({ id })) ? true : "still exists");
      }

      // ============================
      // 19. NESTED (deep dot-notation)
      // ============================
      if (suite === "all" || suite === "nested") {
        const id = "nest_" + ts;
        await dbojs.create({ id, flags: "thing", data: { name: "NestTest", stats: { str: 10, dex: 12 } }, location: u.me.id });

        await assert("nested: set 2-level deep", async () => {
          await dbojs.modify({ id }, "$set", { "data.stats.wis": 14 } as any);
          const obj = await dbojs.queryOne({ id });
          const stats = obj?.data?.stats as Record<string, number>;
          if (stats?.wis !== 14) return `wis not set: ${stats?.wis}`;
          if (stats?.str !== 10) return `str wiped: ${stats?.str}`;
          if (stats?.dex !== 12) return `dex wiped: ${stats?.dex}`;
          return true;
        });

        await assert("nested: modify preserves name", async () => {
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.name === "NestTest" ? true : "name wiped";
        });

        await assert("nested: $unset deep field", async () => {
          await dbojs.modify({ id }, "$unset", { "data.stats.wis": 1 } as any);
          const obj = await dbojs.queryOne({ id });
          const stats = obj?.data?.stats as Record<string, number>;
          if (stats?.wis !== undefined) return "wis not removed";
          if (stats?.str !== 10) return "str wiped";
          return true;
        });

        await dbojs.delete({ id });
        await assert("nested: cleanup", async () => !(await dbojs.queryOne({ id })) ? true : "still exists");
      }

      // ============================
      // 20. EMPTY VALUES
      // ============================
      if (suite === "all" || suite === "empty") {
        const id = "empty_" + ts;
        await dbojs.create({ id, flags: "thing", data: { name: "EmptyTest", existing: "keep" }, location: u.me.id });

        await assert("empty: set to empty string", async () => {
          await dbojs.modify({ id }, "$set", { "data.note": "" } as any);
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.note === "" ? true : `wrong: ${obj?.data?.note}`;
        });

        await assert("empty: set to zero", async () => {
          await dbojs.modify({ id }, "$set", { "data.count": 0 } as any);
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.count === 0 ? true : `wrong: ${obj?.data?.count}`;
        });

        await assert("empty: set to false", async () => {
          await dbojs.modify({ id }, "$set", { "data.active": false } as any);
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.active === false ? true : `wrong: ${obj?.data?.active}`;
        });

        await assert("empty: set to null", async () => {
          await dbojs.modify({ id }, "$set", { "data.optional": null } as any);
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.optional === null ? true : `wrong: ${obj?.data?.optional}`;
        });

        await assert("empty: existing field survives", async () => {
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.existing === "keep" ? true : "existing wiped";
        });

        await dbojs.delete({ id });
        await assert("empty: cleanup", async () => !(await dbojs.queryOne({ id })) ? true : "still exists");
      }

      // ============================
      // 21. PARENT
      // ============================
      if (suite === "all" || suite === "parent") {
        const parentId = "par_" + ts;
        const childId = "child_" + ts;
        await makeTestObj(childId);
        await dbojs.create({ id: parentId, flags: "thing", data: { name: "ParentObj" }, location: u.me.id });

        await assert("parent: set parent", async () => {
          await dbojs.modify({ id: childId }, "$set", { "data.parent": parentId } as any);
          const obj = await dbojs.queryOne({ id: childId });
          return obj?.data?.parent === parentId ? true : `wrong: ${obj?.data?.parent}`;
        });

        await assert("parent: data survives", async () => verifyIntact(childId, "after parent set"));

        await assert("parent: clear parent", async () => {
          await dbojs.modify({ id: childId }, "$unset", { "data.parent": 1 } as any);
          const obj = await dbojs.queryOne({ id: childId });
          return obj?.data?.parent === undefined ? true : "not cleared";
        });

        await assert("parent: data survives clear", async () => verifyIntact(childId, "after parent clear"));

        for (const x of [childId, parentId]) await dbojs.delete({ id: x });
        await assert("parent: cleanup", async () => !(await dbojs.queryOne({ id: childId })) ? true : "still exists");
      }

      // ============================
      // 22. OWNERSHIP (@chown)
      // ============================
      if (suite === "all" || suite === "ownership") {
        const id = "own_" + ts;
        await makeTestObj(id);

        await assert("ownership: set owner", async () => {
          await dbojs.modify({ id }, "$set", { "data.owner": u.me.id } as any);
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.owner === u.me.id ? true : "owner not set";
        });

        await assert("ownership: data survives", async () => verifyIntact(id, "after chown"));

        await assert("ownership: change owner", async () => {
          await dbojs.modify({ id }, "$set", { "data.owner": "someone_else" } as any);
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.owner === "someone_else" ? true : "owner not changed";
        });

        await assert("ownership: data still intact", async () => verifyIntact(id, "after owner change"));

        await dbojs.delete({ id });
        await assert("ownership: cleanup", async () => !(await dbojs.queryOne({ id })) ? true : "still exists");
      }

      // ============================
      // 23. LOCATION
      // ============================
      if (suite === "all" || suite === "location") {
        const r1 = "loc1_" + ts, r2 = "loc2_" + ts, objId = "locobj_" + ts;
        await dbojs.create({ id: r1, flags: "room", data: { name: "Loc Room 1" } });
        await dbojs.create({ id: r2, flags: "room", data: { name: "Loc Room 2" } });
        await makeTestObj(objId);
        await dbojs.modify({ id: objId }, "$set", { location: r1 } as any);

        await assert("location: object in room 1", async () => {
          const obj = await dbojs.queryOne({ id: objId });
          return obj?.location === r1 ? true : `wrong: ${obj?.location}`;
        });

        await assert("location: move to room 2", async () => {
          await dbojs.modify({ id: objId }, "$set", { location: r2 } as any);
          const obj = await dbojs.queryOne({ id: objId });
          return obj?.location === r2 ? true : `wrong: ${obj?.location}`;
        });

        await assert("location: data survives move", async () => verifyIntact(objId, "after move"));

        for (const x of [objId, r1, r2]) await dbojs.delete({ id: x });
        await assert("location: cleanup", async () => !(await dbojs.queryOne({ id: r1 })) ? true : "still exists");
      }

      // ============================
      // 24. LOCK EVALUATION (complex)
      // ============================
      if (suite === "all" || suite === "lockeval") {
        const playerRaw = await dbojs.queryOne({ id: u.me.id });
        if (!playerRaw) {
          results.push({ name: "lockeval: setup", pass: false, detail: "player not found" });
        } else {
          const player = hydrate(playerRaw);

          await assert("lockeval: nested (a | b) & c", async () => {
            return (await evaluateLock("(wizard | superuser) & connected", player, player)) ? true : "should pass";
          });

          await assert("lockeval: a & (b | c)", async () => {
            return (await evaluateLock("connected & (admin+ | builder+)", player, player)) ? true : "should pass";
          });

          await assert("lockeval: triple AND", async () => {
            return (await evaluateLock("connected & superuser & player", player, player)) ? true : "should pass";
          });

          await assert("lockeval: NOT with parens", async () => {
            return (await evaluateLock("!(guest & dark)", player, player)) ? true : "should pass";
          });

          await assert("lockeval: attribute-based lock", async () => {
            // Set a test attribute on the player
            await dbojs.modify({ id: u.me.id }, "$set", { "data.faction": "rebels" } as any);
            const fresh = await dbojs.queryOne({ id: u.me.id });
            if (!fresh) return "player not found";
            const p = hydrate(fresh);
            const result = await evaluateLock("faction:rebels", p, p);
            // Clean up
            await dbojs.modify({ id: u.me.id }, "$unset", { "data.faction": 1 } as any);
            return result ? true : "attr lock failed";
          });

          await assert("lockeval: attribute-based lock wrong value rejects", async () => {
            await dbojs.modify({ id: u.me.id }, "$set", { "data.faction": "rebels" } as any);
            const fresh = await dbojs.queryOne({ id: u.me.id });
            if (!fresh) return "player not found";
            const p = hydrate(fresh);
            const result = await evaluateLock("faction:empire", p, p);
            await dbojs.modify({ id: u.me.id }, "$unset", { "data.faction": 1 } as any);
            return result === false ? true : "should reject";
          });
        }
      }

      // ============================
      // 25. FLAG PERMISSIONS
      // ============================
      if (suite === "all" || suite === "flagperms") {
        const id = "fp_" + ts;
        await dbojs.create({ id, flags: "player", data: { name: "NormalPlayer" }, location: "1" });

        await assert("flagperms: superuser can set wizard", async () => {
          const obj = await dbojs.queryOne({ id });
          if (!obj) return "not found";
          const me = await dbojs.queryOne({ id: u.me.id });
          if (!me) return "me not found";
          try {
            await setFlags(obj, "wizard", me);
            const updated = await dbojs.queryOne({ id });
            return updated?.flags.includes("wizard") ? true : "wizard not set";
          } catch (e) {
            return `error: ${e instanceof Error ? e.message : e}`;
          }
        });

        await assert("flagperms: clean up wizard flag", async () => {
          const obj = await dbojs.queryOne({ id });
          if (!obj) return "not found";
          const me = await dbojs.queryOne({ id: u.me.id });
          if (!me) return "me not found";
          await setFlags(obj, "!wizard", me);
          const updated = await dbojs.queryOne({ id });
          return updated && !updated.flags.includes("wizard") ? true : "wizard still set";
        });

        await dbojs.delete({ id });
        await assert("flagperms: cleanup", async () => !(await dbojs.queryOne({ id })) ? true : "still exists");
      }

      // ============================
      // 26. BAD INPUT
      // ============================
      if (suite === "all" || suite === "badinput") {
        const id = "bad_" + ts;
        await dbojs.create({ id, flags: "thing", data: { name: "BadTest" }, location: u.me.id });

        await assert("badinput: unknown operator is no-op", async () => {
          await dbojs.modify({ id }, "$fakeopp", { "data.x": 1 } as any);
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.name === "BadTest" ? true : "object corrupted";
        });

        await assert("badinput: query non-existent returns empty", async () => {
          const result = await dbojs.query({ id: "nonexistent_" + ts });
          return result.length === 0 ? true : "should be empty";
        });

        await assert("badinput: modify non-existent is no-op", async () => {
          const result = await dbojs.modify({ id: "nonexistent_" + ts }, "$set", { "data.x": 1 } as any);
          return result.length === 0 ? true : "should be empty";
        });

        await dbojs.delete({ id });
        await assert("badinput: cleanup", async () => !(await dbojs.queryOne({ id })) ? true : "still exists");
      }

      // ============================
      // 27. DOUBLE DELETE
      // ============================
      if (suite === "all" || suite === "doubledelete") {
        const id = "dd_" + ts;
        await dbojs.create({ id, flags: "thing", data: { name: "DeleteMe" }, location: u.me.id });

        await assert("doubledelete: first delete works", async () => {
          await dbojs.delete({ id });
          return !(await dbojs.queryOne({ id })) ? true : "still exists";
        });

        await assert("doubledelete: second delete no crash", async () => {
          await dbojs.delete({ id });
          return true; // If we get here without throwing, it passed
        });
      }

      // ============================
      // 28. MODIFY GHOST (deleted object)
      // ============================
      if (suite === "all" || suite === "modifyghost") {
        const id = "ghost_" + ts;
        await dbojs.create({ id, flags: "thing", data: { name: "Ghost" }, location: u.me.id });
        await dbojs.delete({ id });

        await assert("modifyghost: modify deleted object no crash", async () => {
          const result = await dbojs.modify({ id }, "$set", { "data.x": 1 } as any);
          return result.length === 0 ? true : "should return empty";
        });

        await assert("modifyghost: $unset deleted object no crash", async () => {
          const result = await dbojs.modify({ id }, "$unset", { "data.x": 1 } as any);
          return result.length === 0 ? true : "should return empty";
        });
      }

      // ============================
      // 29. BIGBATCH
      // ============================
      if (suite === "all" || suite === "bigbatch") {
        const prefix = "batch_" + ts + "_";
        const count = 50;

        await assert(`bigbatch: create ${count} objects`, async () => {
          for (let i = 0; i < count; i++) {
            await dbojs.create({ id: prefix + i, flags: "thing", data: { name: `Batch${i}`, idx: i }, location: u.me.id });
          }
          return true;
        });

        await assert(`bigbatch: query all ${count}`, async () => {
          let found = 0;
          for (let i = 0; i < count; i++) {
            if (await dbojs.queryOne({ id: prefix + i })) found++;
          }
          return found === count ? true : `only found ${found}/${count}`;
        });

        await assert(`bigbatch: delete all ${count}`, async () => {
          for (let i = 0; i < count; i++) {
            await dbojs.delete({ id: prefix + i });
          }
          return true;
        });

        await assert("bigbatch: verify all deleted", async () => {
          let remaining = 0;
          for (let i = 0; i < count; i++) {
            if (await dbojs.queryOne({ id: prefix + i })) remaining++;
          }
          return remaining === 0 ? true : `${remaining} still exist`;
        });
      }

      // ============================
      // 30. OVERWRITE (type coercion)
      // ============================
      if (suite === "all" || suite === "overwrite") {
        const id = "ow_" + ts;
        await dbojs.create({ id, flags: "thing", data: { name: "OverwriteTest", val: "string", num: 42, arr: [1, 2, 3] }, location: u.me.id });

        await assert("overwrite: string → number", async () => {
          await dbojs.modify({ id }, "$set", { "data.val": 123 } as any);
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.val === 123 ? true : `wrong: ${obj?.data?.val} (${typeof obj?.data?.val})`;
        });

        await assert("overwrite: number → string", async () => {
          await dbojs.modify({ id }, "$set", { "data.num": "forty-two" } as any);
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.num === "forty-two" ? true : `wrong: ${obj?.data?.num}`;
        });

        await assert("overwrite: array → string", async () => {
          await dbojs.modify({ id }, "$set", { "data.arr": "not an array" } as any);
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.arr === "not an array" ? true : `wrong: ${obj?.data?.arr}`;
        });

        await assert("overwrite: string → object", async () => {
          await dbojs.modify({ id }, "$set", { "data.val": { nested: true } } as any);
          const obj = await dbojs.queryOne({ id });
          const val = obj?.data?.val as Record<string, unknown>;
          return val?.nested === true ? true : `wrong: ${JSON.stringify(val)}`;
        });

        await assert("overwrite: name survives type changes", async () => {
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.name === "OverwriteTest" ? true : `name wiped: ${obj?.data?.name}`;
        });

        await dbojs.delete({ id });
        await assert("overwrite: cleanup", async () => !(await dbojs.queryOne({ id })) ? true : "still exists");
      }

      // ============================
      // 31. TIMESTAMPS
      // ============================
      if (suite === "all" || suite === "timestamps") {
        const id = "ts_" + ts;
        const now = Date.now();
        await dbojs.create({ id, flags: "thing", data: { name: "TimeTest" }, location: u.me.id });

        await assert("timestamps: store Date.now() as number", async () => {
          await dbojs.modify({ id }, "$set", { "data.created": now } as any);
          const obj = await dbojs.queryOne({ id });
          if (typeof obj?.data?.created !== "number") return `wrong type: ${typeof obj?.data?.created}`;
          if (obj.data.created !== now) return `value changed: ${obj.data.created} vs ${now}`;
          return true;
        });

        await assert("timestamps: survives subsequent modify", async () => {
          await dbojs.modify({ id }, "$set", { "data.lastSeen": now + 1000 } as any);
          const obj = await dbojs.queryOne({ id });
          if (obj?.data?.created !== now) return `created changed: ${obj?.data?.created}`;
          if (obj?.data?.lastSeen !== now + 1000) return `lastSeen wrong`;
          return true;
        });

        await assert("timestamps: large value (year 2099)", async () => {
          const future = 4102444800000; // Jan 1, 2099
          await dbojs.modify({ id }, "$set", { "data.expires": future } as any);
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.expires === future ? true : `lost precision: ${obj?.data?.expires}`;
        });

        await dbojs.delete({ id });
        await assert("timestamps: cleanup", async () => !(await dbojs.queryOne({ id })) ? true : "still exists");
      }

      // ============================
      // 32. ARRAYS
      // ============================
      if (suite === "all" || suite === "arrays") {
        const id = "arr_" + ts;
        const channels = [
          { channel: "pub", alias: "pub", active: true },
          { channel: "admin", alias: "ad", active: true },
        ];
        const mailTo = ["#1", "#2", "#3"];
        await dbojs.create({ id, flags: "player", data: { name: "ArrayTest", channels, mailTo, money: 100 }, location: u.me.id });

        await assert("arrays: channel array survives sibling modify", async () => {
          await dbojs.modify({ id }, "$set", { "data.description": "test" } as any);
          const obj = await dbojs.queryOne({ id });
          const ch = obj?.data?.channels as unknown[];
          if (!Array.isArray(ch)) return `not an array: ${typeof ch}`;
          if (ch.length !== 2) return `wrong length: ${ch.length}`;
          return true;
        });

        await assert("arrays: mailTo array survives sibling modify", async () => {
          const obj = await dbojs.queryOne({ id });
          const mt = obj?.data?.mailTo as string[];
          if (!Array.isArray(mt)) return `not an array: ${typeof mt}`;
          if (mt.length !== 3) return `wrong length: ${mt.length}`;
          if (mt[0] !== "#1" || mt[2] !== "#3") return `values wrong: ${mt}`;
          return true;
        });

        await assert("arrays: modify array directly", async () => {
          const obj = await dbojs.queryOne({ id });
          const ch = (obj?.data?.channels as any[]) || [];
          ch.push({ channel: "ooc", alias: "ooc", active: true });
          await dbojs.modify({ id }, "$set", { "data.channels": ch } as any);
          const obj2 = await dbojs.queryOne({ id });
          return (obj2?.data?.channels as any[])?.length === 3 ? true : "array not updated";
        });

        await assert("arrays: money survives array modify", async () => {
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.money === 100 ? true : `money wiped: ${obj?.data?.money}`;
        });

        await assert("arrays: empty array stores correctly", async () => {
          await dbojs.modify({ id }, "$set", { "data.channels": [] } as any);
          const obj = await dbojs.queryOne({ id });
          const ch = obj?.data?.channels as unknown[];
          return Array.isArray(ch) && ch.length === 0 ? true : "empty array failed";
        });

        await dbojs.delete({ id });
        await assert("arrays: cleanup", async () => !(await dbojs.queryOne({ id })) ? true : "still exists");
      }

      // ============================
      // 33. QUERY REGEX
      // ============================
      if (suite === "all" || suite === "queryregex") {
        const id1 = "qr1_" + ts, id2 = "qr2_" + ts;
        await dbojs.create({ id: id1, flags: "player connected", data: { name: "Alice_" + ts }, location: "1" });
        await dbojs.create({ id: id2, flags: "thing dark", data: { name: "Bob_" + ts }, location: "1" });

        await assert("queryregex: find by flag regex /player/i", async () => {
          const results = await dbojs.query({ id: id1, flags: /player/i });
          return results.length === 1 ? true : `found ${results.length}`;
        });

        await assert("queryregex: flag regex doesn't match wrong object", async () => {
          const results = await dbojs.query({ id: id2, flags: /player/i });
          return results.length === 0 ? true : `should be 0, got ${results.length}`;
        });

        await assert("queryregex: find by name regex", async () => {
          const results = await dbojs.query({ "data.name": new RegExp("Alice_" + ts, "i") });
          return results.length >= 1 ? true : "not found";
        });

        for (const x of [id1, id2]) await dbojs.delete({ id: x });
        await assert("queryregex: cleanup", async () => !(await dbojs.queryOne({ id: id1 })) ? true : "still exists");
      }

      // ============================
      // 34. QUERY MULTI
      // ============================
      if (suite === "all" || suite === "querymulti") {
        const prefix = "qm_" + ts + "_";
        for (let i = 0; i < 5; i++) {
          await dbojs.create({ id: prefix + i, flags: "thing testbatch", data: { name: `Multi${i}`, batch: ts }, location: u.me.id });
        }

        await assert("querymulti: find all 5 by flag", async () => {
          const results = await dbojs.query({ flags: /testbatch/i });
          return results.length === 5 ? true : `found ${results.length}`;
        });

        await assert("querymulti: each has correct data", async () => {
          const results = await dbojs.query({ flags: /testbatch/i });
          for (const r of results) {
            if (!r.data?.name?.toString().startsWith("Multi")) return `wrong name: ${r.data?.name}`;
          }
          return true;
        });

        for (let i = 0; i < 5; i++) await dbojs.delete({ id: prefix + i });
        await assert("querymulti: cleanup", async () => {
          const results = await dbojs.query({ flags: /testbatch/i });
          return results.length === 0 ? true : `${results.length} remain`;
        });
      }

      // ============================
      // 35. WHITESPACE
      // ============================
      if (suite === "all" || suite === "whitespace") {
        const id = "ws_" + ts;
        await dbojs.create({ id, flags: "thing", data: { name: "WSTest" }, location: u.me.id });

        await assert("whitespace: leading/trailing spaces preserved", async () => {
          await dbojs.modify({ id }, "$set", { "data.note": "  hello  " } as any);
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.note === "  hello  " ? true : `mangled: '${obj?.data?.note}'`;
        });

        await assert("whitespace: tab character preserved", async () => {
          await dbojs.modify({ id }, "$set", { "data.tab": "col1\tcol2" } as any);
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.tab === "col1\tcol2" ? true : "tab lost";
        });

        await assert("whitespace: newline preserved", async () => {
          await dbojs.modify({ id }, "$set", { "data.multi": "line1\nline2\nline3" } as any);
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.multi === "line1\nline2\nline3" ? true : "newlines lost";
        });

        await assert("whitespace: name survives", async () => {
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.name === "WSTest" ? true : "name wiped";
        });

        await dbojs.delete({ id });
        await assert("whitespace: cleanup", async () => !(await dbojs.queryOne({ id })) ? true : "still exists");
      }

      // ============================
      // 36. FULLPLAYER (end-to-end lifecycle)
      // ============================
      if (suite === "all" || suite === "fullplayer") {
        const id = "fp_" + ts;
        const roomId = "fproom_" + ts;
        await dbojs.create({ id: roomId, flags: "room", data: { name: "FP Room" } });

        // Step 1: Create player
        await dbojs.create({
          id, flags: "player connected",
          location: roomId,
          data: {
            name: "LifecyclePlayer",
            password: "hash_original",
            money: 500,
            quota: 20,
            home: roomId,
            alias: "lcp",
            channels: [{ channel: "pub", alias: "pub", active: true }],
          },
        });

        const fullCheck = async (label: string): Promise<true | string> => {
          const obj = await dbojs.queryOne({ id });
          if (!obj) return `${label}: not found`;
          if (obj.data?.money !== 500) return `${label}: money (${obj.data?.money})`;
          if (obj.data?.home !== roomId) return `${label}: home`;
          if (!Array.isArray(obj.data?.channels)) return `${label}: channels not array`;
          if ((obj.data.channels as any[]).length === 0) return `${label}: channels empty`;
          return true;
        };

        // Step 2: Login update
        await assert("fullplayer: login update", async () => {
          await dbojs.modify({ id }, "$set", { "data.lastLogin": ts, "data.failedAttempts": 0 } as any);
          const r = await fullCheck("after login");
          if (r !== true) return r;
          const obj = await dbojs.queryOne({ id });
          if (obj?.data?.password !== "hash_original") return "password wiped by login";
          if (obj?.data?.name !== "LifecyclePlayer") return "name wiped by login";
          return true;
        });

        // Step 3: Set description
        await assert("fullplayer: set description", async () => {
          await dbojs.modify({ id }, "$set", { "data.description": "A brave adventurer." } as any);
          const r = await fullCheck("after describe");
          if (r !== true) return r;
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.description === "A brave adventurer." ? true : "desc not set";
        });

        // Step 4: Set alias
        await assert("fullplayer: change alias", async () => {
          await dbojs.modify({ id }, "$set", { "data.alias": "lp" } as any);
          const r = await fullCheck("after alias");
          if (r !== true) return r;
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.alias === "lp" ? true : "alias not set";
        });

        // Step 5: Set custom attribute
        await assert("fullplayer: set attribute", async () => {
          const attrs = [{ name: "BIO", value: "Born in the north.", setter: id, type: "attribute" }];
          await dbojs.modify({ id }, "$set", { "data.attributes": attrs } as any);
          const r = await fullCheck("after attr");
          if (r !== true) return r;
          const obj = await dbojs.queryOne({ id });
          return (obj?.data?.attributes as any[])?.[0]?.value === "Born in the north." ? true : "attr not set";
        });

        // Step 6: Change password
        await assert("fullplayer: change password", async () => {
          await dbojs.modify({ id }, "$set", { "data.password": "hash_new" } as any);
          const r = await fullCheck("after password");
          if (r !== true) return r;
          const obj = await dbojs.queryOne({ id });
          if (obj?.data?.password !== "hash_new") return "password not updated";
          if (obj?.data?.name !== "LifecyclePlayer") return "name wiped by password change";
          if (obj?.data?.alias !== "lp") return "alias wiped by password change";
          return true;
        });

        // Step 7: Receive mail (add tempMail draft)
        await assert("fullplayer: mail draft", async () => {
          await dbojs.modify({ id }, "$set", { "data.tempMail": { to: ["#1"], subject: "Hi", message: "", date: ts } } as any);
          const r = await fullCheck("after mail");
          if (r !== true) return r;
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.tempMail ? true : "tempMail not set";
        });

        // Step 8: Clear mail draft
        await assert("fullplayer: clear draft", async () => {
          await dbojs.modify({ id }, "$unset", { "data.tempMail": 1 } as any);
          const r = await fullCheck("after clear mail");
          if (r !== true) return r;
          const obj = await dbojs.queryOne({ id });
          return obj?.data?.tempMail === undefined ? true : "tempMail not cleared";
        });

        // Step 9: Set doing
        await assert("fullplayer: set doing", async () => {
          await dbojs.modify({ id }, "$set", { "data.doing": "roleplaying" } as any);
          const r = await fullCheck("after doing");
          if (r !== true) return r;
          return true;
        });

        // Step 10: Move to another location
        await assert("fullplayer: teleport", async () => {
          await dbojs.modify({ id }, "$set", { location: "1" } as any);
          const obj = await dbojs.queryOne({ id });
          if (obj?.location !== "1") return "location not changed";
          // Verify data survives
          if (obj?.data?.password !== "hash_new") return "password wiped by teleport";
          if (obj?.data?.money !== 500) return "money wiped by teleport";
          return true;
        });

        // Step 11: Second login (simulate reconnect)
        await assert("fullplayer: second login", async () => {
          await dbojs.modify({ id }, "$set", { "data.lastLogin": ts + 5000, "data.failedAttempts": 0 } as any);
          const obj = await dbojs.queryOne({ id });
          if (!obj) return "not found";
          if (obj.data?.password !== "hash_new") return "password wiped by 2nd login";
          if (obj.data?.name !== "LifecyclePlayer") return "name wiped by 2nd login";
          if (obj.data?.money !== 500) return "money wiped by 2nd login";
          if (obj.data?.alias !== "lp") return "alias wiped by 2nd login";
          if (obj.data?.description !== "A brave adventurer.") return "desc wiped by 2nd login";
          if (!(obj.data?.attributes as any[])?.length) return "attrs wiped by 2nd login";
          if (!(obj.data?.channels as any[])?.length) return "channels wiped by 2nd login";
          return true;
        });

        // Final: verify EVERYTHING one more time
        await assert("fullplayer: final integrity check", async () => {
          const obj = await dbojs.queryOne({ id });
          if (!obj) return "not found";
          const checks: [string, unknown, unknown][] = [
            ["name", obj.data?.name, "LifecyclePlayer"],
            ["password", obj.data?.password, "hash_new"],
            ["money", obj.data?.money, 500],
            ["quota", obj.data?.quota, 20],
            ["home", obj.data?.home, roomId],
            ["alias", obj.data?.alias, "lp"],
            ["description", obj.data?.description, "A brave adventurer."],
            ["doing", obj.data?.doing, "roleplaying"],
          ];
          for (const [field, actual, expected] of checks) {
            if (actual !== expected) return `${field}: expected ${expected}, got ${actual}`;
          }
          if (!(obj.data?.attributes as any[])?.length) return "attributes missing";
          if (!(obj.data?.channels as any[])?.length) return "channels missing";
          return true;
        });

        for (const x of [id, roomId]) await dbojs.delete({ id: x });
        await assert("fullplayer: cleanup", async () => !(await dbojs.queryOne({ id })) ? true : "still exists");
      }

      // ============================
      // REPORT
      // ============================
      const passed = results.filter(r => r.pass).length;
      const failed = results.filter(r => !r.pass).length;

      send([socketId], "\n%ch--- @test results ---%cn");
      for (const r of results) {
        const icon = r.pass ? "%cg[PASS]%cn" : "%cr[FAIL]%cn";
        send([socketId], `  ${icon} ${r.name}${r.detail ? " -- " + r.detail : ""}`);
      }
      send([socketId], `\n%ch${passed} passed, ${failed} failed%cn`);
      if (failed === 0) {
        send([socketId], "%cgAll tests passed.%cn");
      }
    },
  });
