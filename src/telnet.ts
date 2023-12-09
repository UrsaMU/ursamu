import { readFileSync } from "fs";
import { Socket, createServer } from "net";
import { join } from "path";
import { io } from "socket.io-client";
import cfg from "./ursamu.config";
import parser from "./services/parser/parser";

interface ITelnetSocket extends Socket {
  cid?: number;
}

const welcome = readFileSync(
  join(
    __dirname,
    cfg.config.game?.text.connect || "../text/connect_default.txt"
  ),
  "utf8"
);

const server = createServer((socket: ITelnetSocket) => {
  const sock = io(`http://localhost:${cfg.config.server?.ws}`);
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

server.listen(cfg.config.server?.telnet, () =>
  console.log(`Telnet server listening on port ${cfg.config.server?.telnet}`)
);
