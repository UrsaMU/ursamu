/**
 * +jgroup commands — Anomaly jgroups CRUD.
 */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { isStaffFlags, header, divider, footer } from "./format.ts";
import {
  addMember,
  createGroup,
  delMember,
  destroyGroup,
  listGroups,
} from "./jgroups.ts";

addCmd({
  name: "+jgroup",
  pattern: /^\+jgroups?(?:\/(\S+))?\s*(.*)/i,
  lock: "connected builder+",
  category: "Jobs",
  help: `+jgroup/list
+jgroup/create <name>
+jgroup/add <name>=<player>
+jgroup/del <name>=<player>
+jgroup/destroy <name>

Named player lists for jobs access/notify.`,
  exec: async (u: IUrsamuSDK) => {
    if (!isStaffFlags(u.me.flags)) {
      u.send(">JOBS: Staff only.");
      return;
    }
    const sw = (u.cmd.args[0] ?? "list").toLowerCase().trim();
    const arg = (u.cmd.args[1] ?? "").trim();

    if (sw === "list" || (!sw && !arg)) {
      const gs = await listGroups();
      if (!gs.length) {
        u.send(">JOBS: No jgroups.");
        return;
      }
      const lines = [header("JGroups"), divider()];
      for (const g of gs) {
        lines.push(
          `  ${g.name} (${g.memberIds.length} members)`,
        );
      }
      lines.push(footer());
      u.send(lines.join("\n"));
      return;
    }

    if (sw === "create") {
      if (!arg) {
        u.send("Usage: +jgroup/create <name>");
        return;
      }
      try {
        await createGroup(arg, u.me.id);
        u.send(`>JOBS: jgroup '${arg}' created.`);
      } catch (e: unknown) {
        u.send(`>JOBS: ${e instanceof Error ? e.message : e}`);
      }
      return;
    }

    if (sw === "add" || sw === "del") {
      const eq = arg.indexOf("=");
      if (eq === -1) {
        u.send(`Usage: +jgroup/${sw} <name>=<player>`);
        return;
      }
      const gname = arg.slice(0, eq).trim();
      const pname = arg.slice(eq + 1).trim();
      const target = await u.util.target(u.me, pname);
      if (!target) {
        u.send(`>JOBS: Player "${pname}" not found.`);
        return;
      }
      try {
        if (sw === "add") await addMember(gname, target.id);
        else await delMember(gname, target.id);
        u.send(
          `>JOBS: ${sw === "add" ? "Added" : "Removed"} ` +
            `${target.name} ${sw === "add" ? "to" : "from"} ` +
            gname + ".",
        );
      } catch (e: unknown) {
        u.send(`>JOBS: ${e instanceof Error ? e.message : e}`);
      }
      return;
    }

    if (sw === "destroy") {
      if (!arg) {
        u.send("Usage: +jgroup/destroy <name>");
        return;
      }
      await destroyGroup(arg);
      u.send(`>JOBS: jgroup '${arg}' destroyed.`);
      return;
    }

    u.send(">JOBS: +jgroup/list|create|add|del|destroy");
  },
});
