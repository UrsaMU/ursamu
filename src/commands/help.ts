import { addCmd, cmds } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { flags } from "../services/flags/flags.ts";
import parser from "../services/parser/parser.ts";
import { center, columns, repeatString } from "../utils/format.ts";
import { send } from "../services/broadcast/index.ts";
import { txtFiles } from "../services/commands/index.ts";
import { extract } from "../../deps.ts";
import { gameConfig } from "../config.ts";
export default async () => {
  addCmd({
    name: "help",
    pattern: /^[/+@]?help$/i,
    hidden: true,
    exec: async (ctx) => {
      const player = await dbojs.queryOne({ id: ctx.socket.cid });
      const flgs = player?.flags || "";

      let cats: Set<string> = new Set();
      let commands: any = [];
      let localCmds = [...cmds];
      commands = localCmds
        .filter((cmd) => !cmd.hidden)
        .filter((cmd) => flags.check(flgs, cmd.lock || ""))
        .map((cmd) => {
          let name = "";
          if (
            txtFiles.has(`help_${cmd.name}.md`) ||
            txtFiles.has(`help_${cmd.name}.txt`)
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
        });

      const topics = Array.from(txtFiles.keys()).filter((key) =>
        key.startsWith("topic_")
      );

      // check topics for frontmatter
      for (const topic of topics) {
        const name = topic.replace("topic_", "").replace(/\.md|\.txt/, "")
          .toUpperCase();
        const content = txtFiles.get(topic) || "";
        try {
          const fm = extract(content);
          if (fm.attrs?.hidden) {
            continue;
          }
          if (fm.attrs?.category) {
            cats.add(fm.attrs.category as string);
          } else {
            cats.add("General");
          }
          commands.push({
            name,
            category: fm.attrs?.category || "General",
          });
        } catch {
          commands.push({
            name,
            category: "General",
          });
        }
      }

      commands = commands.sort((a: any, b: any) =>
        parser
          .stripSubs("telnet", a.name.toLowerCase())
          .localeCompare(parser.stripSubs("telnet", b.name.toLowerCase()))
      );
      let output = center(
        `%cy[%cn %ch%cc${
          gameConfig.game?.name ? gameConfig.game.name + " " : ""
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
      const topic = args[0];
      if (
        txtFiles.has(`help_${topic}.md`) || txtFiles.has(`help_${topic}.txt`)
      ) {
        let output = center(
          `%cy[%cn %ch${topic.toUpperCase()}%cn %cy]%cn`,
          78,
          "%cr=%cn",
        ) + "\n";
        let helpFile = "";

        try {
          const data = extract(txtFiles.get(`help_${topic}.md`) || "");
          helpFile = data.body;
        } catch {
          helpFile = txtFiles.get(`help_${topic}.md`) ||
            txtFiles.get(`help_${topic}.txt`) || "";
        }

        output += parser.substitute("markdown", helpFile || "");
        output += repeatString("%cr=%cn", 78);
        send([ctx.socket.id], output, {});
        return;
      } else if (
        txtFiles.has(`topic_${topic}.md`) || txtFiles.has(`topic_${topic}.txt`)
      ) {
        let output = center(
          `%cy[%cn %ch${topic.toUpperCase()}%cn %cy]%cn`,
          78,
          "%cr=%cn",
        ) + "\n";

        let helpFile = "";

        try {
          const data = extract(txtFiles.get(`topic_${topic}.md`) || "");
          helpFile = data.body;
        } catch {
          helpFile = txtFiles.get(`topic_${topic}.md`) ||
            txtFiles.get(`topic_${topic}.txt`) || "";
        }

        output += parser.substitute("markdown", helpFile || "");
        output += repeatString("%cr=%cn", 78);
        send([ctx.socket.id], output, {});
        return;
      } else {
        send([ctx.socket.id], `No help available for '${topic}'.`, {});
        return;
      }
    },
  });
};
