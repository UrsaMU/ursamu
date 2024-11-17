import { addCmd, cmds } from "../services/commands";
import { dbojs } from "../services/Database";
import { flags } from "../services/flags/flags";
import parser from "../services/parser/parser";
import { center, columns, repeatString } from "../utils/format";
import { send } from "../services/broadcast";
import cfg from "../ursamu.config";
import { txtFiles } from "../services/text";

export default async () => {
  addCmd({
    name: "help",
    pattern: /^[/+@]?help$/i,
    hidden: true,
    exec: async (ctx) => {
      const player = await dbojs.findOne({ id: ctx.socket.cid });
      const flgs = player?.flags || "";

      let cats: Set<string> = new Set();
      let commands: any = [];
      let localCmds = [...cmds];
      commands = localCmds
        .filter((cmd) => !cmd.hidden)
        .filter((cmd) => flags.check(flgs, cmd.lock || ""))
        .map((cmd) => {
          let name = "";
          // Check if help exists in txtFiles
          if (
            Array.from(txtFiles.keys()).some((key) =>
              key.startsWith(`help_${cmd.name}`)
            )
          ) {
            name = cmd.name.toUpperCase();
          } else {
            name = `%cr${cmd.name.toUpperCase()}*%cn`;
          }

          if (cmd.category) {
            cats.add(cmd.category);
          } else {
            cats.add("General");
            cmd.category = "General";
          }

          return { name, category: cmd.category };
        })
        .sort((a, b) =>
          parser
            .stripSubs("telnet", a.name.toLowerCase())
            .localeCompare(parser.stripSubs("telnet", b.name.toLowerCase()))
        );

      let output = center(
        `%cy[%cn %ch%cc${
          cfg.config.game?.name ? cfg.config.game.name + " " : ""
        }%cn%chHelp%cn System %cy]%cn`,
        78,
        "%cr=%cn",
      ) + "\n";

      for (const cat of Array.from(cats).sort((a, b) => a.localeCompare(b))) {
        output +=
          center(`%cy[%cn %ch${cat.toUpperCase()}%cn %cy]%cn`, 78, "%cr-%cn") +
          "\n";
        output += columns(
          commands
            .filter((c: any) => {
              if (c.category?.toLowerCase() === cat?.toLowerCase()) {
                return true;
              }
            })
            .map((c: any) => c.name),
          78,
          4,
          " ",
        ) + "\n\n";
      }

      output +=
        "Type '%chhelp <command>%cn' for more information on a command.\n";
      output += repeatString("%cr=%cn", 78);
      await send([ctx.socket.id], output, {});
      localCmds = [];
    },
  });

  addCmd({
    name: "help/topic",
    pattern: /^[/+@]?help\s+(.*)/i,
    hidden: true,
    exec: async (ctx, args) => {
      const topic = args[0].toLowerCase().replace(/^[+/]/g, "");

      // Function to find help file
      const findHelpFile = (searchTopic: string) => {
        // Try exact match first
        let helpKey = Array.from(txtFiles.keys()).find((key) =>
          key.toLowerCase() === `help_${searchTopic}.md` ||
          key.toLowerCase() === `topic_${searchTopic}.md`
        );

        // If no exact match, try partial matches
        if (!helpKey) {
          helpKey = Array.from(txtFiles.keys()).find((key) =>
            key.toLowerCase().includes(`help_${searchTopic}`) ||
            key.toLowerCase().includes(`topic_${searchTopic}`)
          );
        }

        return helpKey;
      };

      // Try different variations of the topic
      const variations = [
        topic, // Original topic
        topic.replace("/", "_"), // Replace slash with underscore
        topic.split("/")[0], // First part before slash
        topic.split("/")[1], // Second part after slash
      ];

      let helpKey;
      for (const variation of variations) {
        helpKey = findHelpFile(variation);
        if (helpKey) break;
      }

      if (helpKey) {
        const content = txtFiles.get(helpKey);
        let output = center(
          `%cy[%cn %ch${topic.toUpperCase()}%cn %cy]%cn`,
          78,
          "%cr-%cn",
        ) + "\n";
        output += content || "";
        output += repeatString("%cr-%cn", 78);
        send([ctx.socket.id], output, {});
        return;
      } else {
        send([ctx.socket.id], `No help available for '${topic}'.`, {});
        return;
      }
    },
  });
};
