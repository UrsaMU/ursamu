/**
 * +chat — toggle web play chat bubbles for say/pose.
 * Pref stored on player: data.webChat (default on).
 */
import { addCmd } from "../../commands/addCmd.ts";
import type { IUrsamuSDK } from "../../commands/types.ts";

/** Default on when unset. */
export function isWebChatEnabled(
  state: Record<string, unknown> | null | undefined,
): boolean {
  const v = state?.webChat;
  if (v === false || v === "off" || v === 0 || v === "0") {
    return false;
  }
  return true;
}

export async function execChat(u: IUrsamuSDK): Promise<void> {
  const raw = u.util.stripSubs
    ? u.util.stripSubs(u.cmd.args[0] ?? "")
    : (u.cmd.args[0] ?? "");
  const arg = String(raw).trim().toLowerCase();
  const on = isWebChatEnabled(
    (u.me.state ?? {}) as Record<string, unknown>,
  );

  if (!arg || arg === "status" || arg === "show") {
    u.send(
      on
        ? "%chChat>%cn Web chat bubbles are %chON%cn. " +
          "(%ch+chat off%cn to use classic say lines.)"
        : "%chChat>%cn Web chat bubbles are %chOFF%cn. " +
          "(%ch+chat on%cn to enable.)",
    );
    return;
  }

  if (arg === "on" || arg === "yes" || arg === "1" || arg === "true") {
    await u.db.modify(u.me.id, "$set", { "data.webChat": true });
    u.send("%chChat>%cn Web chat bubbles %chON%cn.");
    return;
  }

  if (
    arg === "off" || arg === "no" || arg === "0" || arg === "false"
  ) {
    await u.db.modify(u.me.id, "$set", { "data.webChat": false });
    u.send(
      "%chChat>%cn Web chat bubbles %chOFF%cn " +
        "(classic say lines on web).",
    );
    return;
  }

  if (arg === "toggle") {
    const next = !on;
    await u.db.modify(u.me.id, "$set", { "data.webChat": next });
    u.send(
      next
        ? "%chChat>%cn Web chat bubbles %chON%cn."
        : "%chChat>%cn Web chat bubbles %chOFF%cn.",
    );
    return;
  }

  u.send("Usage: +chat [on|off|toggle|status]");
}

addCmd({
  name: "+chat",
  pattern: /^\+chat(?:\s+(.*))?$/i,
  lock: "connected",
  category: "General",
  help: `+chat [on|off|toggle|status]  — Web play chat bubbles.

When ON (default), say/pose on /play show avatar, name, time,
and message. When OFF, web gets the same plain text as telnet.

Examples:
  +chat
  +chat on
  +chat off`,
  exec: execChat,
});
