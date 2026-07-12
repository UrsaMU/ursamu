import type { IBoard, IPost, IReply } from "./db.ts";

/** Visible column width used by layout helpers (matches cofd / default LayoutFn). */
export const WIDTH = 78;

/** Plain filler lines (no color). Prefer header/divider/footer for display. */
export const EQ_LINE = "=".repeat(WIDTH);
export const DASH_LINE = "-".repeat(WIDTH);

/**
 * Shared layout helpers — same signature and styling as cofd
 * (`packages/cofd/src/support/format.ts`) and the mush LayoutFn contract:
 *   (label?: string, filler?: string | number, width?: number) => string
 *
 * Style: red rule + bold yellow title
 *   %cr===== %cn %ch%cyTitle%cn %cr=======================%cn
 */
export function header(title = "", _filler: string | number = "=", width = 78): string {
  let actualWidth = width;
  let actualFiller = "=";
  if (typeof _filler === "number") {
    actualWidth = _filler;
  } else if (typeof _filler === "string") {
    actualFiller = _filler;
  }
  if (!title) {
    return `%cr${actualFiller.repeat(actualWidth)}%cn`;
  }
  const rightPad = Math.max(0, actualWidth - 7 - title.length);
  return `%cr${actualFiller.repeat(5)}%cn %ch%cy${title}%cn %cr${actualFiller.repeat(rightPad)}%cn`;
}

export function divider(title = "", _filler: string | number = "-", width = 78): string {
  let actualWidth = width;
  let actualFiller = "-";
  if (typeof _filler === "number") {
    actualWidth = _filler;
  } else if (typeof _filler === "string") {
    actualFiller = _filler;
  }
  if (!title) {
    return `%cr${actualFiller.repeat(actualWidth)}%cn`;
  }
  const rightPad = Math.max(0, actualWidth - 7 - title.length);
  return `%cr${actualFiller.repeat(5)}%cn %ch%cy${title}%cn %cr${actualFiller.repeat(rightPad)}%cn`;
}

export function footer(title: string | number = "", _filler: string | number = "=", width = 78): string {
  let actualWidth = width;
  let actualTitle = "";
  let actualFiller = "=";
  if (typeof title === "number") {
    actualWidth = title;
    actualTitle = "";
  } else if (typeof title === "string") {
    actualTitle = title;
    if (typeof _filler === "number") {
      actualWidth = _filler;
    } else if (typeof _filler === "string") {
      actualFiller = _filler;
    }
  }
  if (!actualTitle) {
    return `%cr${actualFiller.repeat(actualWidth)}%cn`;
  }
  const rightPad = Math.max(0, actualWidth - 7 - actualTitle.length);
  return `%cr${actualFiller.repeat(5)}%cn %ch%cy${actualTitle}%cn %cr${actualFiller.repeat(rightPad)}%cn`;
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
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${String(d.getDate()).padStart(2, " ")} ${d.getFullYear()} ${hh}:${mm}:${ss}`;
}

/**
 * Render a single post (or reply) for display.
 * Includes IC/OOC tag, scene link, tags, and sticky marker.
 * Uses the same header/divider/footer chrome as cofd.
 */
export function formatPost(
  board: IBoard,
  post: IPost,
  reply?: IReply,
  msgKey?: string,
): string {
  const msg = reply ?? post;
  const key = msgKey ?? (reply ? `${post.num}.${reply.num}` : String(post.num));
  const author = board.anonymous ? "Anonymous" : msg.authorName;

  const timeStr = (() => {
    try {
      const d = new Date(msg.createdAt);
      return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
    } catch (_e: unknown) {
      return "???";
    }
  })();

  const msgPart   = `Message: ${board.num}/${key}`;
  const authorPart = `Author: ${author}`;
  const datePart  = bbDate(msg.createdAt);
  const gap       = WIDTH - msgPart.length - authorPart.length - datePart.length;
  const g1        = Math.max(Math.floor(gap / 2), 1);
  const g2        = Math.max(gap - g1, 1);
  const infoLine  = msgPart + " ".repeat(g1) + authorPart + " ".repeat(g2) + datePart;

  // Subject line — prepend IC/OOC tag, sticky marker
  const icTag  = reply ? (reply as IReply).icTag : post.icTag;
  let subject  = msg.subject;
  if (msg.editCount) subject += ` (edited x${msg.editCount})`;
  if (icTag) subject = `[${icTag.toUpperCase()}] ${subject}`;
  if (!reply && post.sticky) subject = `[STICKY] ${subject}`;
  const subjLine =
    "%cc" + subject + "%cn" +
    " ".repeat(Math.max(WIDTH - subject.length - timeStr.length, 0)) +
    timeStr;

  // Extra metadata lines
  const extras: string[] = [];
  if (!reply && post.sceneId) extras.push(`%cgLinked scene: #${post.sceneId}%cn`);
  if (!reply && post.tags?.length) extras.push(`%cyTags: ${post.tags.join(", ")}%cn`);

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
