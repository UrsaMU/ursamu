import { send } from "../services/broadcast";
import { addCmd } from "../services/commands";
import { dbojs } from "../services/Database";
import parser from "../services/parser/parser";
import { target } from "../utils/target";

export default () =>
  addCmd({
    name: "moniker",
    pattern: /^[@\+]?moniker\s+(.*)\s*=\s*(.*)/i,
    lock: "connected admin+",
    exec: async (ctx, args) => {
      const player = await dbojs.findOne({ id: ctx.socket.cid });
      if (!player) return;
      const tar = await target(player, args[0]);
      if (!tar) {
        send([`#${player.location}`], "I can't find that player.", {});
        return;
      }
      const stripped = parser.stripSubs("telnet", args[1]);
      tar.data ||= {};
      if (stripped.toLowerCase() != tar.data.name?.toLowerCase()) {
        send(
          [`#${player.id}`],
          "You can't change someone's moniker to something that doesn't match their name.",
          {}
        );
        return;
      }
      tar.data.moniker = args[1];
      await dbojs.update({ id: tar.id }, tar);
      send(
        [ctx.socket.id],
        `You have set ${tar.data.name}'s moniker to ${args[1]}.`,
        {}
      );
    },
  });
