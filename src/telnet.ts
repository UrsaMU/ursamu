import { readFileSync } from "node:fs";
import { createServer, Socket } from "node:net";
import { join } from "node:path";
import { dpath, io } from "../deps.ts";
import config from "./ursamu.config.ts";
import parser from "./services/parser/parser.ts";

interface ITelnetSocket extends Socket {
  cid?: number;
}

const __dirname = dpath.dirname(dpath.fromFileUrl(import.meta.url));
let welcome = "";

try {
  welcome = readFileSync(
    join(__dirname, "../data/text/connect.txt"),
    "utf8",
  );
} catch {
  welcome = readFileSync(
    join(__dirname, "../text/default_connect.txt"),
    "utf8",
  );
}

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
      parser.substitute("telnet", "%chGame>%cn @reboot Complete.\r\n"),
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

server.listen(
  config.server?.telnet,
  () => console.log(`Telnet server listening on port ${config.server?.telnet}`),
);
