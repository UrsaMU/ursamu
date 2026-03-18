
import type { IContext } from "../../@types/IContext.ts";
import { cmdParser } from "../commands/index.ts";
import { playerForSocket } from "../../utils/playerForSocket.ts";
import { setFlags } from "../../utils/setFlags.ts";
import { moniker } from "../../utils/moniker.ts";
import type { UserSocket } from "../../@types/IMSocket.ts";
import { Presenter } from "../Presenter/index.ts";
import type { IMessage } from "../../interfaces/IMessage.ts";
import { hooks } from "../Hooks/index.ts";

export class WebSocketService {
    private static instance: WebSocketService;
    private clients: Set<WebSocket> = new Set();
    // Map socket to metadata
    private socketData: Map<WebSocket, UserSocket> = new Map();
    // Rate limiting: max commands per window per socket
    private static readonly RATE_LIMIT = 10;
    private static readonly RATE_WINDOW_MS = 1000;
    private rateLimits: Map<string, { count: number; resetAt: number }> = new Map();
    // Per-IP connection tracking
    private connectionsPerIp: Map<string, Set<WebSocket>> = new Map();
    private socketIp: Map<WebSocket, string> = new Map();

    private isRateLimited(socketId: string): boolean {
        const now = Date.now();
        const entry = this.rateLimits.get(socketId);
        if (!entry || now >= entry.resetAt) {
            this.rateLimits.set(socketId, { count: 1, resetAt: now + WebSocketService.RATE_WINDOW_MS });
            return false;
        }
        entry.count++;
        return entry.count > WebSocketService.RATE_LIMIT;
    }

    /** Check if an IP has exceeded the max connection limit. */
    canConnect(ip: string, max: number): boolean {
        const existing = this.connectionsPerIp.get(ip);
        return !existing || existing.size < max;
    }

    private trackIp(socket: WebSocket, ip: string): void {
        this.socketIp.set(socket, ip);
        let set = this.connectionsPerIp.get(ip);
        if (!set) {
            set = new Set();
            this.connectionsPerIp.set(ip, set);
        }
        set.add(socket);
    }

    private untrackIp(socket: WebSocket): void {
        const ip = this.socketIp.get(socket);
        if (ip) {
            const set = this.connectionsPerIp.get(ip);
            if (set) {
                set.delete(socket);
                if (set.size === 0) this.connectionsPerIp.delete(ip);
            }
            this.socketIp.delete(socket);
        }
    }

    private constructor() { }

    static getInstance(): WebSocketService {
        if (!WebSocketService.instance) {
            WebSocketService.instance = new WebSocketService();
        }
        return WebSocketService.instance;
    }

    handleConnection(socket: WebSocket, clientType: string = "telnet", preAuthUserId?: string, remoteIp?: string) {
        const onOpen = async () => {
            if (this.clients.has(socket)) return;
            this.clients.add(socket);
            if (remoteIp) this.trackIp(socket, remoteIp);
            const rooms = new Set<string>();
            const sockData: UserSocket = {
                id: crypto.randomUUID(),
                clientType,
                channels: rooms,
                join: (room: string) => { rooms.add(room); },
                uID: "",
                cid: "",
                leave: (room: string) => { rooms.delete(room); },
                disconnect: () => { },
                on: () => { }
            };
            this.socketData.set(socket, sockData);
            console.log(`New WebSocket connection established (${clientType})`);

            // JWT pre-auth: restore session without requiring `connect name password`
            if (preAuthUserId) {
                sockData.cid = preAuthUserId;
                const player = await playerForSocket(sockData);
                if (player) {
                    if (!player.flags.includes("connected")) {
                        await setFlags(player, "connected");
                    }
                    console.log(`[WS] Pre-authenticated as ${moniker(player)}`);
                }
            }
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
                if (data.data?.cid) {
                    sockData.cid = data.data.cid;
                    // Restore connected flag if missing
                    const player = await playerForSocket(sockData);
                    if (player && !player.flags.includes("connected")) {
                        await setFlags(player, "connected");
                        console.log(`[WS] Restored session for ${moniker(player)}`);
                    }
                }

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
                    if (this.isRateLimited(sockData.id)) {
                        console.warn(`[WS] Rate limit hit for socket ${sockData.id} (cid: ${sockData.cid || "anon"})`);
                        try {
                            socket.send(JSON.stringify({ msg: "[Rate limit] Too many commands — slow down.", data: {} }));
                        } catch { /* socket may be closing */ }
                    } else {
                        await cmdParser.run(ctx);
                    }
                }

            } catch (error) {
                console.error("Error parsing message:", error);
            }
        });

        socket.addEventListener("close", async () => {
            const sockData = this.socketData.get(socket);
            this.clients.delete(socket);
            this.socketData.delete(socket);
            this.untrackIp(socket);
            if (sockData?.id) this.rateLimits.delete(sockData.id);

            if (sockData?.cid) {
                const player = await playerForSocket(sockData);
                if (player) {
                    await setFlags(player, "!connected");
                    await hooks.adisconnect(player);
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
        for (const client of this.clients) {
            const meta = this.socketData.get(client);
            const inRoom = meta?.channels ? targets.some(t => meta.channels!.has(t)) : false;
            if (meta && (targets.includes(meta.id) || (meta.cid && targets.includes(meta.cid)) || inRoom)) {
                try {
                    if (meta.clientType === "web") {
                        const output = Presenter.render(message.payload, "web");
                        client.send(JSON.stringify(output));
                    } else {
                        const output = Presenter.render(message.payload, "telnet");
                        client.send(JSON.stringify({ msg: output, data: message.payload.data }));
                    }
                } catch { /* socket may be closing */ }
            }
        }
    }

    // Broadcast to all
    broadcast(message: IMessage) {
        for (const client of this.clients) {
            const meta = this.socketData.get(client);
            try {
                if (meta?.clientType === "web") {
                    const output = Presenter.render(message.payload, "web");
                    client.send(JSON.stringify(output));
                } else {
                    const output = Presenter.render(message.payload, "telnet");
                    client.send(JSON.stringify({
                        msg: output,
                        data: message.payload.data
                    }));
                }
            } catch { /* socket may be closing */ }
        }
    }

    // Get all connected sockets
    getConnectedSockets(): UserSocket[] {
        return Array.from(this.socketData.values());
    }
    
    // Disconnect a player by CID
    disconnect(cid: string) {
        for (const [socket, meta] of this.socketData.entries()) {
            if (meta.cid === cid) {
                socket.close();
            }
        }
    }
}

export const wsService = WebSocketService.getInstance();
