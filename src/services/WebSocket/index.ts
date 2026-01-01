
import { IContext } from "../../@types/IContext.ts";
import { cmdParser } from "../commands/index.ts";
import { playerForSocket } from "../../utils/playerForSocket.ts";
import { setFlags } from "../../utils/setFlags.ts";
import { moniker } from "../../utils/moniker.ts";
import { UserSocket } from "../../@types/IMSocket.ts";
import { Presenter } from "../Presenter/index.ts";
import { IMessage } from "../../interfaces/IMessage.ts";

export class WebSocketService {
    private static instance: WebSocketService;
    private clients: Set<WebSocket> = new Set();
    // Map socket to metadata
    private socketData: Map<WebSocket, UserSocket> = new Map();

    private constructor() { }

    static getInstance(): WebSocketService {
        if (!WebSocketService.instance) {
            WebSocketService.instance = new WebSocketService();
        }
        return WebSocketService.instance;
    }

    handleConnection(socket: WebSocket) {
        const onOpen = () => {
            if (this.clients.has(socket)) return;
            this.clients.add(socket);
            this.socketData.set(socket, {
                id: crypto.randomUUID(),
                join: () => { },
                uID: "",
                cid: "",
                leave: () => { },
                disconnect: () => { },
                on: () => { }
            });
            console.log("New WebSocket connection established");
        };

        if (socket.readyState === WebSocket.OPEN) {
            onOpen();
        } else {
            socket.addEventListener("open", onOpen);
        }

        socket.addEventListener("message", async (event) => {
            try {
                const data = JSON.parse(event.data);
                const sockData = this.socketData.get(socket);

                if (!sockData) return;

                // Update cid if provided (handling migration from socket.io logic)
                if (data.data?.cid) sockData.cid = data.data.cid;

                // Handle disconnect request
                if (data.data?.disconnect) {
                    socket.close();
                    return;
                }

                const ctx: IContext = {
                    socket: sockData,
                    msg: data.msg || ""
                };

                // Note: joinChans(ctx) would go here if needed
                if (ctx.msg && ctx.msg.trim()) {
                    await cmdParser.run(ctx);
                }

            } catch (error) {
                console.error("Error parsing message:", error);
            }
        });

        socket.addEventListener("close", async () => {
            const sockData = this.socketData.get(socket);
            this.clients.delete(socket);
            this.socketData.delete(socket);

            if (sockData?.cid) {
                const player = await playerForSocket(sockData);
                if (player) {
                    await setFlags(player, "!connected");
                    this.broadcast({
                        event: "disconnect",
                        payload: {
                            msg: `${moniker(player)} has disconnected.`,
                            room: {
                                name: "", desc: "", exits: [], players: [], items: [] // dummy
                            }
                        }
                    });
                }
            }
        });

        socket.addEventListener("error", (e) => {
            console.error("WebSocket error:", e);
        });
    }

    // Send to specific socket(s)
    send(targets: string[], message: IMessage) {
        // In our simplified model, we might need a way to map "targets" (which were channel names or IDs) to sockets.
        // For now, let's assume 'targets' contains socket IDs or we broadcast to all for simplistic "pub" channels
        // Real implementation requires channel subscription tracking.

        for (const client of this.clients) {
            const meta = this.socketData.get(client);
            // Naive Check: if target is a channel, does user have it?
            // Logic specific to implementation.
            // For direct messages (target = socket.id), we check ID.
            if (meta && targets.includes(meta.id)) {
                client.send(JSON.stringify(Presenter.render(message.payload, "telnet"))); // Defaulting to text for now
            }
        }
    }

    // Broadcast to all
    broadcast(message: IMessage) {
        for (const client of this.clients) {
            // Determine client type (stubbed)
            // If web client, send jsonData
            // If telnet client, send textData
            // For now, send text structure in JSON wrapper or raw?
            // UrsaMU legacy uses JSON wrapper { msg: string, data: ... }

            const payload = {
                msg: message.payload.msg,
                data: message.payload.data
            };

            client.send(JSON.stringify(payload));
        }
    }

    // Get all connected sockets
    getConnectedSockets(): UserSocket[] {
        return Array.from(this.socketData.values());
    }
}

export const wsService = WebSocketService.getInstance();
