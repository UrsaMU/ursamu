#!/usr/bin/env ts-node
import { Command } from "commander";
import { resolve } from "path";
import { startAll } from "./scripts/startup";
import { stopAll } from "./scripts/shutdown";
import { restartAll } from "./scripts/restart";

const program = new Command();

program
  .option("-d, --dir <path>", "Specify the directory")
  .option("-s, --stop", "Stop the server")
  .option("-r, --restart", "Restart the server")
  .action((options) => {
    let directoryPath = "";

    if (options.stop) {
      console.log("Stopping server...");
      stopAll();
      return;
    }

    if (options.restart) {
      console.log("Restarting server...");
      restartAll();
      return;
    }

    if (options.dir) {
      directoryPath = resolve(process.cwd(), options.dir);
    }

    startAll(directoryPath);
  });

program.parse(process.argv);
