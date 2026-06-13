import "./commands.ts";
import { gameHooks, registerPluginRoute, registerHeader, registerDivider, registerFooter, unregisterHeader, unregisterDivider, unregisterFooter } from "jsr:@ursamu/ursamu";
import type { IPlugin, SessionEvent, LayoutFn } from "jsr:@ursamu/ursamu";
import { registerHelpDir } from "jsr:@ursamu/help-plugin";
import { mektonSystem } from "./game-system.ts";
import { chars } from "./schema.ts";
import { routeHandler } from "./routes.ts";

const visLen = (s: string) => s.replace(/%c[a-zA-Z]/g, "").replace(/%[nrtbR]/g, "").length;
const padCenter = (s: string, w: number, fill = " ") => {
  const pad = w - visLen(s);
  if (pad <= 0) return s;
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return fill.repeat(left) + s + fill.repeat(right);
};

const sciFiHeader: LayoutFn = (string = "", filler = "=", width = 78) => {
  const innerWidth = width - 4;
  const ruleTop = "%ch%cc//" + filler.repeat(innerWidth) + "\\\\%cn";
  const ruleBottom = "%ch%cc\\\\" + filler.repeat(innerWidth) + "//%cn";
  if (!string) return ruleTop;
  const centeredTitle = padCenter(`%ch%cy[ ${string} ]%cn`, innerWidth, " ");
  return `${ruleTop}\n%ch%cc::%cn${centeredTitle}%ch%cc::%cn\n${ruleBottom}`;
};

const sciFiDivider: LayoutFn = (string = "", filler = "-", width = 78) => {
  const innerWidth = width - 4;
  if (!string) return "%ch%cc//" + filler.repeat(innerWidth) + "\\\\%cn";
  const centeredTitle = padCenter(`%ch%cy:: ${string} ::%cn`, innerWidth, filler);
  return `\n%ch%cc//%cn${centeredTitle}%ch%cc\\\\%cn\n`;
};

const sciFiFooter: LayoutFn = (string = "", filler = "=", width = 78) => {
  const innerWidth = width - 4;
  const rule = "%ch%cc\\\\" + filler.repeat(innerWidth) + "//%cn";
  if (!string) return rule;
  const centeredTitle = padCenter(`%ch%cy[ ${string} ]%cn`, innerWidth, " ");
  return `${rule}\n%ch%cc::%cn${centeredTitle}%ch%cc::%cn\n${rule}`;
};

// ── Login hook — remind players of outstanding chargen tasks ─────────────────
const onLogin = async ({ actorId, actorName }: SessionEvent) => {
  const char = await chars.findOne({ playerId: actorId });
  if (!char) return;
  if (char.chargenStatus === "draft" || char.chargenStatus === "revision") {
    // Soft reminder — send via gameHooks so we don't need a socket reference
    const note = char.chargenStatus === "revision" && char.reviewNote
      ? `Revision required: ${char.reviewNote}`
      : "Chargen in progress.";
    gameHooks.emit("player:notify" as never, { actorId, actorName, message: `[Mekton] ${note} Use %ch+chargen%cn to continue.` });
  }
  // Refresh luck at session start if approved
  if (char.chargenStatus === "approved" && char.luckRemaining < char.stats.luck) {
    await chars.update({ id: char.id }, { luckRemaining: char.stats.luck });
  }
};

export const plugin: IPlugin = {
  name: "mekton-zeta",
  version: "1.0.0",
  description: "Mekton Zeta chargen, gear, combat, and AI GM bridge for UrsaMU.",

  init: () => {
    registerHelpDir(new URL("./help", import.meta.url).pathname, "mekton-zeta");
    gameHooks.on("player:login", onLogin);
    gameHooks.emit("gm:system:register" as never, {
      system: mektonSystem,
      events: [
        { name: "mekton:roll",   cue: "Mekton roll" },
        { name: "mekton:combat", cue: "Mekton combat" },
      ],
    });
    registerPluginRoute("/api/v1/mekton-zeta", routeHandler);
    registerHeader(sciFiHeader);
    registerDivider(sciFiDivider);
    registerFooter(sciFiFooter);
    return true;
  },

  remove: () => {
    gameHooks.off("player:login", onLogin);
    unregisterHeader(sciFiHeader);
    unregisterDivider(sciFiDivider);
    unregisterFooter(sciFiFooter);
    // REST route persists until server restart.
  },
};
