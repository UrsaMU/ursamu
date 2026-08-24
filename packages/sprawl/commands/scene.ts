/** +scene — scene/encounter breaks (edge + optional DoT). */
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK, IDBObj } from "@ursamu/ursamu";
import {
  ARR,
  ERR,
  OK,
  dim,
  footer,
  header,
  val,
  ylw,
} from "./chrome.ts";
import { resetSceneFlags } from "../engine/scene.ts";
import {
  getChar,
  isStaff,
  requireChar,
  saveChar,
} from "../engine/sheet-io.ts";

addCmd({
  name: "+scene",
  pattern: /^\+scene(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+scene[/<switch>] [args]  — Scene / encounter break.

Clears edge once-per-scene/encounter flags.
Optional DoT tick when the beat advances.

Switches:
  (none)|/reset   Reset your edge uses.
  /tick           Reset edge + tick your DoTs.
  /all            Staff: reset everyone in the room.
  /alltick        Staff: room reset + DoT tick.

Examples:
  +scene
  +scene/tick
  +scene/all
  +scene/alltick`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "reset").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    void arg;

    const runOne = async (
      target: IDBObj,
      tick: boolean,
    ): Promise<string[]> => {
      const c = getChar(target);
      if (!c) return [];
      const r = resetSceneFlags(c, { tickDots: tick });
      await saveChar(u, r.next, target.id);
      return r.lines.map(
        (L) => `${target.name ?? target.id}: ${L}`,
      );
    };

    if (sw === "all" || sw === "alltick" || sw === "room") {
      if (!isStaff(u)) {
        u.send(`${ERR}Staff only.`);
        return;
      }
      const tick = sw === "alltick";
      const room = u.here;
      const ids = room?.contents ?? [];
      const lines = [header("SCENE · ROOM")];
      let n = 0;
      for (const raw of ids) {
        const id = typeof raw === "string"
          ? raw.replace(/^#/, "")
          : (raw as IDBObj).id;
        // deno-lint-ignore no-explicit-any
        const obj = typeof raw === "object"
          ? raw as IDBObj
          : await (u.db as any).get?.(id) ??
            (await u.db.search({ id }))[0];
        if (!obj?.flags?.has?.("player")) continue;
        const L = await runOne(obj, tick);
        if (L.length) {
          n++;
          lines.push(...L.map((x) => `  ${x}`));
        }
      }
      if (!n) lines.push(`  ${dim("no sheets in room")}`);
      lines.push(footer("SPRAWL"));
      u.send(lines.join("\r\n"));
      return;
    }

    const c = requireChar(u);
    if (!c) {
      u.send(`${ARR}No sheet.`);
      return;
    }
    const tick = sw === "tick" || sw === "dot";
    const r = resetSceneFlags(c, { tickDots: tick });
    await saveChar(u, r.next);
    u.send(
      [
        header("SCENE"),
        ...r.lines.map((L) => `  ${ylw("::")} ${L}`),
        `  ${dim("Edge uses free for the new beat.")}`,
        footer("SPRAWL"),
      ].join("\r\n"),
    );
    void OK;
  },
});
