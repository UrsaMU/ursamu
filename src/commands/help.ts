import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { addCmd, cmds } from "../services/commands";
import { dbojs } from "../services/Database";
import { flags } from "../services/flags/flags";
import parser from "../services/parser/parser";
import { center, columns, ljust, repeatString } from "../utils/format";
import { send } from "../services/broadcast";
import { gameConfig } from "../main";

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
      text.forEach(
        (_, key) =>
          key.match(/^topic_/) && commands.push(key.replace(/^topic_/, ""))
      );

      cmds.forEach((cmd) => {
        if (cmd.category) {
          cats.add(cmd.category);
        }
      });

      const catagories = Array.from(
        [...cats].sort((a, b) => a.localeCompare(b))
      );

      commands = [
        ...commands,
        ...cmds
          .filter((cmd) => !cmd.hidden)
          .filter((cmd) => flags.check(flgs, cmd.lock || ""))
          .map(
            (cmd) =>
              ljust(
                text.has(`help_${cmd.name}`)
                  ? cmd.name.toUpperCase()
                  : `%cr${cmd.name.toUpperCase()}*%cn`,
                15,
                "%ch%cx.%cn"
              ) +
              " " +
              // if the stirng is longer than 20 chars, we need to cut it off.
              ljust(
                (cmd.help?.length || 0) <= 20
                  ? cmd.help
                  : cmd.help?.substring(0, 17) + "...",
                20,
                "%ch%cx.%cn"
              )
          ),
      ].sort((a, b) =>
        parser
          .stripSubs("telnet", a)
          .localeCompare(parser.stripSubs("telnet", b))
      );

      let output =
        center(
          `%cy[%cn %ch%cc${
            gameConfig.game?.name ? gameConfig.game.name + " " : ""
          }%cn%chHelp%cn System %cy]%cn`,
          78,
          "%cr=%cn"
        ) + "\n";
      for (const cat of catagories) {
        output +=
          center(`%cy[%cn %ch${cat.toUpperCase()}%cn %cy]%cn`, 78, "%cr-%cn") +
          "\n";
        output +=
          columns(
            commands.filter(
              (c: any) => c.category?.toLowerCase() === cat?.toLowerCase()
            ),
            78,
            2,
            " "
          ) + "\n\n";
      }

      const leftovers = commands.filter((c: any) => !c.category);
      if (leftovers.length) {
        output += center("%cy[%cn %chGENERAL%cn %cy]%cn", 78, "%cr-%cn");
        output += columns(leftovers, 78, 2, " ") + "\n\n";
      }
      output +=
        "Type '%chhelp <command>%cn' for more information on a command.\n";
      output += repeatString("%cr=%cn", 78);
      send([ctx.socket.id], output, {});
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
