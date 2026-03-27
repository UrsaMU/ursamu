
import type { IContext } from "../../@types/IContext.ts";
import { cmdParser } from "../commands/index.ts";
import { playerForSocket } from "../../utils/playerForSocket.ts";
import { setFlags } from "../../utils/setFlags.ts";

/** Validate a termWidth value from a WS client or telnet NAWS negotiation.
 *  Returns the value if it is within the accepted range, or null to reject it. */
export function clampTermWidth(w: unknown): number | null {
  if (typeof w !== "number" || !Number.isFinite(w)) return null;
  if (w < 40 || w > 250) return null;
  return w;
}
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
            this._invalidateSocketCache();
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

                // JWT post-connection auth — client sends { type: "auth", token: "<jwt>" }
                // instead of embedding the token in the WS URL query parameter (C1 fix).
                // Security: only set cid when the socket has no cid yet (no re-auth / spoofing).
                if (data.type === "auth" && typeof data.token === "string" && !sockData.cid) {
                    try {
                        const { verify } = await import("../jwt/index.ts");
                        const decoded = await verify(data.token);
                        if (decoded && typeof decoded.id === "string") {
                            sockData.cid = decoded.id;
                            const player = await playerForSocket(sockData);
                            if (player && !player.flags.includes("connected")) {
                                await setFlags(player, "connected");
                            }
                            console.log(`[WS] Authenticated socket via auth message (cid: ${sockData.cid})`);
                        }
                    } catch {
                        // Invalid token — silently reject, socket stays unauthenticated
                    }
                    return;
                }

                // Update cid if provided (handling migration from socket.io logic)
                // Security: only allow cid to be set when the socket has no cid yet,
                // preventing CID spoofing/impersonation of other players.
                if (data.data?.cid && !sockData.cid) {
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

                // Handle NAWS termWidth update from telnet sidecar — validate before DB write
                if (data.data?.termWidth !== undefined && sockData.cid) {
                    const validWidth = clampTermWidth(data.data.termWidth);
                    if (validWidth !== null) {
                        const { dbojs } = await import("../Database/index.ts");
                        await dbojs.modify({ id: sockData.cid }, "$set", { "data.termWidth": validWidth } as never);
                    }
                }

                // Support both legacy { msg } format (telnet sidecar) and typed
                // { type: "cmd", data: <string> } format (web client / site-builder).
                const rawCmd = data.msg ||
                    (data.type === "cmd" ? String(data.data ?? "") : "") ||
                    "";
                const ctx: IContext = {
                    socket: sockData,
                    msg: rawCmd,
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
            this._invalidateSocketCache();
            this.untrackIp(socket);
            if (sockData?.id) this.rateLimits.delete(sockData.id);

            if (sockData?.cid) {
                const player = await playerForSocket(sockData);
                if (player) {
                    await setFlags(player, "!connected");
                    const { dbojs } = await import("../Database/index.ts");
                    await dbojs.modify({ id: player.id }, "$set", { "data.lastLogout": Date.now() } as never);
                    await hooks.adisconnect(player, sockData.id);

                    if (player.location) {
                        const roomPlayers = await dbojs.query({
                            $and: [{ location: player.location }, { flags: /connected/i }, { id: { $ne: player.id } }]
                        });
                        const room = await dbojs.queryOne({ id: player.location });
                        const roomData = room ? {
                            name: room.data?.name || "",
                            desc: (room.data?.description as string) || (room.data?.desc as string) || "",
                            exits: [],
                            players: [],
                            items: []
                        } : { name: "", desc: "", exits: [], players: [], items: [] };

                        this.send(
                            roomPlayers.map(p => p.id),
                            {
                                event: "disconnect",
                                payload: {
                                    msg: `${moniker(player)} has disconnected.`,
                                }
                            }
                        );
                    }
                }
            }
        });

        socket.addEventListener("error", (e) => {
            console.error("WebSocket error:", e);
        });
    }

    // Send to specific socket(s)
    send(targets: string[], message: IMessage) {
        // Build a target set for O(1) lookup
        const targetSet = new Set(targets);

        // Pre-render once per client type (not per socket)
        let telnetOutput: string | undefined;
        let telnetJson: string | undefined;
        let webOutput: string | object | undefined;
        let webJson: string | undefined;

        for (const client of this.clients) {
            const meta = this.socketData.get(client);
            if (!meta) continue;
            const match = targetSet.has(meta.id) ||
                (meta.cid && targetSet.has(meta.cid)) ||
                (meta.channels ? targets.some(t => meta.channels!.has(t)) : false);
            if (!match) continue;
            try {
                if (meta.clientType === "web") {
                    if (webJson === undefined) {
                        webOutput = Presenter.render(message.payload, "web");
                        webJson = JSON.stringify(webOutput);
                    }
                    client.send(webJson);
                } else {
                    if (telnetJson === undefined) {
                        telnetOutput = Presenter.render(message.payload, "telnet") as string;
                        telnetJson = JSON.stringify({ msg: telnetOutput, data: message.payload.data });
                    }
                    client.send(telnetJson);
                }
            } catch { /* socket may be closing */ }
        }
    }

    // Broadcast to all
    broadcast(message: IMessage) {
        // Pre-render once per client type
        let telnetJson: string | undefined;
        let webJson: string | undefined;

        for (const client of this.clients) {
            const meta = this.socketData.get(client);
            try {
                if (meta?.clientType === "web") {
                    if (webJson === undefined) {
                        webJson = JSON.stringify(Presenter.render(message.payload, "web"));
                    }
                    client.send(webJson);
                } else {
                    if (telnetJson === undefined) {
                        const output = Presenter.render(message.payload, "telnet");
                        telnetJson = JSON.stringify({ msg: output, data: message.payload.data });
                    }
                    client.send(telnetJson);
                }
            } catch { /* socket may be closing */ }
        }
    }

    // Cached connected sockets array — invalidated on connect/disconnect
    private _connectedCache: UserSocket[] | null = null;
    private _socketById = new Map<string, UserSocket>();

    /** Invalidate the connected sockets cache. Call on connect/disconnect. */
    private _invalidateSocketCache(): void {
        this._connectedCache = null;
    }

    // Get all connected sockets (cached between connect/disconnect events)
    getConnectedSockets(): UserSocket[] {
        if (!this._connectedCache) {
            this._connectedCache = Array.from(this.socketData.values());
            // Rebuild ID index
            this._socketById.clear();
            for (const s of this._connectedCache) {
                this._socketById.set(s.id, s);
            }
        }
        return this._connectedCache;
    }

    /** Subscribe a socket to a room/channel by socket ID. Used by the channel plugin via gameHooks. */
    joinSocketToRoom(socketId: string, room: string): void {
        // Try fast index lookup first
        const sock = this._socketById.get(socketId);
        if (sock) { sock.join(room); return; }
        // Fallback to linear scan
        for (const meta of this.socketData.values()) {
            if (meta.id === socketId) {
                meta.join(room);
                return;
            }
        }
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

export const wsService: WebSocketService = WebSocketService.getInstance();
