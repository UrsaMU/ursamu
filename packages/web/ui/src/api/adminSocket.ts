/**
 * Staff admin WebSocket — sole transport for console data.
 *
 * Protocol:
 *   → { type:"req", id, method, path, body? }
 *   ← { type:"res", id, status, data }
 *   ← { type:"snapshot", data }
 *   ← push: wiki:* | job:* | object:* | online:set
 */

import { getToken } from "@/api/client";
import type {
  BbsBoard,
  DboStub,
  Job,
  JobStats,
  Me,
  OnlinePlayer,
  StaffBadge,
  StaffNavItem,
  StaffSideNavRegistration,
  WikiStub,
} from "@/api/types";

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 20_000;
const PING_MS = 25_000;
const REQ_TIMEOUT_MS = 60_000;

export type SnapshotData = {
  me?: Me | null;
  pages?: WikiStub[];
  online?: OnlinePlayer[];
  objects?: unknown;
  jobs?: Job[];
  jobStats?: JobStats | null;
  boards?: BbsBoard[];
  staffNav?: StaffNavItem[];
  staffBadges?: Record<string, StaffBadge>;
  staffSideNav?: Record<string, StaffSideNavRegistration>;
};

export type AdminSocketHandlers = {
  onOpen: () => void;
  onClose: () => void;
  onSnapshot: (data: SnapshotData) => void;
  onWikiUpsert: (page: WikiStub) => void;
  onWikiDelete: (path: string) => void;
  onJobUpsert: (job: Job) => void;
  onJobDelete: (id: string, number?: number) => void;
  onObjectUpsert: (obj: DboStub) => void;
  onObjectDelete: (id: string) => void;
  onBoardUpsert: (board: BbsBoard) => void;
  onBoardDelete: (id: string, num?: number) => void;
  onOnlineSet: (players: OnlinePlayer[]) => void;
  onBadgeSet: (badge: StaffBadge) => void;
  onStaffChrome?: (data: {
    staffNav: StaffNavItem[];
    staffSideNav: Record<string, StaffSideNavRegistration>;
  }) => void;
  onTouch: () => void;
  onError?: (message: string) => void;
};

type Pending = {
  resolve: (v: { status: number; data: unknown }) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

function adminWsUrl(token: string): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const q = encodeURIComponent(token);
  return `${proto}//${location.host}/admin/ws?token=${q}`;
}

export class AdminSocket {
  private sock: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null =
    null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private intentionalClose = false;
  private running = false;
  private handlers: AdminSocketHandlers;
  private pending = new Map<string, Pending>();
  private reqSeq = 0;

  constructor(handlers: AdminSocketHandlers) {
    this.handlers = handlers;
  }

  get connected(): boolean {
    return this.sock?.readyState === WebSocket.OPEN;
  }

  start(): void {
    this.running = true;
    this.intentionalClose = false;
    this.connect();
  }

  stop(): void {
    this.running = false;
    this.intentionalClose = true;
    this.stopPing();
    this.clearReconnect();
    this.failAllPending("WebSocket closed");
    if (this.sock) {
      try {
        this.sock.close();
      } catch {
        /* ignore */
      }
      this.sock = null;
    }
  }

  /** RPC over the admin socket. */
  request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; data: unknown }> {
    if (!this.connected || !this.sock) {
      return Promise.reject(new Error("WebSocket not connected"));
    }
    const id = `r${++this.reqSeq}-${Date.now()}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("WebSocket request timeout"));
      }, REQ_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.sock!.send(
          JSON.stringify({
            type: "req",
            id,
            method,
            path,
            body,
          }),
        );
      } catch (e: unknown) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  /** Ask server to re-push full snapshot. */
  requestSnapshot(): void {
    if (!this.connected || !this.sock) return;
    try {
      this.sock.send(JSON.stringify({ type: "snapshot" }));
    } catch {
      /* ignore */
    }
  }

  private failAllPending(msg: string): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error(msg));
    }
    this.pending.clear();
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.sock?.readyState === WebSocket.OPEN) {
        try {
          this.sock.send(JSON.stringify({ type: "ping" }));
        } catch {
          /* ignore */
        }
      }
    }, PING_MS);
  }

  private applyMessage(raw: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    const t = String(msg.type ?? "");
    const h = this.handlers;

    if (t === "res" && typeof msg.id === "string") {
      const p = this.pending.get(msg.id);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(msg.id);
        p.resolve({
          status: typeof msg.status === "number" ? msg.status : 500,
          data: msg.data,
        });
      }
      return;
    }

    if (t === "hello" || t === "pong") {
      h.onTouch();
      return;
    }
    if (t === "error" && typeof msg.message === "string") {
      h.onError?.(msg.message);
      return;
    }
    if (t === "snapshot" && msg.data && typeof msg.data === "object") {
      h.onSnapshot(msg.data as SnapshotData);
      h.onTouch();
      return;
    }
    if (t === "wiki:upsert" && msg.page && typeof msg.page === "object") {
      h.onWikiUpsert(msg.page as WikiStub);
      return;
    }
    if (t === "wiki:delete" && typeof msg.path === "string") {
      h.onWikiDelete(msg.path);
      return;
    }
    if (t === "job:upsert" && msg.job && typeof msg.job === "object") {
      h.onJobUpsert(msg.job as Job);
      return;
    }
    if (t === "job:delete") {
      h.onJobDelete(
        String(msg.id ?? ""),
        typeof msg.number === "number" ? msg.number : undefined,
      );
      return;
    }
    if (
      t === "object:upsert" &&
      msg.object &&
      typeof msg.object === "object"
    ) {
      h.onObjectUpsert(msg.object as DboStub);
      return;
    }
    if (t === "object:delete" && typeof msg.id === "string") {
      h.onObjectDelete(msg.id);
      return;
    }
    if (
      t === "board:upsert" &&
      msg.board &&
      typeof msg.board === "object"
    ) {
      h.onBoardUpsert(msg.board as BbsBoard);
      return;
    }
    if (t === "board:delete" && typeof msg.id === "string") {
      h.onBoardDelete(
        msg.id,
        typeof msg.num === "number" ? msg.num : undefined,
      );
      return;
    }
    if (t === "online:set" && Array.isArray(msg.players)) {
      h.onOnlineSet(msg.players as OnlinePlayer[]);
      return;
    }
    if (t === "badge:set" && typeof msg.key === "string") {
      h.onBadgeSet({
        key: msg.key,
        value: typeof msg.value === "string" ? msg.value : "",
        title: typeof msg.title === "string"
          ? msg.title
          : undefined,
      });
      return;
    }
    if (t === "staff:chrome") {
      const nav = Array.isArray(msg.staffNav)
        ? msg.staffNav as StaffNavItem[]
        : [];
      const side =
        msg.staffSideNav && typeof msg.staffSideNav === "object"
          ? msg.staffSideNav as Record<
            string,
            StaffSideNavRegistration
          >
          : {};
      h.onStaffChrome?.({ staffNav: nav, staffSideNav: side });
    }
  }

  private scheduleReconnect(): void {
    if (!this.running || this.intentionalClose) return;
    this.clearReconnect();
    const delay = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempt),
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  connect(): void {
    if (!this.running) return;
    const token = getToken();
    if (!token) {
      this.handlers.onClose();
      return;
    }

    this.intentionalClose = false;
    try {
      if (this.sock) {
        try {
          this.sock.close();
        } catch {
          /* ignore */
        }
      }
      this.sock = new WebSocket(adminWsUrl(token));
    } catch {
      this.handlers.onClose();
      this.scheduleReconnect();
      return;
    }

    this.sock.onopen = () => {
      this.reconnectAttempt = 0;
      this.startPing();
      this.handlers.onOpen();
    };

    this.sock.onmessage = (ev) => {
      if (typeof ev.data === "string") this.applyMessage(ev.data);
    };

    this.sock.onclose = () => {
      this.stopPing();
      this.sock = null;
      this.failAllPending("WebSocket closed");
      this.handlers.onClose();
      if (!this.intentionalClose && this.running) {
        this.scheduleReconnect();
      }
    };

    this.sock.onerror = () => {
      try {
        this.sock?.close();
      } catch {
        /* ignore */
      }
    };
  }
}

/** Singleton used by api() + live store. */
let _sock: AdminSocket | null = null;

export function getAdminSocket(): AdminSocket | null {
  return _sock;
}

export function setAdminSocket(s: AdminSocket | null): void {
  _sock = s;
}
