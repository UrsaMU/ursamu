import { readFileSync } from "node:fs";
import { Socket, createServer } from "node:net";
import { join } from "node:path";
import { io } from "../deps.ts";
import config from "./ursamu.config.ts";
import parser from "./services/parser/parser.ts";
import * as path from "https://deno.land/std@0.188.0/path/mod.ts";

interface ITelnetSocket extends Socket {
  cid?: number;
}

const __dirname = path.dirname(path.fromFileUrl(import.meta.url))
const welcome = readFileSync(
  join(__dirname, config.game?.text.connect || "../text/connect_default.txt"),
  "utf8"
);

const server = createServer((socket: ITelnetSocket) => {
  const sock = io(`http://localhost:${config.server?.ws}`);
  socket.write(welcome + "\r\n");

  sock.on("message", (data) => {
    if (data.data?.cid) socket.cid = data.data.cid;
    socket.write(data.msg + "\r\n");

    if (data.data?.quit) return socket.end();
  });

  socket.on("disconnect", () => sock.close());
  socket.on("error", () => sock.close());

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

server.listen(config.server?.telnet, () =>
  console.log(`Telnet server listening on port ${config.server?.telnet}`)
);
