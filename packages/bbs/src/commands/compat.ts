/**
 * Myrddin command gaps: +bbnew, +bbscan, +bbversion, +bbhelp,
 * +bbcolors, +bbanon. UX parity only.
 */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import {
  getAllBoards,
  findBoard,
} from "../query.ts";
import { canRead } from "../permissions.ts";
import { getUnreadCount, isMember } from "../tracking.ts";
import { header, divider, footer } from "../display.ts";
import { BBS_VERSION, BBS_CODENAME } from "../version.ts";
import { boards } from "../db.ts";
import { isStaff } from "../permissions.ts";
import { collectUnreadRows } from "../unread-list.ts";

addCmd({
  name: "+bbnew",
  pattern: /^\+?bbnew(?:\s+(\S+))?/i,
  lock: "connected",
  category: "BBS",
  help: `+bbnew [<#>]  — List unread messages (does not mark read).

No args: all joined boards with unread. With board: that board only.

Examples:
  +bbnew       Unread on every joined board.
  +bbnew 2     Unread on board 2 only.`,
  exec: async (u: IUrsamuSDK) => {
    const boardStr = (u.cmd.args[0] ?? "").trim();
    const rows = await collectUnreadRows(u, boardStr);
    if (!rows.length) {
      u.send("%ch>BBS:%cn No unread messages.");
      return;
    }
    const lines = [
      header("BBS Unread"),
      "  " + "Msg".padEnd(10) + "Subject".padEnd(36) +
        "Posted".padEnd(10) + "By",
      divider(),
      ...rows,
      footer(),
    ];
    u.send(lines.join("\n"));
  },
});

addCmd({
  name: "+bbscan",
  pattern: /^\+?bbscan$/i,
  lock: "connected",
  category: "BBS",
  help: `+bbscan  — Compact unread counts for boards you can read.

Examples:
  +bbscan    Show unread per board.`,
  exec: async (u: IUrsamuSDK) => {
    const allBoards = await getAllBoards();
    const lines = [
      header("BBS Scan"),
      "  " + "#".padStart(3) + "  " +
        "Board".padEnd(28) + "Unread",
      divider(),
    ];
    let any = false;
    for (const board of allBoards) {
      if (!(await canRead(u, board))) continue;
      if (!isMember(u, board.num)) continue;
      const n = await getUnreadCount(u, board.num);
      any = true;
      const mark = n > 0
        ? `%ch%cy${String(n).padStart(4)}%cn`
        : "   0";
      lines.push(
        `  ${String(board.num).padStart(3)}  ` +
          `%cc${board.title.padEnd(28).slice(0, 28)}%cn ` +
          mark,
      );
    }
    if (!any) {
      u.send("%ch>BBS:%cn No accessible boards.");
      return;
    }
    lines.push(footer());
    u.send(lines.join("\n"));
  },
});

addCmd({
  name: "+bbversion",
  pattern: /^\+?bbversion$/i,
  lock: "connected",
  category: "BBS",
  help: `+bbversion  — Show BBS package version.

Examples:
  +bbversion`,
  exec: (u: IUrsamuSDK) => {
    u.send(
      `%ch>BBS:%cn UrsaMU BBS v${BBS_VERSION} ` +
        `(${BBS_CODENAME}). +help bbs`,
    );
    return Promise.resolve();
  },
});

addCmd({
  name: "+bbhelp",
  pattern: /^\+?bbhelp(?:\s+(.*))?$/i,
  lock: "connected",
  category: "BBS",
  help: `+bbhelp [<topic>]  — BBS help (alias for +help bbs).

Examples:
  +bbhelp
  +bbhelp reading`,
  exec: (u: IUrsamuSDK) => {
    const rest = (u.cmd.args[0] ?? "").trim();
    const topic = rest ? `bbs/${rest}` : "bbs";
    u.send(
      `%ch>BBS:%cn Type %chhelp ${topic}%cn ` +
        `(or %chhelp bbs%cn for the index).`,
    );
    return Promise.resolve();
  },
});

addCmd({
  name: "+bbcolors",
  pattern: /^\+?bbcolors?(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "BBS",
  help: `+bbcolors  — BBS color / layout notes.

Myrddin +bbcolor themes map to engine game.layout chrome
on UrsaMU (not per-player BBS palettes).

Examples:
  +bbcolors`,
  exec: (u: IUrsamuSDK) => {
    u.send(
      [
        header("BBS Colors"),
        "  Listing chrome uses game.layout " +
          "header/divider/footer.",
        "  Set templates in config under game.layout.",
        "  Per-player Myrddin +bbcolor themes are not " +
          "ported;",
        "  board text uses standard %c codes in posts.",
        divider(),
        "  SEE ALSO: +help bbs, game.layout (mush)",
        footer(),
      ].join("\n"),
    );
    return Promise.resolve();
  },
});

addCmd({
  name: "+bbanon",
  pattern: /^\+?bbanon\s+(\S+)=(on|off)/i,
  lock: "connected admin+",
  category: "BBS Staff",
  help: `+bbanon <#>=on|off  — Toggle anonymous posters on a board.

Examples:
  +bbanon 2=on     Hide author names on board 2.
  +bbanon 2=off    Show author names.`,
  exec: async (u: IUrsamuSDK) => {
    if (!isStaff(u)) {
      u.send("%ch>BBS:%cn Staff only.");
      return;
    }
    const { board, error } = await findBoard(
      (u.cmd.args[0] ?? "").trim(),
    );
    if (!board) {
      u.send(`%ch>BBS:%cn ${error}`);
      return;
    }
    const on = (u.cmd.args[1] ?? "").toLowerCase() === "on";
    await boards.modify({ id: board.id }, "$set", {
      anonymous: on,
    });
    u.send(
      `%ch>BBS:%cn ${board.title} anonymous posting ` +
        `${on ? "enabled" : "disabled"}.`,
    );
  },
});
