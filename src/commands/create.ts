import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { getConfig } from "../services/Config/mod.ts";
import { getNextId } from "../utils/getNextId.ts";
import { moniker } from "../utils/moniker.ts";
import { isNameTaken } from "../utils/isNameTaken.ts";
import type { IDBOBJ } from "../@types/IDBObj.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

export default () =>
  addCmd({
    name: "create",
    pattern: /^(?:create|cr)\s+(.*)/i,
    exec: async (u: IUrsamuSDK) => {
      let name = "";
      let password = "";
      const pieces = u.cmd.args[0].split(" ");
      if (pieces.length >= 2) {
        password = pieces.pop() || "";
        name = pieces.join(" ");
      } else {
        [name] = pieces;
      }
      name = name.trim();

      if (!name || !password) {
        u.send("You must provide both a name and password.");
        return;
      }

      const nameExists = await isNameTaken(name);
      if (nameExists) {
        u.send("That name is already taken or unavailable.");
        return;
      }

      // Grant superuser to the first character created when no superusers exist yet.
      const superusers = await dbojs.query({ flags: /superuser/i });
      const flags =
        superusers.length > 0 ? "player connected" : "player connected superuser";
      const id = await getNextId("objid");

      const startRoom = await dbojs.queryOne({
        id: String(getConfig<string | number>("game.playerStart") || ""),
      });
      if (!startRoom) {
        u.send("Error: Starting room not found!");
        return;
      }

      const newPlayer: IDBOBJ = {
        id,
        flags,
        location: startRoom.id,
        data: {
          name,
          home: startRoom.id,
          password: await u.auth.hash(password),
          money: 100,
          quota: 20,
        },
      };
      await dbojs.create(newPlayer);
      const player = await dbojs.queryOne({ id });
      if (!player) {
        u.send("Unable to create player!");
        return;
      }

      // Login the player (sets socket.cid and joins rooms)
      await u.auth.login(player.id);

      await u.send(
        `Welcome to ${getConfig<string>("game.name")}!`,
        u.socketId,
        { cid: player.id }
      );

      // Send connection message to everyone in the room
      if (player.location) {
        u.send(`${moniker(player)} has connected.`, `#${player.location}`);
      }

      await u.force("look");
    },
  });
