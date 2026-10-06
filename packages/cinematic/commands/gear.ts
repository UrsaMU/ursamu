/** +gear — weapon/armor catalog and Ursa object minting.
 * Minted objects carry their stats in &WEAPON / &ARMOR attributes. */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { ARMOR, WEAPONS, armorDef, weaponDef } from "../src/data.ts";
import { slugify } from "../src/resolve.ts";
import { showCatalog, showInfo } from "../src/gear-display.ts";
import { readChar } from "../src/types.ts";
import { saveChar } from "./chargen.ts";
import { isStaff } from "./staff.ts";

/** MUSH-attribute pairs for a weapon (&dmg=4xStrength &type=... etc). */
export function weaponAttrs(w: (typeof WEAPONS)[number]): [string, string][] {
  const dmg = w.dmg.fixed != null
    ? String(w.dmg.fixed)
    : w.dmg.plus
    ? `${w.dmg.mult}x(Strength+${w.dmg.plus})`
    : `${w.dmg.mult}xStrength`;
  const pairs: [string, string][] = [
    ["dmg", dmg],
    ["type", w.type],
    ["skill", w.skill],
    ["range", w.range],
    ["hands", String(w.hands)],
  ];
  if (w.special) pairs.push(["special", w.special]);
  return pairs;
}

/** MUSH-attribute pairs for armor (&bash=8 &slash=8 &bullet=4 ...). */
export function armorAttrs(a: (typeof ARMOR)[number]): [string, string][] {
  return [
    ["bash", String(a.protection.bash)],
    ["slash", String(a.protection.slash)],
    ["bullet", String(a.protection.bullet)],
    ["coverage", a.coverage],
  ];
}

/** Mint an Ursa object with stats as &key=value attributes. */
async function mint(
  u: IUrsamuSDK,
  targetId: string,
  kind: "WEAPON" | "ARMOR",
  slug: string,
): Promise<void> {
  const def = kind === "WEAPON" ? weaponDef(slug) : armorDef(slug);
  if (!def) {
    u.send(`%crNot found%cn: ${slug}`);
    return;
  }
  const obj = await u.db.create({
    name: def.name,
    location: targetId,
  });
  const pairs = kind === "WEAPON"
    ? weaponAttrs(def as (typeof WEAPONS)[number])
    : armorAttrs(def as (typeof ARMOR)[number]);
  for (const [key, value] of pairs) {
    await u.attr.set(obj.id, key, value);
  }
  await u.attr.set(obj.id, "kind", kind.toLowerCase());
  u.send(
    `${def.name} created in ${targetId}` +
      ` [${pairs.map(([k, v]) => `&${k}=${v}`).join(" ")}]`,
  );
}

export function buildGearCmd() {
  addCmd({
    name: "+gear",
    pattern: /^\+gear(?:\/([\w-]+))?(?:\s+([\s\S]+))?$/i,
    lock: "connected",
    category: "Cinematic",
    help: `+gear[/<switch>] [<args>]  — Weapons, armor, equipment.

Switches:
  (none)                Weapons catalog.
  /armor                Armor catalog.
  /info <slug>          Details for a weapon or armor.
  /wield <slug>         Set your weapon (damage source).
  /wear <slug>          Set your armor.
  /give <player>=<slug> Mint the object into their inventory (admin+).

Examples:
  +gear
  +gear/armor
  +gear/info sword
  +gear/wield axe
  +gear/give Riley=sword`,
    exec: async (u) => {
      const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
      const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
      const c = readChar(u.me.state);
      switch (sw) {
        case "":
        case "catalog":
          await showCatalog(u, rest.toLowerCase());
          return;
        case "armor":
          await showCatalog(u, "armor");
          return;
        case "info":
          u.send(showInfo(slugOf(rest)));
          return;
        case "wield": {
          const w = weaponDef(slugOf(rest));
          if (!w) {
            u.send(`%crUnknown weapon%cn: ${rest}`);
            return;
          }
          c.weapon = w.slug;
          await saveChar(u, c);
          u.send(`Wielding %cy${w.name}%cn.`);
          return;
        }
        case "wear": {
          const a = armorDef(slugOf(rest));
          if (!a) {
            u.send(`%crUnknown armor%cn: ${rest}`);
            return;
          }
          c.armor = a.slug;
          await saveChar(u, c);
          u.send(`Wearing %cy${a.name}%cn.`);
          return;
        }
        case "give": {
          if (!isStaff(u)) {
            u.send("Permission denied.");
            return;
          }
          const [who, slug] = rest.split("=");
          const target = await u.util.target(u.me, who?.trim() ?? "", true);
          if (!target) {
            u.send("No such player.");
            return;
          }
          const kind = armorDef(slugOf(slug ?? "")) ? "ARMOR" : "WEAPON";
          await mint(u, target.id, kind, slugOf(slug ?? ""));
          return;
        }
        default:
          u.send(`%crUnknown switch%cn: /${sw}`);
          return;
      }
    },
  });
}

function slugOf(s: string): string {
  return slugify(s);
}
