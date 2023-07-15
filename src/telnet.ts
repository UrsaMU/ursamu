import { readFileSync } from "fs";
import { Socket, createServer } from "net";
import { join } from "path";
import { io } from "socket.io-client";
import config from "./ursamu.config";

interface ITelnetSocket extends Socket {
  cid?: number;
}

const welcome = readFileSync(join(__dirname, "../text/connect.txt"), "utf8");
const server = createServer((socket: ITelnetSocket) => {
  const sock = io(`http://localhost:${config.server.ws}`);
  socket.write(welcome + "\r\n");

  sock.on("message", (data) => {
    if (data.data.cid) socket.cid = data.data.cid;
    socket.write(data.msg + "\r\n");

    if (data.data.quit) return socket.end();
  });

  sock.io.on("reconnect_attempt", () => {
    console.log("Reconnecting...");
    sock.emit("message", {
      msg: "",
      data: {
        cid: socket.cid,
      },
    });
  });

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

server.listen(config.server.telnet, () =>
  console.log(`Telnet server listening on port ${config.server.telnet}`)
);
