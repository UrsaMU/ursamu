import path from "path";
import { server } from "./app";
import { plugins } from "./utils/loadDIr";
import { loadTxtDir } from "./utils/loadTxtDir";

import { createObj } from "./services/DBObjs";
import { dbojs } from "./services/Database";
import Readline from "readline";
import { hash } from "bcryptjs";

plugins(path.join(__dirname, "./commands"));
loadTxtDir(path.join(__dirname, "../text"));
server.listen(4202, async () => {
  const rooms = await dbojs.find({
    $where: function () {
      return this.flags.includes("Room");
    },
  });

  const players = await dbojs.find({
    $where: function () {
      return this.flags.includes("superuser");
    },
  });

  if (!players.length) {
    const rl = Readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    let name = "";
    let pass = "";

    if (!rooms.length) {
      const room = await createObj("room", { name: "The Void" });
      console.log("The Void created.");
    }

    rl.question("Enter a name for tour super user account. ", async (name) => {
      rl.question(
        "Enter a password for your super user account. ",
        async (pass) => {
          dbojs.insert({
            id: (await dbojs.count({})) + 1,
            flags: "player superuser",
            location: rooms[0].id,
            data: {
              name,
              password: await hash(pass, 10),
            },
          });
          console.log("Super user account created.");
          console.log("Server is ready.");
          rl.close();
        }
      );
    });
  }
});
