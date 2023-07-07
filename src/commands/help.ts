import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { addCmd, cmds } from "../services/commands";
import { dbojs } from "../services/Database";
import { flags } from "../services/flags/flags";
import parser from "../services/parser/parser";
import { center, columns, repeatString } from "../utils/format";
import { send } from "../services/broadcast";

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

  console.log(text);

  addCmd({
    name: "help",
    pattern: /^[/+@]?help$/i,
    hidden: true,
    exec: async (ctx) => {
      const player = await dbojs.findOne({ id: ctx.socket.cid });
      const flgs = player?.flags || "";
      let commands: any = [];
      text.forEach(
        (_, key) =>
          key.match(/^topic_/) && commands.push(key.replace(/^topic_/, ""))
      );

      commands = [
        ...commands,
        ...cmds
          .filter((cmd) => !cmd.hidden)
          .filter((cmd) => flags.check(flgs, cmd.lock || ""))
          .map((cmd) =>
            text.has(`help_${cmd.name}`) ? cmd.name : `%cr${cmd.name}*%cn`
          ),
      ].sort((a, b) =>
        parser
          .stripSubs("telnet", a)
          .localeCompare(parser.stripSubs("telnet", b))
      );

      let output = center("%cy[%cn %chHelp%cn %cy]%cn", 78, "%cr=%cn") + "\n";
      output += columns(commands, 78, 4, " ") + "\n\n";
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
