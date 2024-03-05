import { readFileSync } from "node:fs";
import { createServer, Socket } from "node:net";
import { join } from "node:path";
import { dpath, io } from "../deps.ts"; // Assuming this works in your environment
import { gameConfig } from "./config.ts";
import parser from "./services/parser/parser.ts";
import { Buffer } from "node:buffer";

interface ITelnetSocket extends Socket {
  cid?: number;
}

const __dirname = dpath.dirname(dpath.fromFileUrl(import.meta.url));
const welcome = readFileSync(
  join(
    __dirname,
    gameConfig.game?.text.connect || "../text/connect_default.txt",
  ),
  "utf8",
);

// Telnet command constants
const IAC = 255; // "Interpret as Command"
const DO = 253; // Indicates the desire to begin performing, or confirmation that you are now performing, the indicated option.
const WILL = 251; // Indicates the desire to begin performing, or confirmation that you are now performing, the indicated option.
const SB = 250; // Subnegotiation of the indicated option follows.
const SE = 240; // End of subnegotiation parameters.
const NAWS = 31; // Negotiate About Window Size

const server = createServer((socket: ITelnetSocket) => {
  const sock = io(`http://localhost:${gameConfig.server?.ws}`);
  socket.write(welcome + "\r\n");

  // Negotiate NAWS
  socket.write(Buffer.from([IAC, DO, NAWS]));

  socket.on("data", (data) => {
    // Check if the data includes IAC (start of command sequence) for NAWS negotiation
    if (
      data.length >= 3 && data[0] === IAC && data[1] === SB && data[2] === NAWS
    ) {
      // Assuming the NAWS response follows directly after IAC SB NAWS and no other commands are interleaved
      if (data.length >= 9 && data[7] === IAC && data[8] === SE) { // Validate end of subnegotiation
        const width = data[3] * 256 + data[4]; // Correct indexing for width
        const height = data[5] * 256 + data[6]; // Correct indexing for height
        console.log(`Window size: ${width}x${height}`);
      }
    } else {
      // Forward the received data to your application's logic as needed
      sock.emit("message", { msg: data.toString(), data: { cid: socket.cid } });
    }
  });

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

  sock.on("error", () => socket.end());
  socket.on("end", () => {
    sock.disconnect();
  });

  socket.on("error", (err) => {
    console.log(err);
  });
});

server.listen(
  gameConfig.server?.telnet,
  () =>
    console.log(`Telnet server listening on port ${gameConfig.server?.telnet}`),
);
