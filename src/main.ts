import path from "path";
import { UrsaMU } from "./app";
import { loadDir } from "./utils/loadDIr";
import { loadTxtDir } from "./utils/loadTxtDir";
import { dbojs } from "./services/Database";
import { setFlags } from "./utils/setFlags";
import { broadcast } from "./services/broadcast";
import { lstatSync } from "fs";

loadDir(path.join(__dirname, "./commands"));
loadTxtDir(path.join(__dirname, "../text"));

// load custom data.
try {
  if (lstatSync(path.join(__dirname, "../data/text")).isDirectory()) {
    loadTxtDir(path.join(__dirname, "../data/text"));
  }
} catch {}

try {
  if (lstatSync(path.join(__dirname, "../data/commands")).isDirectory()) {
    loadDir(path.join(__dirname, "../data/commands"));
  }
} catch {}

try {
  if (lstatSync(path.join(__dirname, "../data/plugins")).isDirectory()) {
    loadDir(path.join(__dirname, "../data/plugins"));
  }
} catch {}

const mu = new UrsaMU();

process.on("SIGINT", async () => {
  const players = await dbojs.find({ flags: /connected/i });

  for (const player of players) {
    await setFlags(player, "!connected");
  }

  await broadcast("Server shutting down.");
  process.exit(0);
});

process.on("unhandledRejection", (reason, p) => {
  console.log("Unhandled Rejection at: Promise", p, "reason:", reason);
});

if (require.main === module) mu.start();
