import { addCmd } from "../services/commands/index.ts";
import { help } from "../../system/scripts/help.ts";

addCmd({
  name: "help",
  pattern: /^[/+@]?help\s*(.*)/i,
  hidden: true,
  exec: async (ctx, args) => {
    await help(ctx.socket, args);
  },
});