import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { addCmd, cmds } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { flags } from "../services/flags/flags.ts";
import parser from "../services/parser/parser.ts";
import { center, columns, ljust, repeatString } from "../utils/format.ts";
import { send } from "../services/broadcast/index.ts";
import { getConfig } from "../services/Config/mod.ts";
import { ICmd, IHelp } from "../@types/index.ts";
import { dpath } from "../../deps.ts";

const __dirname = dpath.dirname(dpath.fromFileUrl(import.meta.url))
export default async () => {
  addCmd({
    name: "help",
    pattern: /^[/+@]?help$/i,
    hidden: true,
    exec: async (ctx) => {
      const player = ctx.socket.cid ? await dbojs.queryOne({ id: ctx.socket.cid }) : null;
      const flgs = player ? player.flags || "" : "";

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
            name = cmd.name.toUpperCase().trim();
          } else {
            name = `%cr${cmd.name.toUpperCase().trim()}%cn`;
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
            getConfig<any>('game.name') ? getConfig<any>('game.name') + " " : ""
          }%cn%chHelp%cn System %cy]%cn`,
          78,
          "%cr=%cn"
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
      output += "Type '%chhelp <topic>%cn' to read about a specific topic.\n";
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

      // Function to find related help files
      const findRelatedFiles = (currentTopic: string): string[] => {
        const relatedFiles: string[] = [];
        const currentTopicName = currentTopic.replace(/^(help_|topic_)/, "")
          .replace(".md", "");
        const words = currentTopicName.toLowerCase().split(/[_\s-]/);

        Array.from(txtFiles.keys()).forEach((key) => {
          // Skip the current topic
          if (key.toLowerCase() === currentTopic.toLowerCase()) return;

          // Skip hidden files unless user is a wizard
          const fileData = txtFiles.get(key);
          if (fileData?.hidden) return;

          const fileName = key.replace(/^(help_|topic_)/, "").replace(
            ".md",
            "",
          );
          const fileWords = fileName.toLowerCase().split(/[_\s-]/);

          // Check if any words match
          const hasMatch = words.some((word) =>
            fileWords.some((fileWord) =>
              fileWord.includes(word) || word.includes(fileWord)
            )
          );

          if (hasMatch) {
            relatedFiles.push(fileName.toUpperCase());
          }
        });

        return relatedFiles;
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
        const helpData = txtFiles.get(helpKey);

        // Check if the help file is hidden and if the user has permission to see it
        if (helpData?.hidden) {
          const player = await dbojs.findOne({ id: ctx.socket.cid });
          if (!player || !flags.check(player.flags || "", "Wizard")) {
            send([ctx.socket.id], `No help available for '${topic}'.`, {});
            return;
          }
        }

        let output = center(
          `%cy[%cn %ch${topic.toUpperCase()}%cn %cy]%cn`,
          78,
          "%cr-%cn",
        ) + "\n";

        output += helpData?.content + "\n\n";

        // Add related topics
        const relatedFiles = findRelatedFiles(helpKey);
        if (relatedFiles.length > 0) {
          output += "%ch%cyRelated Topics:%cn\n";
          output += relatedFiles.join(", ") + "\n";
        }

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
