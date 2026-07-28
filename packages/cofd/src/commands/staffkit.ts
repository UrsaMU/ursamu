// +staffkit — one-shot staff splat kit for lock / system tests.

import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import { defaultSheet, refreshAdvantages } from "../stats/index.ts";
import { assignDormHome } from "../support/dorm.ts";
import { syncSightFlags } from "../support/sight.ts";
import {
  isKnownStaffKit,
  listStaffKits,
  resolveStaffKit,
} from "../staffkit/index.ts";

function isStaff(actor: IDBObj): boolean {
  const f = actor.flags as Set<string> | undefined;
  if (!f) return false;
  return (
    f.has("admin") ||
    f.has("builder") ||
    f.has("wizard") ||
    f.has("superuser") ||
    f.has("staff")
  );
}

function parseArgs(u: IUrsamuSDK): {
  sw: string;
  splat: string;
  who: string;
} {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
  const parts = rest.split(/\s+/).filter(Boolean);
  // +staffkit changeling [target]
  // +staffkit/clear [target]
  // +staffkit/list
  if (sw === "clear" || sw === "list" || sw === "help") {
    return { sw, splat: "", who: parts[0] ?? "" };
  }
  // switch empty: first token is splat
  if (!sw) {
    return {
      sw: "",
      splat: (parts[0] ?? "").toLowerCase(),
      who: parts[1] ?? "",
    };
  }
  // +staffkit/changeling [target] — splat as switch
  if (isKnownStaffKit(sw)) {
    return { sw: "", splat: sw, who: parts[0] ?? "" };
  }
  return {
    sw,
    splat: (parts[0] ?? "").toLowerCase(),
    who: parts[1] ?? "",
  };
}

async function resolveTarget(
  u: IUrsamuSDK,
  who: string,
): Promise<IDBObj | null> {
  if (!who || who.toLowerCase() === "me") return u.me;
  const t = await u.util.target(u.me, who, true);
  return t ?? null;
}

function usage(u: IUrsamuSDK): void {
  const keys = listStaffKits().join(", ");
  u.send(
    [
      "Usage: %ch+staffkit <splat> [<target>]%cn",
      "       %ch+staffkit/<splat> [<target>]%cn",
      "       %ch+staffkit/list%cn",
      "       %ch+staffkit/clear [<target>]%cn",
      `Splats: ${keys}`,
      "Staff only. Installs a minimal live sheet + flags",
      "so game locks (fae, Lost, approved, …) pass.",
    ].join("\n"),
  );
}

export async function staffkitExec(u: IUrsamuSDK): Promise<void> {
  if (!isStaff(u.me)) {
    u.send("Permission denied. Staff only.");
    return;
  }

  const { sw, splat, who } = parseArgs(u);

  if (sw === "list" || sw === "help" || (!sw && !splat)) {
    if (sw === "list" || (!sw && !splat)) {
      const lines = [
        "Staff splat kits:",
        ...listStaffKits().map(
          (k) => `  %cy${k}%cn  — +staffkit ${k}`,
        ),
        "Clear: %ch+staffkit/clear%cn (mortal + strip fae)",
      ];
      u.send(lines.join("\n"));
      if (!sw && !splat) usage(u);
      return;
    }
    usage(u);
    return;
  }

  if (sw === "clear") {
    return await clearKit(u, who);
  }

  const kit = resolveStaffKit(splat);
  if (!kit) {
    u.send(
      `Unknown splat '${splat}'. ` +
        `Try: ${listStaffKits().join(", ")}`,
    );
    return;
  }

  const target = await resolveTarget(u, who);
  if (!target) {
    u.send(`No player matches '${who}'.`);
    return;
  }
  if (
    target.id !== u.me.id &&
    !(await u.canEdit(u.me, target))
  ) {
    u.send("Permission denied on that target.");
    return;
  }

  const sheet = refreshAdvantages(kit.sheet);

  await u.db.modify(target.id, "$set", {
    "data.cofd": sheet,
  });
  await u.db.modify(target.id, "$unset", {
    "data.cofd_cg": "",
  });
  target.state = {
    ...target.state,
    cofd: sheet,
  };
  delete target.state.cofd_cg;

  if (u.setFlags && kit.flags.length) {
    await u.setFlags(target.id, kit.flags.join(" "));
    for (const f of kit.flags) target.flags?.add(f);
  }
  await syncSightFlags(u, target, sheet);

  const dormId = await assignDormHome(
    u,
    target.id,
    sheet.template,
    { teleport: target.id === u.me.id },
  );
  if (dormId) {
    target.state = { ...target.state, home: dormId };
  }

  const name = u.util.displayName(target, u.me);
  const lines = [
    `%chStaff kit applied:%cn %cy${kit.label}%cn → ${name}`,
    `  Unlocks: ${kit.unlocks}`,
    `  Sheet: +sheet${
      target.id === u.me.id ? "" : " " + name
    }`,
  ];
  if (dormId) {
    lines.push(
      `  Home: dorm #${dormId} (%chhome%cn)`,
    );
  }
  lines.push(
    `  Clear: +staffkit/clear` +
      (target.id === u.me.id ? "" : ` ${name}`),
  );
  u.send(lines.join("\n"));
}

async function clearKit(
  u: IUrsamuSDK,
  who: string,
): Promise<void> {
  const target = await resolveTarget(u, who);
  if (!target) {
    u.send(`No player matches '${who || "me"}'.`);
    return;
  }
  if (
    target.id !== u.me.id &&
    !(await u.canEdit(u.me, target))
  ) {
    u.send("Permission denied on that target.");
    return;
  }

  const sheet = refreshAdvantages(defaultSheet());
  await u.db.modify(target.id, "$set", {
    "data.cofd": sheet,
  });
  target.state = { ...target.state, cofd: sheet };

  // Strip splat sight flags; leave approved (staff still IC).
  if (u.setFlags) {
    await u.setFlags(target.id, "!fae !forsaken");
    target.flags?.delete("fae");
    target.flags?.delete("forsaken");
  }
  await syncSightFlags(u, target, sheet);

  const name = u.util.displayName(target, u.me);
  u.send(
    `Staff kit cleared on ${name}: mortal sheet, ` +
      `fae/forsaken flags removed.`,
  );
}
