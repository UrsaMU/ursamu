/** +drone — deploy and use personal drones. */
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
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
import {
  deployDrone,
  destroyDroneThing,
  getActiveDrone,
  listDrones,
  stowDrone,
  useDroneEffect,
} from "../engine/drones.ts";
import {
  displayName,
  itemData,
  resolveItemRef,
} from "../engine/items.ts";
import {
  getInventory,
  requireChar,
  saveChar,
} from "../engine/sheet-io.ts";

addCmd({
  name: "+drone",
  pattern: /^\+drone(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+drone[/<switch>] [ref]  — Personal drones (Things).

Switches:
  (none)|/list     Carried drones + active.
  /deploy <ref>    Put one drone in the air.
  /stow            Recall active drone.
  /use             Trigger active drone effect.

Examples:
  +drone
  +drone/deploy medi-drone
  +drone/use
  +drone/stow`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const c = requireChar(u);
    if (!c) {
      u.send(`${ARR}No sheet.`);
      return;
    }
    const { items } = await getInventory(u, u.me);
    const drones = listDrones(items);

    if (!sw || sw === "list") {
      const lines = [header("DRONES")];
      if (!drones.length) {
        lines.push(
          `  ${dim("none — +gear/buy <drone-slug>")}`,
        );
      }
      let n = 0;
      for (const o of drones) {
        n++;
        const active = o.id === c.activeDroneId
          ? ` ${ylw("ACTIVE")}`
          : "";
        lines.push(
          `  #${n} ${val(displayName(o))}` +
            ` ${dim(itemData(o)?.slug ?? "")}${active}`,
        );
      }
      lines.push(footer("SPRAWL"));
      u.send(lines.join("\r\n"));
      return;
    }

    if (sw === "deploy") {
      if (!arg) {
        u.send(`${ERR}Usage: ${val("+drone/deploy <ref>")}`);
        return;
      }
      const drone = await resolveItemRef(u, u.me.id, arg) ??
        drones.find((o) =>
          (itemData(o)?.slug ?? "").includes(arg.toLowerCase()) ||
          displayName(o).toLowerCase().includes(arg.toLowerCase())
        );
      if (!drone || !itemData(drone) ||
        itemData(drone)!.kind !== "drone"
      ) {
        u.send(`${ERR}Not a carried drone.`);
        return;
      }
      if (c.activeDroneId && c.activeDroneId !== drone.id) {
        const prev = getActiveDrone(items, c);
        if (prev) {
          await stowDrone(u, c, prev);
        }
      }
      const next = await deployDrone(u, c, drone, u.me.id);
      await saveChar(u, next);
      u.send(
        `${OK}Deployed ${val(displayName(drone))}.` +
          ` ${val("+drone/use")}`,
      );
      return;
    }

    if (sw === "stow") {
      const active = getActiveDrone(items, c);
      const next = await stowDrone(u, c, active);
      await saveChar(u, next);
      u.send(
        active
          ? `${OK}Stowed ${val(displayName(active))}.`
          : `${ARR}No drone airborne.`,
      );
      return;
    }

    if (sw === "use" || sw === "fire" || sw === "activate") {
      const active = getActiveDrone(items, c);
      if (!active) {
        u.send(
          `${ERR}Deploy first: ${val("+drone/deploy <ref>")}`,
        );
        return;
      }
      const d = itemData(active)!;
      const r = useDroneEffect(c, d);
      if (r.sheet) await saveChar(u, r.sheet);
      if (r.destroy) {
        await destroyDroneThing(u, active);
        const next = { ...c };
        delete next.activeDroneId;
        if (!r.sheet) await saveChar(u, next);
        else {
          const s = { ...r.sheet };
          delete s.activeDroneId;
          await saveChar(u, s);
        }
      }
      u.send(`${OK}${r.message}`);
      return;
    }

    u.send(`${ERR}Switches: /list /deploy /stow /use`);
  },
});
