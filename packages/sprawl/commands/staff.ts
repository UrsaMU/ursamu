/** +staff — grant cash, gear, AP; hub for staff tools. */
import { addCmd } from "@ursamu/ursamu";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import {
  ARR,
  ERR,
  OK,
  dim,
  footer,
  header,
  val,
} from "./chrome.ts";
import {
  getChar,
  isStaff,
  saveChar,
} from "../engine/sheet-io.ts";
import type { ISprawlChar } from "../db/schemas.ts";
import {
  type GrantResult,
  grantApAmount,
  grantCash,
  grantCatalogGear,
  parseWhoRest,
} from "../engine/staff-grant.ts";

async function loadTarget(
  u: IUrsamuSDK,
  who: string,
): Promise<
  | { t: IDBObj; c: ISprawlChar }
  | { err: string }
> {
  const t = await u.util.target(u.me, who, true);
  if (!t) return { err: "Not found." };
  const c = getChar(t);
  if (!c) return { err: "No sprawl sheet." };
  return { t, c };
}

function hubLines(): string {
  return [
    header("STAFF"),
    `  ${val("+staff/cash")} <player>=<n>` +
      `   ${dim("b¥ +/− (wallet)")}`,
    `  ${val("+staff/gear")} <player>=<slug>` +
      `  ${dim("free catalog mint")}`,
    `  ${val("+staff/ap")} <player>=<n>` +
      `     ${dim("grant AP + level")}`,
    `  ${dim("Also:")}`,
    `  ${val("+advance/ready")} <player>` +
      `   ${dim("+25 AP mission")}`,
    `  ${val("+advance/session")} [player]` +
      ` ${dim("+10 AP survival")}`,
    `  ${val("+chargen/approve")} <name>`,
    `  ${val("+npc/spawn")} · ${val("+critical/clear")}`,
    `  ${val("+gig/force")} · ${val("+gig/complete-for")}`,
    footer("STAFF"),
  ].join("\r\n");
}

async function applyGrant(
  u: IUrsamuSDK,
  who: string,
  rest: string,
  kind: "cash" | "ap" | "gear",
): Promise<void> {
  const hit = await loadTarget(u, who);
  if ("err" in hit) {
    u.send(
      hit.err.startsWith("No")
        ? `${ARR}${hit.err}`
        : `${ERR}${hit.err}`,
    );
    return;
  }
  let r: GrantResult;
  if (kind === "cash") {
    const n = Number(rest);
    if (!Number.isFinite(n)) {
      u.send(`${ERR}Amount must be a number.`);
      return;
    }
    r = grantCash(hit.c, n);
  } else if (kind === "ap") {
    const n = Number(rest);
    if (!Number.isFinite(n)) {
      u.send(`${ERR}Amount must be a number.`);
      return;
    }
    r = grantApAmount(hit.c, n);
  } else {
    r = await grantCatalogGear(u, hit.t, hit.c, rest);
  }
  if (!r.ok) {
    u.send(`${ERR}${r.reason}`);
    return;
  }
  await saveChar(u, r.char, hit.t.id);
  if (kind === "gear") {
    u.send(
      `${OK}Granted ${val(r.note)} → ` +
        `${val(String(hit.t.name))}`,
    );
  } else {
    u.send(
      `${OK}${val(String(hit.t.name))} ${r.note}`,
    );
  }
}

addCmd({
  name: "+staff",
  pattern: /^\+staff(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+staff[/<switch>]  — Staff grants & tool index.

Switches:
  /cash <p>=<n>   Add/subtract bit yuan
  /gear <p>=slug  Free catalog item (inv)
  /ap <p>=<n>     Grant Advancement Points

Also: +advance/ready|/session, +chargen/approve,
+npc/spawn, +critical/clear, +gig/force

Examples:
  +staff
  +staff/cash Alice=500
  +staff/gear Bob=pkd-45
  +staff/ap Alice=25
  +advance/ready Alice`,

  exec: async (u: IUrsamuSDK) => {
    if (!isStaff(u)) {
      u.send(`${ERR}Staff only.`);
      return;
    }
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (!sw || sw === "help" || sw === "list") {
      u.send(hubLines());
      return;
    }

    const cashSw = ["cash", "bityuan", "by", "money"];
    const gearSw = ["gear", "item", "give"];
    const apSw = ["ap", "xp"];

    let kind: "cash" | "ap" | "gear" | null = null;
    if (cashSw.includes(sw)) kind = "cash";
    else if (apSw.includes(sw)) kind = "ap";
    else if (gearSw.includes(sw)) kind = "gear";

    if (!kind) {
      u.send(
        `${ERR}Unknown. ${val("+staff")} for list.`,
      );
      return;
    }

    const p = parseWhoRest(arg);
    if (!p) {
      const usage = kind === "cash"
        ? "+staff/cash <player>=<n>"
        : kind === "ap"
        ? "+staff/ap <player>=<n>"
        : "+staff/gear <player>=<slug>";
      u.send(`${ERR}Usage: ${val(usage)}`);
      return;
    }
    await applyGrant(u, p.who, p.rest, kind);
  },
});
