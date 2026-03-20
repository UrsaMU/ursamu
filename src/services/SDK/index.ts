import type { IUrsamuSDK, IDBObj } from "../../@types/UrsamuSDK.ts";
import type { IDBOBJ } from "../../@types/IDBObj.ts";
import type { IContext } from "../../@types/IContext.ts";
import { dbojs, chans, texts, bboards, bboard as bbPosts } from "../Database/index.ts";
import { send as sendFn } from "../broadcast/index.ts";
import { wsService } from "../WebSocket/index.ts";
import { hydrate, evaluateLock } from "../../utils/evaluateLock.ts";
import { canEdit as canEditFn } from "../../utils/canEdit.ts";
import { target as targetFn } from "../../utils/target.ts";
import { displayName as displayNameFn } from "../../utils/displayName.ts";
import { setFlags as setFlagsFn } from "../../utils/setFlags.ts";
import { getAttribute } from "../../utils/getAttribute.ts";
import { getNextId } from "../../utils/getNextId.ts";
import { joinChans } from "../../utils/joinChans.ts";
import { center, ljust, rjust } from "../../utils/format.ts";
import parser from "../parser/parser.ts";
import { setConfig } from "../Config/mod.ts";
import { hash, compare } from "../../../deps.ts";
import { sandboxService } from "../Sandbox/SandboxService.ts";

// --- Formatting utilities (matches worker.ts) ---

const _padStr = (s: string, width: number, align: string, fill = " "): string => {
  const pad = Math.max(0, width - s.length);
  if (align === "right") return fill.repeat(pad) + s;
  if (align === "center") {
    const left = Math.floor(pad / 2);
    return fill.repeat(left) + s + fill.repeat(pad - left);
  }
  return s + fill.repeat(pad);
};

const _getRawVal = (raw: unknown, idx: number): string => {
  if (Array.isArray(raw)) return idx < raw.length ? String(raw[idx]) : "";
  if (raw && typeof raw === "object" && "value" in raw) {
    const v = (raw as { value: unknown }).value;
    return Array.isArray(v) ? (idx < v.length ? String(v[idx]) : "") : String(v);
  }
  return raw != null ? String(raw) : "";
};

const _getRawAlign = (raw: unknown): string => {
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "align" in raw)
    return String((raw as { align: unknown }).align);
  return "left";
};

const sprintf = (fmt: string, ...args: unknown[]): string => {
  let i = 0;
  return fmt.replace(
    /%([+\- ]?)(\d*)(?:\.(\d+))?([sdifebotxX%])/g,
    (_: string, flag: string, width: string, prec: string, spec: string) => {
      if (spec === "%") return "%";
      const arg = args[i++];
      let s: string;
      switch (spec) {
        case "s": s = String(arg ?? ""); break;
        case "d": case "i": s = String(Math.trunc(Number(arg))); break;
        case "f": s = prec !== undefined ? Number(arg).toFixed(Number(prec)) : String(Number(arg)); break;
        case "e": s = prec !== undefined ? Number(arg).toExponential(Number(prec)) : Number(arg).toExponential(); break;
        case "b": s = Number(arg).toString(2); break;
        case "o": s = Number(arg).toString(8); break;
        case "x": s = Number(arg).toString(16); break;
        case "X": s = Number(arg).toString(16).toUpperCase(); break;
        case "t": s = String(Boolean(arg)); break;
        default: s = String(arg ?? "");
      }
      const w = Number(width);
      return w > s.length
        ? flag === "-" ? s + " ".repeat(w - s.length) : " ".repeat(w - s.length) + s
        : s;
    }
  );
};

const templateFn = (
  str: string,
  data?: Record<string, string | string[] | { value: string | string[]; align?: "left" | "right" | "center" }>
): string => {
  if (!data) return str;
  let maxRows = 1;
  for (const v of Object.values(data)) {
    if (Array.isArray(v)) maxRows = Math.max(maxRows, v.length);
    else if (v && typeof v === "object" && "value" in v && Array.isArray(v.value))
      maxRows = Math.max(maxRows, v.value.length);
  }
  const processRow = (rowIdx: number) =>
    str.replace(
      /\[([A-Z])\1*\]|\[([a-z])\2*\]|([a-z])\3+/g,
      (match: string, ucKey: string, lcBracketed: string, lcNoBracket: string) => {
        if (ucKey) return "[" + _padStr(_getRawVal(data[ucKey], rowIdx), match.length - 2, _getRawAlign(data[ucKey])) + "]";
        if (lcBracketed) return _padStr(_getRawVal(data[lcBracketed], rowIdx), match.length, _getRawAlign(data[lcBracketed]));
        return _padStr(_getRawVal(data[lcNoBracket], rowIdx), match.length, _getRawAlign(data[lcNoBracket]));
      }
    );
  const rows: string[] = [];
  for (let i = 0; i < maxRows; i++) rows.push(processRow(i));
  return rows.join("\n");
};

// --- Helpers ---

/** Convert IDBObj (SDK type, Set<string> flags) → minimal IDBOBJ for legacy utilities */
const toRaw = (o: IDBObj): IDBOBJ =>
  ({
    id: o.id,
    flags: Array.from(o.flags).join(" "),
    data: { name: o.name, ...o.state },
    location: o.location || "",
  } as unknown as IDBOBJ);

// --- Main factory ---

export async function createNativeSDK(
  socketId: string,
  actorId: string,
  cmd: { name: string; original?: string; args: string[]; switches?: string[] }
): Promise<IUrsamuSDK> {
  const rawActorResult = await dbojs.queryOne({ id: actorId });
  const rawActor = rawActorResult || null;
  const rawRoom = rawActor?.location
    ? await dbojs.queryOne({ id: rawActor.location }).then((r) => r || null)
    : null;

  const me: IDBObj = rawActor
    ? hydrate(rawActor)
    : { id: actorId, flags: new Set<string>(), state: {}, contents: [] };

  const hereBase: IDBObj = rawRoom
    ? hydrate(rawRoom)
    : { id: "limbo", flags: new Set<string>(), state: {}, contents: [] };

  const here = {
    ...hereBase,
    broadcast: (message: string, options?: Record<string, unknown>) => {
      const exclude = (options?.exclude as string[]) || [];
      sendFn([`#${hereBase.id}`], message, options, exclude);
    },
  };

  const getConnSocket = () =>
    wsService.getConnectedSockets().find((s) => s.id === socketId);

  const u: IUrsamuSDK = {
    state: (rawActor && (rawActor.data?.state as Record<string, unknown>)) || {},
    socketId,
    me,
    here,
    target: undefined,

    ui: {
      panel: () => null,
      render: (tpl: string, ctx: Record<string, unknown>) =>
        tpl.replace(/\{\{(.+?)\}\}/g, (_, k) => String(ctx[k.trim()] ?? "")),
      layout: () => {},
    },

    util: {
      displayName: (obj: IDBObj, actor: IDBObj) =>
        displayNameFn(toRaw(actor), toRaw(obj)),
      target: async (actor: IDBObj, query: string, global?: boolean) => {
        const result = await targetFn(toRaw(actor), query, global);
        return result ? hydrate(result) : undefined;
      },
      center: (str: string, len: number, filler?: string) => center(str, len, filler),
      ljust: (str: string, len: number, filler?: string) => ljust(str, len, filler),
      rjust: (str: string, len: number, filler?: string) => rjust(str, len, filler),
      template: templateFn,
      sprintf,
      stripSubs: (str: string) => parser.stripSubs("telnet", str),
    },

    db: {
      search: async (query: string | Record<string, unknown>) => {
        const results = await dbojs.query(query as Record<string, unknown>);
        return results.map(hydrate);
      },
      create: async (template: Partial<IDBObj>) => {
        const id = await getNextId("objid");
        const rawFlags = Array.from(template.flags || new Set<string>()).join(" ");
        await dbojs.create({
          id,
          flags: rawFlags,
          location: template.location,
          data: { name: template.name, ...template.state },
        });
        const created = await dbojs.queryOne({ id });
        return created
          ? hydrate(created)
          : { id, flags: new Set<string>(), state: {}, contents: [] };
      },
      destroy: async (id: string) => {
        await dbojs.delete({ id });
      },
      modify: async (id: string, op: string, data: unknown) => {
        await dbojs.modify({ id }, op, data as Partial<import("../../@types/IDBObj.ts").IDBOBJ>);
      },
    },

    cmd,

    canEdit: async (actor: IDBObj, target: IDBObj) =>
      await canEditFn(toRaw(actor), toRaw(target)),

    send: (message: string, target?: string, options?: Record<string, unknown>) => {
      sendFn([target || socketId], message, options);
    },

    broadcast: (message: string, options?: Record<string, unknown>) => {
      const exclude = (options?.exclude as string[]) || [];
      if (rawActor && rawActor.location) {
        sendFn([`#${rawActor.location}`], message, options, exclude);
      }
    },

    execute: async (command: string) => {
      const socket = getConnSocket();
      if (socket) {
        const { cmdParser } = await import("../commands/cmdParser.ts");
        await cmdParser.run({ socket, msg: command });
      }
    },

    force: async (command: string) => {
      const socket = getConnSocket();
      if (socket) {
        const { cmdParser } = await import("../commands/cmdParser.ts");
        await cmdParser.run({ socket, msg: command });
      }
    },

    teleport: async (targetStr: string, destination: string) => {
      const tarObj =
        (await dbojs.queryOne({ id: targetStr })) ||
        (await dbojs.queryOne({ "data.name": new RegExp(`^${targetStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, "i") }));
      if (!tarObj) return;
      tarObj.location = destination;
      await dbojs.modify({ id: tarObj.id }, "$set", tarObj);
    },

    checkLock: async (target: string | IDBObj, lock: string) => {
      const targetId = typeof target === "string" ? target : target.id;
      const tarObj = await dbojs.queryOne({ id: targetId });
      if (!tarObj) return false;
      return await evaluateLock(lock, me, hydrate(tarObj));
    },

    auth: {
      verify: async (name: string, password: string) => {
        const player = await dbojs.queryOne({
          "data.name": new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, "i"),
          flags: /player/i,
        });
        if (!player || !player.data?.password) return false;
        return await compare(password, String(player.data.password));
      },
      login: async (id: string) => {
        const playerResult = await dbojs.queryOne({ id });
        const player = playerResult || null;
        if (!player) return;
        const socket = getConnSocket();
        if (!socket) return;
        socket.cid = id;
        socket.join(`#${id}`);
        if (player.location) socket.join(`#${player.location}`);
        const ctx: IContext = { socket };
        await joinChans(ctx);
      },
      hash: async (password: string) => {
        try { return await hash(password, 10); }
        catch (e) { console.error("[SDK] hash error:", e); throw e; }
      },
      setPassword: async (id: string, password: string) => {
        const hashed = await hash(password, 10);
        const objResult = await dbojs.queryOne({ id });
        const obj = objResult || null;
        if (!obj) return;
        obj.data ||= {};
        obj.data.password = hashed;
        await dbojs.modify({ id }, "$set", obj);
      },
    },

    sys: {
      setConfig: async (key: string, value: unknown) => {
        setConfig(key, value);
        await Promise.resolve();
      },
      disconnect: async (id: string) => {
        wsService.disconnect(id);
        await Promise.resolve();
      },
      reboot: async () => {
        // Exit with code 75 — start.ts recognises this as a reboot request and restarts main
        // without touching the telnet process.
        setTimeout(() => Deno.exit(75), 500);
        await Promise.resolve();
      },
      shutdown: async () => {
        setTimeout(() => Deno.exit(0), 100);
        await Promise.resolve();
      },
      uptime: () => Promise.resolve(performance.now()),
      update: (_branch?: string) => Promise.resolve(),
    },

    chan: {
      join: async (_channel: string, _alias: string) => {
        await Promise.resolve();
      },
      leave: async (_alias: string) => {
        await Promise.resolve();
      },
      list: async () => {
        return await chans.all();
      },
      create: async (
        name: string,
        options?: { header?: string; lock?: string; hidden?: boolean }
      ) => {
        const id = await getNextId("chanid");
        const chan = { id, name, alias: name.slice(0, 2), ...options };
        await chans.create(chan as Parameters<typeof chans.create>[0]);
        return await chans.queryOne({ id });
      },
      destroy: async (name: string) => {
        return await chans.delete({ name });
      },
      set: async (
        name: string,
        options: {
          header?: string;
          lock?: string;
          hidden?: boolean;
          masking?: boolean;
        }
      ) => {
        return await chans.modify({ name }, "$set", options);
      },
    },

    setFlags: async (target: string | IDBObj, flagStr: string) => {
      const targetId = typeof target === "string" ? target : target.id;
      const tarObj = await dbojs.queryOne({ id: targetId });
      if (!tarObj) return;
      await setFlagsFn(tarObj, flagStr, rawActor || undefined);
    },

    trigger: async (targetStr: string, attr: string, args?: string[]) => {
      const tarObj = await dbojs.queryOne({ id: targetStr });
      if (!tarObj) return;
      const attrData = await getAttribute(tarObj as unknown as IDBOBJ, attr);
      if (!attrData) return;
      await sandboxService.runScript(attrData.value, {
        id: tarObj.id,
        location: tarObj.location || "limbo",
        state: (tarObj.data?.state as Record<string, unknown>) || {},
        ...(args?.[0] ? { target: { id: args[0] } } : {}),
      });
    },

    text: {
      read: async (id: string) => {
        const entry = await texts.queryOne({ id });
        return String((entry as unknown as Record<string, unknown>)?.content || "");
      },
      set: async (id: string, content: string) => {
        const existing = await texts.queryOne({ id });
        if (existing) {
          await texts.modify({ id }, "$set", { content });
        } else {
          await texts.create({ id, content } as Parameters<typeof texts.create>[0]);
        }
      },
    },

    bb: {
      listBoards: async () => {
        const boards = await bboards.all();
        boards.sort((a, b) => (a.order || 0) - (b.order || 0));
        const player = rawActor ? await dbojs.queryOne({ id: rawActor.id }) : null;
        const lastRead = ((player && player.data?.bbLastRead) as Record<string, number>) || {};
        return await Promise.all(boards.map(async (b) => {
          const posts = await bbPosts.query({ board: b.id });
          const lastReadNum = lastRead[b.id] || 0;
          return {
            id: b.id,
            name: b.name,
            description: b.description,
            order: b.order,
            postCount: posts.length,
            newCount: posts.filter((p) => p.num > lastReadNum).length,
          };
        }));
      },

      listPosts: async (boardId: string) => {
        const posts = await bbPosts.query({ board: boardId });
        posts.sort((a, b) => a.num - b.num);
        return posts;
      },

      readPost: async (boardId: string, postNum: number) => {
        const post = await bbPosts.queryOne({ board: boardId, num: postNum });
        return post || null;
      },

      post: async (boardId: string, subject: string, body: string) => {
        const board = await bboards.queryOne({ id: boardId });
        if (!board) return { error: "Board not found." };
        const posts = await bbPosts.query({ board: boardId });
        const num = posts.length > 0
          ? Math.max(...posts.map((p) => p.num)) + 1
          : 1;
        const author = rawActor?.id || "0";
        const authorName = (rawActor && rawActor.data?.name) || author;
        const id = crypto.randomUUID();
        const post = await bbPosts.create({ id, board: boardId, num, subject, body, author, authorName, date: Date.now() });
        return { id: post.id };
      },

      editPost: async (boardId: string, postNum: number, body: string) => {
        const post = await bbPosts.queryOne({ board: boardId, num: postNum });
        if (!post) return;
        await bbPosts.modify({ id: post.id }, "$set", { body, edited: Date.now() });
      },

      deletePost: async (boardId: string, postNum: number) => {
        const post = await bbPosts.queryOne({ board: boardId, num: postNum });
        if (post) await bbPosts.delete({ id: post.id });
      },

      createBoard: async (name: string, options?: { description?: string; order?: number }) => {
        const id = name.trim().toLowerCase().replace(/\s+/g, "-");
        const existing = await bboards.queryOne({ id });
        if (existing) return { error: "Board already exists." };
        const allBoards = await bboards.query({});
        const order = options?.order ?? (allBoards.length + 1);
        const board = await bboards.create({ id, name: name.trim(), description: options?.description, order });
        return { id: board.id, name: board.name };
      },

      destroyBoard: async (boardId: string) => {
        await bboards.delete({ id: boardId });
        await bbPosts.delete({ board: boardId });
      },

      markRead: async (boardId: string) => {
        if (!rawActor) return;
        const posts = await bbPosts.query({ board: boardId });
        const maxNum = posts.reduce((m, p) => Math.max(m, p.num), 0);
        const player = await dbojs.queryOne({ id: rawActor.id });
        if (player) {
          player.data ||= {};
          const lastRead = (player.data.bbLastRead as Record<string, number>) || {};
          lastRead[boardId] = maxNum;
          player.data.bbLastRead = lastRead;
          await dbojs.modify({ id: player.id }, "$set", player);
        }
      },

      newPostCount: async (boardId: string) => {
        if (!rawActor) return 0;
        const player = await dbojs.queryOne({ id: rawActor.id });
        const lastRead = ((player && player.data?.bbLastRead) as Record<string, number>) || {};
        const lastReadNum = lastRead[boardId] || 0;
        const posts = await bbPosts.query({ board: boardId });
        return posts.filter((p) => p.num > lastReadNum).length;
      },

      totalNewCount: async () => {
        if (!rawActor) return 0;
        const player = await dbojs.queryOne({ id: rawActor.id });
        const lastRead = ((player && player.data?.bbLastRead) as Record<string, number>) || {};
        const boards = await bboards.query({});
        let total = 0;
        for (const board of boards) {
          const lastReadNum = lastRead[board.id] || 0;
          const posts = await bbPosts.query({ board: board.id });
          total += posts.filter((p) => p.num > lastReadNum).length;
        }
        return total;
      },
    },

    events: {
      emit: async (_event: string, _data: unknown, _context?: Record<string, unknown>) => {
        await Promise.resolve();
      },
      on: (_event: string, _handler: string): Promise<string> => Promise.resolve(""),
    },
  };

  return u;
}
