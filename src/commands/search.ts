import { dbojs } from "../services/Database/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { center, columns } from "../utils/format.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

export default () => {
  addCmd({
    name: "@search",
    pattern: /^@search\s+(.*)/i,
    lock: "connected & builder+",
    help: "Search for objects",
    category: "admin",
    exec: async (u: IUrsamuSDK) => {
      const query = u.cmd.args[0];
      const parts = query.split("=");
      let search = {};

      if (parts.length > 1) {
        const [key, val] = parts;
        if (key.trim() === "name") {
          search = { "data.name": new RegExp(val.trim(), "i") };
        } else if (key.trim() === "flag" || key.trim() === "flags") {
          search = { flags: new RegExp(val.trim(), "i") };
        } else if (key.trim() === "owner") {
          const ownerObj = await dbojs.queryOne({
            "data.name": new RegExp(`^${val.trim()}$`, "i"),
            flags: /player/i,
          });
          if (ownerObj) {
            search = { "data.owner": ownerObj.id };
          } else {
            return u.send("Owner not found.");
          }
        } else {
          return u.send("Invalid search parameter. Use name=..., flags=..., or owner=...");
        }
      } else {
        search = { "data.name": new RegExp(query.trim(), "i") };
      }

      const results = await dbojs.query(search);
      if (!results.length) return u.send("No matches found.");

      const list = results.map((r) => `${r.data?.name}(#${r.id})`);
      u.send(center(" Search Results ", 78, "="));
      u.send(columns(list, 80, 4));
      u.send(center("", 78, "="));
    },
  });

  addCmd({
    name: "@stats",
    pattern: /^@stats$/i,
    lock: "connected",
    help: "Show server statistics",
    category: "info",
    exec: async (u: IUrsamuSDK) => {
      const total = (await dbojs.all()).length;
      const players = (await dbojs.query({ flags: /player/i })).length;
      const rooms = (await dbojs.query({ flags: /room/i })).length;
      const exits = (await dbojs.query({ flags: /exit/i })).length;
      const calcThings = total - players - rooms - exits;

      u.send(center(" Server Statistics ", 78, "="));
      u.send(`Total Objects: ${total}`);
      u.send(`Rooms: ${rooms}`);
      u.send(`Exits: ${exits}`);
      u.send(`Things: ${calcThings}`);
      u.send(`Players: ${players}`);
      u.send(center("", 78, "="));
    },
  });
};
