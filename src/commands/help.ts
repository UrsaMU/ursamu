import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { addCmd, cmds } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { flags } from "../services/flags/flags.ts";
import parser from "../services/parser/parser.ts";
import { center, columns, repeatString } from "../utils/format.ts";
import { send } from "../services/broadcast/index.ts";
import { getConfig } from "../services/Config/mod.ts";
import { dpath } from "../../deps.ts";

const __dirname = import.meta.url.startsWith("file://") ? dpath.dirname(dpath.fromFileUrl(import.meta.url)) : Deno.cwd();

export default async () => {
  const text = new Map<string, string>();
  
  try {
    const helpDir = import.meta.url.startsWith("file://") ? join(__dirname, "../../help") : join(Deno.cwd(), "help");
    
    // Only proceed if directory exists
    try {
       await Deno.stat(helpDir);
    } catch {
       return; // No help dir, skip loading
    }

    const dirent = await readdir(helpDir, {
      withFileTypes: true,
    });

    const files = dirent.filter(
      (dirent) => dirent.isFile() && dirent.name.endsWith(".md")
    );

    for (const file of files) {
      const textFile = await readFile(
        join(helpDir, file.name),
        "utf8"
      );
      text.set(`${file.name.replace(".md", "").replace(".txt", "")}`, textFile);
    }
  } catch (e) {
    console.warn("Could not load help files:", e);
  }

  addCmd({
    name: "help",
    pattern: /^[/+@]?help$/i,
    hidden: true,
    exec: async (ctx) => {
      const player = ctx.socket.cid ? await dbojs.queryOne({ id: ctx.socket.cid }) : null;
      const flgs = player ? player.flags || "" : "";

      const cats: Set<string> = new Set();
      let commands: { name: string; category: string }[] = [];
      const localCmds = [...cmds];
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
            getConfig<string>('game.name') ? getConfig<string>('game.name') + " " : ""
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
              .filter((c) => {
                if (c.category?.toLowerCase() === cat?.toLowerCase()) {
                  return true;
                }
              })
              .map((c) => c.name),
            78,
            4,
            " "
          ) + "\n\n";
      }

      const topics = Array.from(text.keys())
        .filter((k) => k.startsWith("topic_"))
        .map((k) => k.replace("topic_", "").toUpperCase())
        .sort();

      if (topics.length > 0) {
        output +=
          center(`%cy[%cn %chTOPICS%cn %cy]%cn`, 78, "%cr-%cn") + "\n";
        output += columns(topics, 78, 4, " ") + "\n\n";
      }

      output +=
        "Type '%chhelp <command>%cn' for more information on a command.\n";
      output += repeatString("%cr=%cn", 78);
      await send([ctx.socket.id], output, {});
    },
  });

  addCmd({
    name: "help/topic",
    pattern: /^[/+@]?help\s+(.*)/i,
    hidden: true,
    exec: (ctx, args) => {
      const topic = args[0].toLowerCase();

      if (topic === "topics" || topic === "all") {
        const topics = Array.from(text.keys())
          .filter((k) => k.startsWith("topic_"))
          .map((k) => k.replace("topic_", "").toUpperCase())
          .sort();

        let output = center(`%cy[%cn %chTOPICS%cn %cy]%cn`, 78, "%cr-%cn") + "\n";
        output += columns(topics, 78, 4, " ") + "\n";
        output += repeatString("%cr-%cn", 78);
        send([ctx.socket.id], output, {});
        return;
      }

      // Try exact match first
      let helpKey = `help_${topic}`;
      if (!text.has(helpKey)) {
        // Try adding @ if missing
        helpKey = `help_@${topic}`;
        if (!text.has(helpKey)) {
           // Try topic
           helpKey = `topic_${topic}`;
        }
      }

      if (text.has(helpKey)) {
        const title = helpKey.startsWith("topic_") ? topic : (helpKey.replace("help_", ""));
         let output =
          center(
            `%cy[%cn %ch${title.toUpperCase()}%cn %cy]%cn`,
            78,
            "%cr-%cn"
          ) + "\n";
        output += text.get(helpKey) || "";
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
