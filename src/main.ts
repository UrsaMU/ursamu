import path from "path";
import { server } from "./app";
import { plugins } from "./utils/loadDIr";
import { loadTxtDir } from "./utils/loadTxtDir";

import { createObj } from "./services/DBObjs";
import { chans, counters, dbojs } from "./services/Database";

plugins(path.join(__dirname, "./commands"));
loadTxtDir(path.join(__dirname, "../text"));
server.listen(4202, async () => {
  const rooms = await dbojs.find({
    $where: function () {
      return this.flags.includes("room");
    },
  });

  const counter = {
    _id: "objid",
    seq: 0,
  };

  if (!(await counters.findOne({ _id: "objid" }))) {
    await counters.insert(counter);
  }

  if (!rooms.length) {
    const room = await createObj("room safe void", { name: "The Void" });
    console.log("The Void created.");
  }

  // create the default channels
  const channels = await chans.find({});
  if (!channels.length) {
    console.log("No channels found, creating some!");
    await chans.insert({
      name: "Public",
      header: "%ch%cc[Public]%cn",
      alias: "pub",
    });

    await chans.insert({
      name: "Admin",
      header: "%ch%cy[Admin]%cn",
      alias: "ad",
      lock: "admin+",
    });
  }
});
