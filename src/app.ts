import { IMSocket } from "./@types/IMSocket.ts";
import { cmdParser } from "./services/commands/index.ts";
import { send } from "./services/broadcast/index.ts";
import { moniker } from "./utils/moniker.ts";
import { joinChans } from "./utils/joinChans.ts";
import { IContext } from "./@types/IContext.ts";
import { setFlags } from "./utils/setFlags.ts";
import { authRouter, dbObjRouter } from "./routes/index.ts";
import { playerForSocket } from "./utils/playerForSocket.ts";
import { Server } from "https://deno.land/x/socket_io@0.2.0/mod.ts";
import { Application } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { webRouter } from "./routes/webRouter.ts";

export const app = new Application();

app.use(authRouter.routes());
app.use(authRouter.allowedMethods());

app.use(dbObjRouter.routes());
app.use(dbObjRouter.allowedMethods());

app.use(webRouter.routes());
app.use(webRouter.allowedMethods());

export const io = new Server();

io.on("connection", (socket: any) => {
  socket.on("message", async (message: IContext) => {
    if (message.data?.cid) socket.cid = message.data.cid;
    const player = await playerForSocket(socket);
    if (player) socket.join(`#${player.location}`);

    if (message.data?.disconnect) {
      socket.disconnect();
      return;
    }

    const ctx: IContext = { socket, msg: message.msg };
    joinChans(ctx);
    if (message.msg?.trim()) cmdParser.run(ctx);
  });

  socket.on("disconnect", async () => {
    const en = await playerForSocket(socket);
    if (!en) return;

    const socks: IMSocket[] = [];
    for (const [id, sock] of (await io.fetchSockets()).entries()) {
      const s = sock as any;
      if (s.cid && s.cid === en.id) {
        socks.push(s);
      }
    }

    if (socks.length < 1) {
      await setFlags(en, "!connected");
      return await send(
        [`#${en.location}`],
        `${moniker(en)} has disconnected.`,
      );
    }

    return await send(
      [`#${en.location}`],
      `${moniker(en)} has partially disconnected.`,
    );
  });

  socket.on("error", () => {
    socket.disconnect();
  });
});
