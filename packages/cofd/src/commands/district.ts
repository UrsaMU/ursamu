// +district command suite implementation.
// Allows setting and querying district traits on rooms and parent objects.

import { divider, type IDBObj, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  DEFAULT_ARCHETYPES,
  type DistrictTraits,
  resolveDistrictTraits,
} from "../support/district.ts";

function isStaff(actor: IDBObj): boolean {
  const f = actor.flags as Set<string> | undefined;
  if (!f) return false;
  return (
    f.has?.("superuser") ||
    f.has?.("admin") ||
    f.has?.("wizard") ||
    f.has?.("builder")
  );
}

export async function districtExec(u: IUrsamuSDK): Promise<void> {
  const switchName = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  switch (switchName) {
    case "":
    case "show":
      return await districtShow(u, rest);
    case "set":
      return await districtSet(u, rest);
    case "type":
      return await districtType(u, rest);
    case "create-parent":
      return await districtCreateParent(u, rest);
    default:
      u.send(`Unknown +district switch: /${switchName}`);
  }
}

async function districtShow(u: IUrsamuSDK, targetStr: string): Promise<void> {
  const target = targetStr
    ? await u.util.target(u.me, targetStr)
    : u.here;
  if (!target) {
    u.send(`Target '${targetStr}' not found.`);
    return;
  }

  const traits = await resolveDistrictTraits(u, target.id);
  const lines: string[] = [];
  lines.push(
    await divider(
      `D I S T R I C T : ${(target.name ?? target.id).toUpperCase()}`,
    ),
  );

  if (!traits) {
    lines.push("  No district traits configured for this room.");
    lines.push("  Use +district/set or +district/create-parent.");
    u.send(lines.join("\n"));
    return;
  }

  lines.push(`  Archetype:  %cy${traits.type}%cn`);
  lines.push(
    `  Access:      ${traits.access.toString().padStart(2)}   ` +
      `Safety:      ${traits.safety.toString().padStart(2)}`,
  );
  lines.push(
    `  Information: ${traits.information.toString().padStart(2)}   ` +
      `Awareness:   ${traits.awareness.toString().padStart(2)}`,
  );
  lines.push(
    `  Prestige:    ${traits.prestige.toString().padStart(2)}   ` +
      `Stability:   ${traits.stability.toString().padStart(2)}`,
  );

  lines.push("  Safehouse Limits:");
  const limits = traits.safehouseLimits;
  const sizeMax = limits.sizeMax !== undefined ? limits.sizeMax : "—";
  const secMin = limits.securityMin !== undefined ? limits.securityMin : "—";
  const locMin = limits.locationMin !== undefined ? limits.locationMin : "—";
  lines.push(
    `    Size Max: ${sizeMax.toString().padEnd(4)} ` +
      `Security Min: ${secMin.toString().padEnd(4)} ` +
      `Location Min: ${locMin.toString().padEnd(4)}`,
  );

  u.send(lines.join("\n"));
}

async function districtSet(u: IUrsamuSDK, rest: string): Promise<void> {
  const eq = rest.indexOf("=");
  if (eq < 0) {
    u.send("Usage: +district/set [<target>/]<trait>=<value>");
    return;
  }

  const lhs = rest.slice(0, eq).trim();
  const rhs = rest.slice(eq + 1).trim();

  let targetStr = "";
  let trait = lhs;

  if (lhs.includes("/")) {
    const parts = lhs.split("/");
    targetStr = parts[0].trim();
    trait = parts.slice(1).join("/").trim();
  }

  const target = targetStr
    ? await u.util.target(u.me, targetStr)
    : u.here;
  if (!target) {
    u.send(`Target '${targetStr}' not found.`);
    return;
  }

  const owner = target.state?.owner as string;
  if (!isStaff(u.me) && owner !== u.me.id) {
    u.send("Permission denied.");
    return;
  }


  const val = parseInt(rhs, 10);
  const traitKey = trait.toLowerCase();

  // deno-lint-ignore no-explicit-any
  const currentTraits = (target.state?.district_traits as any) ?? {
    type: "Custom",
    access: 0,
    safety: 0,
    information: 0,
    awareness: 0,
    prestige: 0,
    stability: 0,
    safehouseLimits: {},
  };

  if (
    [
      "access",
      "safety",
      "information",
      "awareness",
      "prestige",
      "stability",
    ].includes(traitKey)
  ) {
    if (isNaN(val) || val < -5 || val > 5) {
      u.send("Value must be a number between -5 and 5.");
      return;
    }
    currentTraits[
      traitKey as keyof Omit<DistrictTraits, "safehouseLimits" | "type">
    ] = val;
  } else if (["sizemax", "securitymin", "locationmin"].includes(traitKey)) {
    if (isNaN(val) || val < 0 || val > 5) {
      u.send("Limit must be a number between 0 and 5.");
      return;
    }
    const limitKey =
      traitKey === "sizemax"
        ? "sizeMax"
        : traitKey === "securitymin"
        ? "securityMin"
        : "locationMin";
    currentTraits.safehouseLimits[limitKey] = val;
  } else {
    u.send(`Unknown trait: '${trait}'`);
    return;
  }

  await u.db.modify(target.id, "$set", {
    "data.district_traits": currentTraits,
  });
  u.send(`District trait '${trait}' set to ${rhs} on ${target.name}.`);
}

async function districtType(u: IUrsamuSDK, rest: string): Promise<void> {
  let targetStr = "";
  let archetype = rest;

  const slash = rest.indexOf("/");
  if (slash >= 0 && !DEFAULT_ARCHETYPES[rest.toLowerCase().trim()]) {
    const potentialTarget = rest.slice(0, slash).trim();
    const resolved = await u.util.target(u.me, potentialTarget);
    if (resolved) {
      targetStr = potentialTarget;
      archetype = rest.slice(slash + 1).trim();
    }
  }

  const target = targetStr
    ? await u.util.target(u.me, targetStr)
    : u.here;
  if (!target) {
    u.send(`Target '${targetStr}' not found.`);
    return;
  }

  const owner = target.state?.owner as string;
  if (!isStaff(u.me) && owner !== u.me.id) {
    u.send("Permission denied.");
    return;
  }

  // deno-lint-ignore no-explicit-any
  const currentTraits = (target.state?.district_traits as any) ?? {
    type: "Custom",
    access: 0,
    safety: 0,
    information: 0,
    awareness: 0,
    prestige: 0,
    stability: 0,
    safehouseLimits: {},
  };

  currentTraits.type = archetype || "Custom";
  await u.db.modify(target.id, "$set", {
    "data.district_traits": currentTraits,
  });
  u.send(
    `District archetype type set to '${currentTraits.type}' on ${target.name}.`,
  );
}

async function districtCreateParent(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isStaff(u.me)) {
    u.send("Permission denied.");
    return;
  }

  let name = rest;
  let archetype = "";

  const eq = rest.indexOf("=");
  if (eq >= 0) {
    name = rest.slice(0, eq).trim();
    archetype = rest.slice(eq + 1).toLowerCase().trim();
  }

  if (!name) {
    u.send("Usage: +district/create-parent <name> [=<archetype>]");
    return;
  }

  const defaultTraits = DEFAULT_ARCHETYPES[archetype];
  const traits: DistrictTraits = {
    type: defaultTraits
      ? archetype.charAt(0).toUpperCase() + archetype.slice(1)
      : "Custom",
    access: defaultTraits?.access ?? 0,
    safety: defaultTraits?.safety ?? 0,
    information: defaultTraits?.information ?? 0,
    awareness: defaultTraits?.awareness ?? 0,
    prestige: defaultTraits?.prestige ?? 0,
    stability: defaultTraits?.stability ?? 0,
    safehouseLimits: defaultTraits?.safehouseLimits
      ? { ...defaultTraits.safehouseLimits }
      : {},
  };

  const newObj = await u.db.create({
    name,
    flags: new Set(["room", "parent_ok"]),
    state: {
      owner: u.me.id,
      district_traits: traits,
    },
  });

  u.send(
    `Created district parent object %ch${name}%cn (${newObj.id}) with archetype '${traits.type}'.`,
  );
}
