/** +cg — stepped character generation. One command, switch dispatch. */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";

import { cgProblems, formatCg } from "../src/cg.ts";
import { formatSheet } from "../src/display.ts";
import { readChar, type ICinChar } from "../src/types.ts";
import { saveChar } from "./chargen.ts";
import {
  addTrait,
  done,
  info,
  catalog,
  removeTrait,
  setAttr,
  setSkill,
  slugify,
  submit,
} from "./cg-actions.ts";
import {
  setContact,
  setStatus,
  setTier,
  setType,
} from "./cg-powers.ts";

export function buildCgCmd() {
  addCmd({
    name: "+cg",
    pattern: /^\+cg(?:\/([\w-]+))?(?:[=\s]+([\s\S]+))?$/i,
    lock: "connected",
    category: "Cinematic",
    help: `+cg[/<step-action>]  — Stepped character generation.

Switches:
  (none)              Show current step screen.
  /concept=<text>     Short concept.
  /tier=<name>        Mortal, Hero, or Veteran.
  /template=<Name>    Buy/clear the supernatural template.
  /attr <A>=<N>       Set an attribute rating (dex, int…).
  /skill <S>=<N>      Set a skill rating (0 removes).
  /quality <Q>=<N>    Add a quality (levels x cost).
  /power <N>=<N>      Buy a power (prereqs enforced).
  /status <Org>=<n>   Set social status.
  /contact <G>=<n>    Add a contact.
  /drawback <D>=<N>   Add a drawback.
  /remove <T>         Remove a quality or drawback.
  /catalog <what>     List skills / qualities / drawbacks.
  /info <name>        Show a skill or quality's details.
  /background=<text>  Set (or read with no =) your background.
  /sheet              Preview the character sheet.
  /submit             Submit for staff approval.
  /back, /next        Move between steps.

Examples:
  +cg
  +cg/tier=hero
  +cg/attr Strength=3
  +cg/quality contacts=2:RIPD
  +cg/power supernatural-sense=1
  +cg/next`,
    exec: async (u) => {
      const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
      const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
      const c = readChar(u.me.state);
      if (c.status === "approved") {
        u.send("Character is locked.");
        return;
      }
      if (!sw) return void (await show(u, c));
      switch (sw) {
        case "concept":
          c.concept = rest.slice(0, 60);
          await done(u, c);
          return;
        case "tier":
          await setTier(u, c, rest);
          return;
        case "template":
          await setType(u, c, rest);
          return;
        case "status":
          await setStatus(u, c, rest);
          return;
        case "contact":
          await setContact(u, c, rest);
          return;
        case "attr":
          await setAttr(u, c, rest);
          return;
        case "skill":
          await setSkill(u, c, rest);
          return;
        case "quality":
        case "power":
          await addTrait(u, c, rest, "quality");
          return;
        case "drawback":
          await addTrait(u, c, rest, "drawback");
          return;
        case "remove":
          await removeTrait(u, c, rest);
          return;
        case "catalog":
          u.send(catalog(slugify(rest)));
          return;
        case "info":
          u.send(info(slugify(rest)));
          return;
        case "background":
          if (rest) {
            c.background = rest.slice(0, 1200);
            await done(u, c);
          } else {
            u.send(
              c.background
                ? `Background: ${c.background}`
                : "Background not set.",
            );
          }
          return;
        case "sheet":
          u.send(formatSheet(u.util.displayName(u.me, u.me), c));
          return;
        case "submit":
          await submit(u, c);
          return;
        case "back":
          c.step = Math.max(1, (c.step || 1) - 1);
          await done(u, c);
          return;
        case "next":
          await advance(u, c);
          return;
        default:
          u.send(`%crUnknown switch%cn: /${sw}`);
          return;
      }
    },
  });
}

async function show(u: IUrsamuSDK, c: ICinChar): Promise<void> {
  u.send(formatCg(u.util.displayName(u.me, u.me), c));
}

const STEP_REQS: Record<number, (c: ICinChar) => string | null> = {
  1: (c) => c.type ? null : "Set your tier first (+cg/tier=).",
  2: (c) =>
    Object.values(c.attrs).some((v) => v < 1)
      ? "Every attribute needs at least 1."
      : null,
};

async function advance(u: IUrsamuSDK, c: ICinChar): Promise<void> {
  const req = STEP_REQS[c.step || 1];
  const problem = req ? req(c) : null;
  if (problem) {
    u.send(`%cr${problem}%cn`);
    return;
  }
  c.step = Math.min((c.step || 1) + 1, 7);
  await done(u, c);
}

