import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { addCmd, cmds } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { flags } from "../services/flags/flags.ts";
import parser from "../services/parser/parser.ts";
import { center, columns, ljust, repeatString } from "../utils/format.ts";
import { send } from "../services/broadcast/index.ts";
import { gameConfig } from "../main.ts";
import { ICmd, IHelp } from "../@types/index.ts";

const __dirname = path.dirname(path.fromFileUrl(import.meta.url))
export default async () => {
  const text = new Map<string, string>();
  const dirent = await readdir(join(__dirname, "../../help"), {
    withFileTypes: true,
  });

  const files = dirent.filter(
    (dirent) => dirent.isFile() && dirent.name.endsWith(".md")
  );

  for (const file of files) {
    const textFile = await readFile(
      join(__dirname, `../../help/${file.name}`),
      "utf8"
    );
    text.set(`${file.name.replace(".md", "").replace(".txt", "")}`, textFile);
  }

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
          if (text.has(`help_${cmd.name}`)) {
            name = cmd.name.toUpperCase();
          } else {
            name = `%cr${cmd.name.toUpperCase()}*%cn`;
            // cmd.name = cmd.name.toUpperCase();
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

      let output =
        center(
          `%cy[%cn %ch%cc${
            gameConfig.game?.name ? gameConfig.game.name + " " : ""
          }%cn%chHelp%cn System %cy]%cn`,
          78,
          "%cr=%cn"
        ) + "\n";

      for (const cat of Array.from(cats).sort((a, b) => a.localeCompare(b))) {
        output +=
          center(`%cy[%cn %ch${cat.toUpperCase()}%cn %cy]%cn`, 78, "%cr-%cn") +
          "\n";
        output +=
          columns(
            commands
              .filter((c: any) => {
                if (c.category?.toLowerCase() === cat?.toLowerCase()) {
                  return true;
                }
              })
              .map((c: any) => c.name),
            78,
            4,
            " "
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
      if (text.has(`help_${topic}`)) {
        let output =
          center(
            `%cy[%cn %ch${topic.toUpperCase()}%cn %cy]%cn`,
            78,
            "%cr-%cn"
          ) + "\n";
        output += text.get(`help_${topic}`) || "";
        output += repeatString("%cr-%cn", 78);
        send([ctx.socket.id], output, {});
        return;
      } else if (text.has(`topic_${topic}`)) {
        let output =
          center(
            `%cy[%cn %ch${topic.toUpperCase()}%cn %cy]%cn`,
            78,
            "%cr-%cn"
          ) + "\n";
        output += text.get(`topic_${topic}`) || "";
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
