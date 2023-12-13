import { Socket, createServer } from "net";

import { io } from "socket.io-client";
import cfg from "./ursamu.config";
import parser from "./services/parser/parser";
import { join } from "path";
import { readFile } from "fs/promises";

const args = process.argv.slice(2);
const dirArg = args.find((arg) => arg.startsWith("--dir="));
let directory = dirArg ? dirArg.split("=")[1] : "";

directory = directory
  ? join(directory, "./text/connect.txt")
  : join(__dirname, "../text/default_connect.txt");

interface ITelnetSocket extends Socket {
  cid?: number;
}

const server = createServer(async (socket: ITelnetSocket) => {
  const sock = io(`http://localhost:${cfg.config.server?.ws}`);

  socket.write((await readFile(join(directory), "utf-8")) + "\r\n");

  sock.on("message", (data) => {
    if (data.data?.cid) socket.cid = data.data.cid;
    socket.write(data.msg + "\r\n");

    if (data.data?.quit) return socket.end();
  });

  socket.on("disconnect", () => sock.disconnect());
  socket.on("error", () => sock.disconnect());

  sock.io.on("reconnect", () => {
    socket.write(
      parser.substitute("telnet", "%chGame>%cn @reboot Complete.\r\n")
    );
    sock.emit("message", {
      msg: "",
      data: {
        cid: socket.cid,
        reconnect: true,
      },
    });
  });

  sock.io.on("reconnect_attempt", () => {
    sock.emit("message", {
      msg: "",
      data: {
        cid: socket.cid,
        reconnect: true,
      },
    });
  });

  // sock.on("disconnect", () => socket.end());
  sock.on("error", () => socket.end());

  socket.on("data", (data) => {
    sock.emit("message", { msg: data.toString(), data: { cid: socket.cid } });
  });

  socket.on("end", () => {
    sock.disconnect();
  });

  socket.on("error", (err) => {
    console.log(err);
  });
});

server.listen(cfg.config.server?.telnet, () =>
  console.log(`Telnet server listening on port ${cfg.config.server?.telnet}`)
);
