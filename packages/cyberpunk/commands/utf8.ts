/**
 * +utf8 -- Toggle UTF-8 glyph rendering for the runner.
 *
 * Sets/clears the `utf8` flag on the player. Middleware in commands.ts reads
 * the flag before each command runs and switches display helpers to the
 * UTF-8 glyph table (box-drawing + block elements) or the Latin-1 default.
 */
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  ARR, ERR, OK, bar, hdr, val, dim,
  frameTop, frameBot, scan, pill, gauge, runWithMode,
} from "./chargen.ts";

addCmd({
  name: "+utf8",
  pattern: /^\+utf8\s*(.*)/i,
  lock: "connected",
  category: "Preferences",
  help: `+utf8 [on|off]  -- Enable enhanced UTF-8 glyphs for your client.

When enabled, frames, gauges, and dividers use Unicode box-drawing and
block characters for a richer retro-future terminal look. Disable for
Latin-1 compatibility with older clients.

Examples:
  +utf8           Show your current setting plus side-by-side samples.
  +utf8 on        Enable UTF-8 glyphs.
  +utf8 off       Revert to Latin-1 (default).`,

  exec: async (u: IUrsamuSDK) => {
    const arg = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const isOn = u.me.flags.has("utf8");

    if (arg === "on") {
      if (isOn) { u.send(`${ARR}UTF-8 mode is already enabled.`); return; }
      await u.setFlags(u.me, "+utf8");
      u.send(`${OK}UTF-8 glyphs enabled. Type ${val("+sheet")} to see the new look.`);
      return;
    }

    if (arg === "off") {
      if (!isOn) { u.send(`${ARR}UTF-8 mode is already disabled.`); return; }
      await u.setFlags(u.me, "-utf8");
      u.send(`${OK}UTF-8 glyphs disabled. Reverting to Latin-1.`);
      return;
    }

    if (arg && arg !== "show") {
      u.send(`${ERR}Usage: ${val("+utf8 [on|off]")}.`);
      return;
    }

    // Show: render the same sample block in both modes.
    const status = isOn ? pill("ENABLED", "ok") : pill("DISABLED", "info");
    const sampleAscii = runWithMode("ascii", () => [
      frameTop({ title: "SAMPLE", right: "ASCII" }),
      scan(),
      `  ${ARR}HP gauge ........... ${gauge(40, 50)}  40 / 50`,
      `  ${ARR}Divider below:`,
      hdr("ACTIONS"),
      frameBot({ right: "EOF" }),
    ].join("\r\n"));
    const sampleUtf8 = runWithMode("utf8", () => [
      frameTop({ title: "SAMPLE", right: "UTF-8" }),
      scan(),
      `  ${ARR}HP gauge ........... ${gauge(40, 50)}  40 / 50`,
      `  ${ARR}Divider below:`,
      hdr("ACTIONS"),
      frameBot({ right: "EOF" }),
    ].join("\r\n"));

    u.send([
      bar(),
      hdr("UTF-8 GLYPH MODE"),
      bar(),
      `  ${ARR}Status: ${status}`,
      `  ${ARR}Toggle with ${val("+utf8 on")} or ${val("+utf8 off")}.`,
      "",
      dim("  --- Latin-1 (default) sample ---"),
      sampleAscii,
      "",
      dim("  --- UTF-8 sample ---"),
      sampleUtf8,
      bar(),
    ].join("\r\n"));
  },
});
