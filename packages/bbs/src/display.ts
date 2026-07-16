import type { IBoard, IPost, IReply } from "./db.ts";
import {
  header as engHeader,
  divider as engDivider,
  footer as engFooter,
} from "@ursamu/mush";

/** Visible column width used by layout helpers. */
export const WIDTH = 78;

/** Plain filler lines (no color). Prefer header/divider/footer for display. */
export const EQ_LINE = "=".repeat(WIDTH);
export const DASH_LINE = "-".repeat(WIDTH);

/**
 * Layout helpers — re-export engine chrome so BBS follows
 * game.layout.* mushcode templates and registerHeader stacks.
 *
 * Signature matches LayoutFn plus a number-as-2nd-arg overload
 * used in a few call sites: header(title, width).
 */
function normalize(
  title: string | number = "",
  filler: string | number = "=",
  width = 78,
  defaultFiller: string,
): { title: string; filler: string; width: number } {
  let t = "";
  let f = defaultFiller;
  let w = width;
  if (typeof title === "number") {
    w = title;
  } else {
    t = title;
    if (typeof filler === "number") {
      w = filler;
    } else if (typeof filler === "string") {
      f = filler;
    }
  }
  return { title: t, filler: f, width: w };
}

export function header(
  title: string | number = "",
  filler: string | number = "=",
  width = 78,
): string {
  const n = normalize(title, filler, width, "=");
  return engHeader(n.title, n.filler, n.width);
}

export function divider(
  title: string | number = "",
  filler: string | number = "-",
  width = 78,
): string {
  const n = normalize(title, filler, width, "-");
  return engDivider(n.title, n.filler, n.width);
}

export function footer(
  title: string | number = "",
  filler: string | number = "=",
  width = 78,
): string {
  const n = normalize(title, filler, width, "=");
  return engFooter(n.title, n.filler, n.width);
}

export function bbDate(epoch: number): string {
  const d = new Date(epoch);
  if (isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}-${dd}-${yy}`;
}

export function formatTimeFull(epoch: number): string {
  const d = new Date(epoch);
  if (isNaN(d.getTime())) return "???";
  const days = [
    "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
  ];
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return (
    `${days[d.getDay()]} ${months[d.getMonth()]} ` +
    `${String(d.getDate()).padStart(2, " ")} ` +
    `${d.getFullYear()} ${hh}:${mm}:${ss}`
  );
}

/**
 * Render a single post (or reply) for display.
 * Includes IC/OOC tag, scene link, tags, and sticky marker.
 * Uses engine header/divider/footer (honors game.layout).
 */
export function formatPost(
  board: IBoard,
  post: IPost,
  reply?: IReply,
  msgKey?: string,
): string {
  const msg = reply ?? post;
  const key = msgKey ??
    (reply ? `${post.num}.${reply.num}` : String(post.num));
  const author = board.anonymous ? "Anonymous" : msg.authorName;

  const timeStr = (() => {
    try {
      const d = new Date(msg.createdAt);
      return (
        `${String(d.getHours()).padStart(2, "0")}:` +
        `${String(d.getMinutes()).padStart(2, "0")}:` +
        `${String(d.getSeconds()).padStart(2, "0")}`
      );
    } catch (_e: unknown) {
      return "???";
    }
  })();

  const msgPart = `Message: ${board.num}/${key}`;
  const authorPart = `Author: ${author}`;
  const datePart = bbDate(msg.createdAt);
  const gap =
    WIDTH - msgPart.length - authorPart.length - datePart.length;
  const g1 = Math.max(Math.floor(gap / 2), 1);
  const g2 = Math.max(gap - g1, 1);
  const infoLine =
    msgPart + " ".repeat(g1) + authorPart +
    " ".repeat(g2) + datePart;

  const icTag = reply ? (reply as IReply).icTag : post.icTag;
  let subject = msg.subject;
  if (msg.editCount) subject += ` (edited x${msg.editCount})`;
  if (icTag) subject = `[${icTag.toUpperCase()}] ${subject}`;
  if (!reply && post.sticky) subject = `[STICKY] ${subject}`;
  const subjLine =
    "%cc" + subject + "%cn" +
    " ".repeat(
      Math.max(WIDTH - subject.length - timeStr.length, 0),
    ) +
    timeStr;

  const extras: string[] = [];
  if (!reply && post.sceneId) {
    extras.push(`%cgLinked scene: #${post.sceneId}%cn`);
  }
  if (!reply && post.tags?.length) {
    extras.push(`%cyTags: ${post.tags.join(", ")}%cn`);
  }

  const lines = [
    header(board.title),
    infoLine,
    subjLine,
    ...(extras.length ? [divider(), ...extras] : []),
    divider(),
    msg.body,
    footer(),
  ];
  return lines.join("\n");
}
