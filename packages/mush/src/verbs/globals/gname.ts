/**
 * +gname — gradient moniker via space-separated color stops.
 * Thin companion to +gradient (comma-separated).
 */
import { addCmd } from "../../commands/addCmd.ts";
import type { IUrsamuSDK } from "../../commands/types.ts";
import {
  parseColor,
  gradientText,
  type Rgb,
} from "../gradient-colors.ts";

function actorName(u: IUrsamuSDK): string {
  const raw = String(u.me.state?.name || u.me.name || "Unknown");
  return u.util.stripSubs(raw).trim() || "Unknown";
}

export async function execGName(u: IUrsamuSDK): Promise<void> {
  const raw = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
  const name = actorName(u);

  if (!raw) {
    const current = String(u.me.state?.moniker || "");
    if (!current) {
      u.send(`No gradient set. Name displays as: ${name}`);
      return;
    }
    u.send(`Current moniker: ${current}`);
    return;
  }

  const lower = raw.toLowerCase();
  if (lower === "reset" || lower === "clear") {
    await u.db.modify(u.me.id, "$unset", { "data.moniker": "" });
    u.send(`Moniker cleared. Name displays as: ${name}`);
    return;
  }

  const stopsRaw = raw.split(/\s+/).filter(Boolean);
  if (stopsRaw.length < 2) {
    u.send("Usage: +gname <color1> <color2> [<color3> ...]");
    return;
  }

  const stops: Rgb[] = [];
  for (const p of stopsRaw) {
    const rgb = parseColor(p);
    if (!rgb) {
      u.send(
        `Unknown color '${p}'. Use hex (#ff00aa) or a name ` +
          `(red, gold, cyan…).`,
      );
      return;
    }
    stops.push(rgb);
  }

  const moniker = gradientText(name, stops);
  await u.db.modify(u.me.id, "$set", { "data.moniker": moniker });
  u.send(`Moniker set. Preview: ${moniker}`);
}

addCmd({
  name: "+gname",
  pattern: /^\+gname(?:\s+(.*))?$/i,
  lock: "connected",
  category: "Profile",
  help: `+gname <c1> <c2> [<c3> ...]  — Gradient @moniker.

Space-separated colors (see also +gradient with commas).
  +gname reset   Clear moniker.
  +gname         Show current moniker.

Examples:
  +gname gold red
  +gname #ff0000 #00ff00 #0000ff
  +gname reset`,
  exec: execGName,
});
