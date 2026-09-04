import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import type { ICPRCharacter, IGearItem } from "../db/schemas.ts";
import { OK, row, val, dim, ERR, ARR } from "./chargen.ts";

const SCRAP_VALUE: Record<string, number> = {
  super_luxury: 10000,
  luxury: 5000,
  very_expensive: 1000,
  expensive: 500,
  premium: 100,
  costly: 50,
  everyday: 10,
  cheap: 5,
};

function findItem(gear: IGearItem[], query: string): IGearItem | undefined {
  const lower = query.toLowerCase();
  return (
    gear.find((g) => g.id.startsWith(query)) ??
    gear.find((g) => g.name.toLowerCase().includes(lower))
  );
}

addCmd({
  name: "+scrap",
  pattern: /^\+scrap\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+scrap <item>  — Salvage a gear item for parts (workshop only).

Requires a room you own or can edit (your workshop).
Returns EB based on the item's price tier.

Examples:
  +scrap knife        Scrap a knife for parts.
  +scrap abc123       Scrap item by ID prefix.`,
  exec: async (u: IUrsamuSDK) => {
    const inWorkshop = await u.canEdit(u.me, u.here);
    if (!inWorkshop) {
      u.send(`${ERR}Scrapping requires a workshop — a room you own or control.`);
      return;
    }

    const arg = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    if (!arg) {
      u.send(`${ARR}Usage: ${val("+scrap <item>")}`);
      return;
    }

    const cpr = u.me.state?.cpr as ICPRCharacter | undefined;
    const gear: IGearItem[] = cpr?.gear ?? [];

    const item = findItem(gear, arg);
    if (!item) {
      u.send(`${ERR}You don't have that item.`);
      return;
    }

    const tier = item.priceCategory ?? "cheap";
    const scrapValue = SCRAP_VALUE[tier] ?? 5;
    const updatedGear = gear.filter((g) => g.id !== item.id);
    const newBalance = (cpr?.eurodollars ?? 0) + scrapValue;

    await u.db.modify(u.me.id, "$set", { "state.cpr.gear": updatedGear });
    await u.db.modify(u.me.id, "$inc", { "state.cpr.eurodollars": scrapValue });

    u.send([
      `${OK}Stripped for parts.`,
      row("ITEM",     val(item.name)),
      row("CATEGORY", cpr ? dim(tier) : dim("cheap")),
      row("RECEIVED", val(`${scrapValue} eb`)),
      row("BALANCE",  val(`${newBalance.toLocaleString()} eb`)),
    ].join("\r\n"));
  },
});
