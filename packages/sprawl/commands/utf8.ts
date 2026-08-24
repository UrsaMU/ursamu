import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  ARR,
  ERR,
  OK,
  divider,
  footer,
  gauge,
  header,
  panelClose,
  panelOpen,
  pill,
  runWithMode,
  val,
} from "./chrome.ts";
addCmd({
  name: "+utf8",
  pattern: /^\+utf8\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+utf8 [on|off]  — Toggle UTF-8 glyphs for gauges.

Panel borders use engine header/footer (game.layout).
UTF-8 mode only affects gauge pip characters.

Examples:
  +utf8        Show status and samples.
  +utf8 on     Enable UTF-8 gauge glyphs.
  +utf8 off    Latin-1 safe mode (default).`,

  exec: async (u: IUrsamuSDK) => {
    const arg = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const isOn = u.me.flags.has("utf8");

    if (arg === "on") {
      if (isOn) {
        u.send(`${ARR}UTF-8 mode is already on.`);
        return;
      }
      await u.setFlags(u.me, "+utf8");
      u.send(
        `${OK}UTF-8 glyphs on. Try ${val("+sheet")}.`,
      );
      return;
    }

    if (arg === "off") {
      if (!isOn) {
        u.send(`${ARR}UTF-8 mode is already off.`);
        return;
      }
      await u.setFlags(u.me, "-utf8");
      u.send(`${OK}UTF-8 glyphs off. Latin-1 mode.`);
      return;
    }

    if (arg && arg !== "show") {
      u.send(`${ERR}Usage: ${val("+utf8 [on|off]")}.`);
      return;
    }

    const status = isOn
      ? pill("ENABLED", "ok")
      : pill("DISABLED", "info");
    const sampleAscii = runWithMode("ascii", () =>
      [
        panelOpen("SAMPLE", "ASCII"),
        `  Res ${gauge(8, 12)}  8 / 12`,
        divider("ACTIONS"),
        panelClose("EOF"),
      ].join("\r\n")
    );
    const sampleUtf8 = runWithMode("utf8", () =>
      [
        panelOpen("SAMPLE", "UTF-8"),
        `  Res ${gauge(8, 12)}  8 / 12`,
        divider("ACTIONS"),
        panelClose("EOF"),
      ].join("\r\n")
    );

    u.send(
      [
        header("UTF-8 GLYPH MODE"),
        `  Status: ${status}`,
        `  Toggle: ${val("+utf8 on")} / ${val("+utf8 off")}`,
        "",
        sampleAscii,
        "",
        sampleUtf8,
        footer(),
      ].join("\r\n"),
    );
  },
});
