import path from "path";
import { UrsaMU } from "./app";
import { loadDir } from "./utils/loadDIr";
import { loadTxtDir } from "./utils/loadTxtDir";
import { dbojs } from "./services/Database";
import { setFlags } from "./utils/setFlags";
import { broadcast } from "./services/broadcast";

loadDir(path.join(__dirname, "./commands"));
loadTxtDir(path.join(__dirname, "../text"));
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
