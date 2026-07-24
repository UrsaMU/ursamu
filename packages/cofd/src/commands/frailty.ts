// +frailty — list / cold iron note (CtL p.102).

import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  coldIronNote,
  frailtyActPenalty,
  listFrailties,
  parseFrailty,
} from "../form/frailty.ts";
import { divider } from "@ursamu/ursamu";
import { getSheet, isStaff } from "./hedge_helpers.ts";

export async function frailtyExec(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  if (sw === "iron" || sw === "coldiron" || rest === "iron") {
    u.send(coldIronNote());
    return;
  }

  let target = u.me;
  if ((sw === "list" || sw === "") && rest && isStaff(u.me)) {
    const t = await u.util.target(u.me, rest, true);
    if (!t) {
      u.send(`No player matches '${rest}'.`);
      return;
    }
    target = t;
  } else if (sw && sw !== "list" && sw !== "check") {
    // +frailty/check <text> — parse preview
    if (sw === "check" || sw === "parse") {
      const f = parseFrailty(rest || "");
      u.send(
        `Parsed: kind=${f.kind} major=${f.major} ` +
          `penalty=-${frailtyActPenalty(f)}\n  ${f.text}`,
      );
      return;
    }
  }

  const sheet = getSheet(target);
  if (!sheet) {
    u.send("No character sheet.");
    return;
  }
  const list = listFrailties(sheet);
  const lines = [
    await divider("F R A I L T I E S"),
    `  ${u.util.displayName(target, u.me)}`,
  ];
  if (!list.length) {
    lines.push("  (none — +sheet/set frailty=taboo: …)");
  } else {
    for (const f of list) {
      const maj = f.major ? "major " : "";
      lines.push(
        `  ${maj}${f.kind}: ${f.text.slice(0, 58)}`,
      );
      if (f.kind === "bane" || f.kind === "taboo") {
        lines.push(
          `    Act vs source: −${frailtyActPenalty(f)} ` +
            `and 1 WP/action (book).`,
        );
      }
    }
  }
  lines.push("  Set: +sheet/set frailty=taboo: never …");
  lines.push("  Set: +sheet/set frailty=bane: cold iron");
  lines.push("  +frailty/iron — cold iron rules");
  u.send(lines.join("\n"));
}
