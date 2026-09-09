// commands/stat.ts -- +stat <target>/<trait>=<value>  (staff direct override)
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { findByPlayer, saveChar } from "../db/charDb.ts";
import { resolveTrait } from "../core/resolver.ts";
import { emitStatChanged } from "../hooks.ts";

addCmd({
  name: "+stat",
  pattern: /^\+stat\s+(.+)\/(.+)=(.+)/i,
  lock: "connected admin+",
  category: "Character Generation",
  help: `+stat <target>/<trait>=<value>  -- Directly set any character stat (staff).

  Sets any trait on a character sheet, bypassing normal chargen gating.
  Writes an audit log entry to the character record.

SYNTAX
  +stat <target>/<trait>=<value>

EXAMPLES
  +stat Alice/Strength=4        Set Alice's Strength to 4.
  +stat Bob/gnosis=3            Set Bob's Gnosis to 3.
  +stat Carol/concept=Hunter    Set Carol's concept.`,

  exec: async (u: IUrsamuSDK) => {
    const targetName = u.util.stripSubs(u.cmd.args[0]).trim();
    const trait      = u.util.stripSubs(u.cmd.args[1]).trim();
    const value      = u.util.stripSubs(u.cmd.args[2] ?? "").trim();

    const target = await u.util.target(u.me, targetName, true);
    if (!target) { u.send("Target not found."); return; }

    const char = await findByPlayer(target.id);
    if (!char) {
      u.send(`${u.util.displayName(target, u.me)} has no character on file.`);
      return;
    }

    const res = resolveTrait(char, trait);
    if (!res.found) {
      u.send(`%crUnknown trait "${trait}".%cn`);
      return;
    }

    // Determine old value for audit log
    const oldValue = getNestedField(char as unknown as Record<string, unknown>, res.field);

    // Apply value -- staff bypasses step gating and range checks
    let newValue: unknown = value;
    if (res.category === "number") {
      const n = parseInt(value, 10);
      if (isNaN(n)) { u.send(`%cr${trait} requires a number.%cn`); return; }
      newValue = n;
    }

    setNestedField(char as unknown as Record<string, unknown>, res.field, newValue);

    (char.statLog ??= []).push({
      staffId: u.me.id,
      trait,
      old: oldValue,
      new: newValue,
      ts: Date.now(),
    });

    await saveChar(char);

    emitStatChanged({
      staffId: u.me.id,
      targetId: target.id,
      charId: char.id,
      trait,
      old: oldValue,
      newVal: newValue,
    });

    u.send(
      `%chStat set:%cn ${u.util.displayName(target, u.me)} / ${trait} = ${newValue} ` +
      `(was: ${JSON.stringify(oldValue)})`,
    );
  },
});

function setNestedField(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function getNestedField(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}
