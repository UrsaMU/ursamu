import path from "path";
import { UrsaMU } from "./app";
import { dbojs } from "./services/Database";
import { setFlags } from "./utils/setFlags";
import { broadcast } from "./services/broadcast";

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
