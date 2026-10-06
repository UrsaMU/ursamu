/** +sense / +mask — Power Sensing and Masking commands. */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { POWERS } from "../src/data.ts";
import {
  d10,
  hasPower,
  maskLevel,
  powerSignatures,
  resolveSense,
} from "../src/sensing.ts";
import { readChar, type ICinChar } from "../src/types.ts";
import { saveChar } from "./chargen.ts";

const ALPHA = ["alpha-i", "alpha-ii", "alpha-iii"];
const ASPECTS = ["nature", "power", "master", "alpha"];
const REQUIRE: Record<string, string> = {
  "master": "master-vampire",
  "alpha": "alpha-i",
};

async function doSense(
  u: IUrsamuSDK,
  sensor: ICinChar,
  raw: string,
): Promise<void> {
  const who = raw.trim();
  if (!who) {
    u.send(
      `You read the room's ambience: no specific auras reported.` +
        ` Use %ch+sense <character>%cn for a focused examination.`,
    );
    return;
  }
  if (who.toLowerCase() === "undead") {
    if (!hasPower(sensor, "necromancer")) {
      u.send("%crRequires the Necromancer quality.%cn");
      return;
    }
    u.send(
      `Necromantic search: the usual undead signatures press at the` +
        ` edges of the scene. No specific target identified — use` +
        ` %ch+sense <character>%cn.`,
    );
    return;
  }
  const target = await u.util.target(u.me, who, true);
  if (!target) {
    u.send("No such character.");
    return;
  }
  const tc = readChar(target.state);
  const result = resolveSense(
    sensor,
    tc,
    d10(),
    tc.mask?.active ? d10() : 0,
  );
  const name = u.util.displayName(target, u.me);
  u.send(
    `%ch+sense%cn ${name}: ${result.message}` +
      (result.masked
        ? ` %cy(Mask contest: ${result.verdict})%cn`
        : ""),
  );
}

async function doMask(
  u: IUrsamuSDK,
  c: ICinChar,
  sw: string,
  rest: string,
): Promise<void> {
  const lvl = maskLevel(c);
  const save = () => saveChar(u, c);
  if (!sw) {
    u.send(
      `Mask: ${c.mask.active ? "%cgON%cn" : "%coOFF%cn"}` +
        ` (level ${lvl})   Aspects: ` +
        `${c.mask.aspects.join(", ") || "none"}` +
        `\nSurface impression: ${c.mask.impression || "(none set)"}`,
    );
    return;
  }
  if (sw === "on" || sw === "off") {
    if (sw === "on" && lvl < 1) {
      u.send("%crRequires Mask 1+.%cn");
      return;
    }
    c.mask.active = sw === "on";
    await save();
    u.send(`Mask ${sw === "on" ? "%cgactivated%cn" : "%codropped%cn"}.`);
    return;
  }
  if (sw === "set") {
    c.mask.impression = rest.slice(0, 60);
    await save();
    u.send(`Surface impression set: ${c.mask.impression || "(none)"}`);
    return;
  }
  if (!ASPECTS.includes(sw)) {
    u.send(`Usage: +mask[/on|off|${ASPECTS.join("|")}|set=<desc>]`);
    return;
  }
  const req = REQUIRE[sw];
  if (req) {
    const ok = req === "alpha-i"
      ? ALPHA.some((a) => hasPower(c, a))
      : hasPower(c, req);
    if (!ok) {
      u.send(`%cr${sw === "master"
        ? "Requires Master Vampire (Veil the Master)."
        : "Requires Alpha (Quiet Beast)."}%cn`);
      return;
    }
  }
  const i = c.mask.aspects.indexOf(sw);
  if (i >= 0) c.mask.aspects.splice(i, 1);
  else c.mask.aspects.push(sw);
  await save();
  u.send(
    `Mask aspect ${i >= 0 ? "dropped" : "concealed"}: ` +
      `%cy${sw}%cn.`,
  );
}

export function buildSenseCmds() {
  addCmd({
    name: "+sense",
    pattern: /^\+sense(?:\s+([\s\S]+))?$/i,
    lock: "connected",
    category: "Cinematic",
    help: `+sense [<character> | undead]  — Supernatural sensing.

Examples:
  +sense
  +sense Michelle
  +sense undead          (Necromancer only)`,
    exec: async (u) => {
      const sensor = readChar(u.me.state);
      await doSense(
        u,
        sensor,
        u.util.stripSubs(u.cmd.args[0] ?? ""),
      );
    },
  });

  addCmd({
    name: "+mask",
    pattern: /^\+mask(?:\/(\w+))?(?:=(.*))?$/i,
    lock: "connected",
    category: "Cinematic",
    help: `+mask[/<switch>]  — Power masking.

Switches:
  (none)          Show masking state.
  /on|/off        Activate or drop the Mask (needs Mask 1+).
  /nature         Toggle concealing supernatural type.
  /power          Toggle concealing strength.
  /master         Conceal Master status (Veil the Master).
  /alpha          Suppress Alpha presence (Quiet Beast).
  /set=<text>     Set permitted surface impression.

Examples:
  +mask/on
  +mask/master
  +mask/set=an ordinary young vampire`,
    exec: async (u) => {
      const c = readChar(u.me.state);
      await doMask(
        u,
        c,
        (u.cmd.args[0] ?? "").toLowerCase(),
        u.util.stripSubs(u.cmd.args[1] ?? "").trim(),
      );
    },
  });
}
