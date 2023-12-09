import { execSync } from "node:child_process";
import { addCmd, force } from "../services/commands/index.ts";
import { send } from "../services/broadcast/index.ts";

export default () => {
  addCmd({
    name: "upgrade",
    pattern: /^[@\+]?upgrade$/i,
    lock: "connected admin+",
    hidden: true,
    exec: async (ctx) => {
      await send([ctx.socket.id], "Upgrading server, please wait...");
      execSync("git pull");
      execSync("npm install");
      execSync("npm run build");
      await send([ctx.socket.id], "Server upgraded, restarting...");
      await force(ctx, "@restart");
    },
  });
};
