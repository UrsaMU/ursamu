import { hash } from "../../deps.ts";
import { dbojs } from "../services/Database/index.ts";
import { send } from "../services/broadcast/index.ts";
import { addCmd, force } from "../services/commands/index.ts";
import { setConfig } from "../services/Config/mod.ts";
import { wsService } from "../services/WebSocket/index.ts";
import { displayName } from "../utils/displayName.ts";
import { target } from "../utils/target.ts";

export default () => {
  addCmd({
    name: "@boot",
    pattern: /^@boot\s+(.*)/i,
    lock: "connected admin+",
    help: "Disconnect a player",
    category: "admin",
    exec: async (ctx, args) => {
        if (!ctx.socket.cid) return;
        const en = await dbojs.queryOne({ id: ctx.socket.cid });
        if (!en) return;
        
        const tar = await target(en, args[0]);
        if (!tar) {
             return send([ctx.socket.id], "Player not found.");
        }
        
        if (!tar.flags.includes("player")) {
            return send([ctx.socket.id], "You can only boot players.");
        }
        
        if (tar.flags.includes("superuser")) {
             return send([ctx.socket.id], "You cannot boot a superuser.");
        }

        await send([tar.id], "You are being booted from the server.");
        wsService.disconnect(tar.id);
        send([ctx.socket.id], `You booted ${displayName(en, tar)}.`);
    }
  });

  addCmd({
      name: "@toad",
      pattern: /^@toad\s+(.*)/i,
      lock: "connected admin+",
      help: "Destroy a player",
      category: "admin",
      exec: async (ctx, args) => {
          if (!ctx.socket.cid) return;
          const en = await dbojs.queryOne({ id: ctx.socket.cid });
          if (!en) return;

          const tar = await target(en, args[0]);
          if (!tar || !tar.flags.includes("player")) {
              return send([ctx.socket.id], "Player not found.");
          }

          if (tar.flags.includes("superuser")) {
               return send([ctx.socket.id], "You cannot toad a superuser.");
          }
          
           // Send them away first
          await send([tar.id], "You have been toaded.");
          wsService.disconnect(tar.id);
          
          await force(ctx, `@destroy ${tar.id}`);
          send([ctx.socket.id], `You toaded ${tar.data?.name}.`);
      }
  });
  
  addCmd({
      name: "@newpassword",
      pattern: /^@newpass(?:word)?\s+(.*)\s*=\s*(.*)/i,
      lock: "connected admin+",
      help: "Change a player's password",
      category: "admin",
      exec: async (ctx, args) => {
          if (!ctx.socket.cid) return;
          const en = await dbojs.queryOne({ id: ctx.socket.cid });
          if (!en) return;
          
          const [name, pass] = args;
          const tar = await target(en, name);
          
          if (!tar || !tar.flags.includes("player")) {
              return send([ctx.socket.id], "Player not found.");
          }
          
          // Check permissions (Wizard can set anyone's pass, optional check for superuser target?)
          
          tar.data ||= {};
          tar.data.password = await hash(pass, 10);
          await dbojs.modify({ id: tar.id }, "$set", tar);
          
          send([ctx.socket.id], `Password for ${displayName(en, tar)} changed.`);
          send([tar.id], `Your password has been changed by ${displayName(en, en)}.`);
      }
  });
  
  addCmd({
      name: "@chown",
      pattern: /^@chown\s+(.*)\s*=\s*(.*)/i,
      lock: "connected admin+",
      help: "Change ownership of an object",
      category: "admin",
      exec: async (ctx, args) => {
          if (!ctx.socket.cid) return;
          const en = await dbojs.queryOne({ id: ctx.socket.cid });
          if (!en) return;
          
          const [thingName, newOwnerName] = args;
          const thing = await target(en, thingName);
          const newOwner = await target(en, newOwnerName);
          
          if (!thing) return send([ctx.socket.id], "Object not found.");
          if (!newOwner || !newOwner.flags.includes("player")) return send([ctx.socket.id], "New owner not found.");
          
          thing.data ||= {};
          thing.data.owner = newOwner.id;
          await dbojs.modify({ id: thing.id }, "$set", thing);
          
          send([ctx.socket.id], `Owner of ${displayName(en, thing)} changed to ${displayName(en, newOwner)}.`);
      }
  });

  addCmd({
      name: "@site",
      pattern: /^@site\s+(.*)\s*=\s*(.*)/i,
      lock: "connected admin+",
      help: "Set site configuration",
      category: "admin",
      exec: async (ctx, args) => {
          const [setting, value] = args;
          setConfig(setting, value);
          await send([ctx.socket.id], `Config ${setting} set to ${value}.`);
      }
  });
};
