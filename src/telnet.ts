import { readFileSync } from "fs";
import { createServer } from "net";
import { join } from "path";
import { io } from "socket.io-client";
import config from "./ursamu.config";

const welcome = readFileSync(join(__dirname, "../text/connect.txt"), "utf8");
const server = createServer((socket) => {
  let cid: number;

  const sock = io(`http://localhost:${config.server.ws}`);
  socket.write(welcome + "\r\n");

  sock.on("message", (data) => {
    if (data.data.cid) cid = data.data.cid;
    socket.write(data.msg + "\r\n");
  });

  socket.on("data", (data) => {
    sock.emit("message", { msg: data.toString(), data: { cid } });
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
