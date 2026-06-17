import type { IBoard, IPost, IReply } from "./db.ts";

export const WIDTH = 77;
export const EQ_LINE = "=".repeat(WIDTH);
export const DASH_LINE = "-".repeat(WIDTH);

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

/** Centered `=` header with optional color. */
export function header(title: string): string {
  const t = ` ${title} `;
  const pad = Math.floor((WIDTH - t.length) / 2);
  return "=".repeat(pad) + t + "=".repeat(WIDTH - pad - t.length);
}

/**
 * Render a single post (or reply) for display.
 * Includes IC/OOC tag, scene link, tags, and sticky marker.
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

  // Board title header
  const core = ` ${board.title} `;
  const totalPad = WIDTH - core.length;
  const leftPad = Math.ceil(totalPad / 2);
  const rightPad = totalPad - leftPad;
  const topBar =
    "%cb" + "=".repeat(leftPad) + "%cg" + core + "%cb" + "=".repeat(rightPad) + "%cn";

  const timeStr = (() => {
    try {
      const d = new Date(msg.createdAt);
      return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
    } catch {
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
    topBar,
    infoLine,
    subjLine,
    ...(extras.length ? ["%cb" + DASH_LINE + "%cn", ...extras] : []),
    "%cb" + DASH_LINE + "%cn",
    msg.body,
    "%cb" + EQ_LINE + "%cn",
  ];
  return lines.join("\n");
}
