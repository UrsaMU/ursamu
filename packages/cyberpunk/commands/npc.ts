/**
 * +npc — spawn / list / AI / destroy street antagonists.
 * Objects: flags npc+thing, state.cprNpc (+ aiKey for walker).
 */
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK, IDBObj } from "@ursamu/ursamu";
import type { ICPRNpc } from "../db/schemas.ts";
import {
  NPC_TEMPLATES,
  getNpcTemplate,
  npcArchetypeIds,
} from "../data/npcs.ts";
import { buildNpc } from "../engine/npc.ts";
import {
  bar,
  div,
  hdr,
  lbl,
  val,
  acc,
  dim,
  ARR,
  ERR,
  OK,
  row,
} from "./chargen.ts";

const AI_KEYS = [
  "aggressive",
  "manual",
  "off",
  "none",
  "llm",
  "ai-gm",
] as const;

function isStaff(u: IUrsamuSDK): boolean {
  const f = u.me.flags;
  return f.has("admin") || f.has("wizard") ||
    f.has("superuser") || f.has("staff");
}

function roomId(u: IUrsamuSDK): string {
  return String(u.me.location ?? "");
}

function npcBlock(o: IDBObj): ICPRNpc | null {
  // deno-lint-ignore no-explicit-any
  const n = (o.state as any)?.cprNpc as ICPRNpc | undefined;
  if (!n || typeof n !== "object") return null;
  return n;
}

function isNpcObj(o: IDBObj): boolean {
  if (npcBlock(o)) return true;
  const fl = o.flags;
  if (fl instanceof Set) return fl.has("npc");
  return String(fl || "").split(/\s+/).includes("npc");
}

async function roomNpcs(u: IUrsamuSDK): Promise<IDBObj[]> {
  const rid = roomId(u);
  // deno-lint-ignore no-explicit-any
  const items = await u.db.search({ location: rid } as any);
  return items.filter(isNpcObj);
}

function listTemplates(u: IUrsamuSDK): void {
  const lines = [
    bar(),
    hdr("NPC ARCHETYPES"),
    bar(),
  ];
  for (const id of npcArchetypeIds()) {
    const t = NPC_TEMPLATES[id];
    if (!t) continue;
    lines.push(
      row(
        t.name,
        `${dim(t.tier)}  ${dim("HP")} ${val(String(t.hp))}  ` +
          `${dim(t.weapon.name)}`,
      ),
    );
    lines.push(`    ${dim(id)}`);
  }
  lines.push(div());
  lines.push(
    `  ${ARR}${val("+npc/build <name>=<archetype>")}  ` +
      dim("spawn in this room"),
  );
  lines.push(bar());
  u.send(lines.join("\r\n"));
}

async function listRoom(u: IUrsamuSDK): Promise<void> {
  const npcs = await roomNpcs(u);
  const lines = [
    bar(),
    hdr("NPCS HERE"),
    bar(),
  ];
  if (!npcs.length) {
    lines.push(`  ${dim("No NPCs in this room.")}`);
  } else {
    for (const o of npcs) {
      const n = npcBlock(o);
      const name = u.util.displayName(o, u.me);
      const hp = n
        ? `${n.hp.current}/${n.hp.max}`
        : "?";
      const ai = n?.aiKey ?? "aggressive";
      const arch = n?.archetype ?? "?";
      lines.push(
        `  ${val(name)}  ${dim("#" + o.id)}  ` +
          `${dim("HP")} ${acc(hp)}  ` +
          `${dim(arch)}  ${dim("AI:" + ai)}`,
      );
    }
  }
  lines.push(div());
  lines.push(
    `  ${ARR}${val("+npc/build Name=boosterganger")}`,
  );
  lines.push(
    `  ${ARR}${val("+npc/templates")}  ` +
      dim("archetype list"),
  );
  lines.push(bar());
  u.send(lines.join("\r\n"));
}

async function buildNpcCmd(
  u: IUrsamuSDK,
  arg: string,
): Promise<void> {
  if (!isStaff(u)) {
    u.send(`${ERR}Staff only.`);
    return;
  }
  const eq = arg.indexOf("=");
  if (eq < 1) {
    u.send(
      `${ERR}Usage: ${val("+npc/build <name>=<archetype>")}`,
    );
    return;
  }
  const name = arg.slice(0, eq).trim();
  let arch = arg.slice(eq + 1).trim().toLowerCase();
  let aiKey = "aggressive";
  // optional Name=archetype/aiKey
  const slash = arch.indexOf("/");
  if (slash >= 0) {
    aiKey = arch.slice(slash + 1).trim() || "aggressive";
    arch = arch.slice(0, slash).trim();
  }
  if (!name || !arch) {
    u.send(
      `${ERR}Usage: ${val("+npc/build <name>=<archetype>")}`,
    );
    return;
  }
  const tpl = getNpcTemplate(arch);
  if (!tpl) {
    u.send(
      `${ERR}Unknown archetype ${val(arch)}. ` +
        `${ARR}${val("+npc/templates")}`,
    );
    return;
  }
  const block = buildNpc(tpl, u.me.id, name, aiKey);
  const obj = await u.db.create({
    name,
    flags: new Set(["thing", "npc"]),
    location: roomId(u),
    state: {
      name,
      cprNpc: block,
      owner: u.me.id,
    },
  });
  u.send(
    `${OK}Spawned ${val(name)} ${dim("#" + obj.id)}  ` +
      `${dim(tpl.id)}  ${dim("AI:" + aiKey)}  ` +
      `${dim("HP " + block.hp.max)}.  ` +
      `${ARR}${val("+init")} to open combat.`,
  );
}

async function setAi(
  u: IUrsamuSDK,
  arg: string,
): Promise<void> {
  if (!isStaff(u)) {
    u.send(`${ERR}Staff only.`);
    return;
  }
  const eq = arg.indexOf("=");
  if (eq < 1) {
    u.send(`${ERR}Usage: ${val("+npc/ai <name>=<aiKey>")}`);
    return;
  }
  const who = arg.slice(0, eq).trim();
  const key = arg.slice(eq + 1).trim().toLowerCase();
  if (!key) {
    u.send(`${ERR}Specify AI key (aggressive, manual, …).`);
    return;
  }
  const target = await u.util.target(u.me, who, false);
  if (!target || !npcBlock(target)) {
    u.send(`${ERR}No NPC ${val(who)} here.`);
    return;
  }
  const n = npcBlock(target)!;
  const next = { ...n, aiKey: key };
  await u.db.modify(target.id, "$set", {
    "state.cprNpc": next,
  });
  u.send(
    `${OK}${val(u.util.displayName(target, u.me))} AI → ` +
      `${acc(key)}.`,
  );
  if (!(AI_KEYS as readonly string[]).includes(key)) {
    u.send(
      `${dim("Note:")} ${val(key)} is non-stock; ` +
        `walker falls back if unknown.`,
    );
  }
}

async function destroyNpc(
  u: IUrsamuSDK,
  arg: string,
): Promise<void> {
  if (!isStaff(u)) {
    u.send(`${ERR}Staff only.`);
    return;
  }
  const who = arg.trim();
  if (!who) {
    u.send(`${ERR}Usage: ${val("+npc/destroy <name>")}`);
    return;
  }
  const target = await u.util.target(u.me, who, false);
  if (!target || !isNpcObj(target)) {
    u.send(`${ERR}No NPC ${val(who)} here.`);
    return;
  }
  const label = u.util.displayName(target, u.me);
  await u.db.destroy(target.id);
  u.send(`${OK}Destroyed ${val(label)}.`);
}

async function showNpc(
  u: IUrsamuSDK,
  arg: string,
): Promise<void> {
  const who = arg.trim();
  if (!who) {
    u.send(`${ERR}Usage: ${val("+npc/show <name>")}`);
    return;
  }
  const target = await u.util.target(u.me, who, false);
  const n = target ? npcBlock(target) : null;
  if (!target || !n) {
    u.send(`${ERR}No NPC ${val(who)} here.`);
    return;
  }
  const s = n.stats;
  u.send([
    bar(),
    hdr(n.displayName.toUpperCase()),
    bar(),
    row("ARCHETYPE", val(n.archetype)),
    row("TIER", val(n.tier)),
    row("AI", val(n.aiKey ?? "aggressive")),
    row("HP", val(`${n.hp.current}/${n.hp.max}`)),
    row("WOUND", val(n.woundState)),
    row(
      "WEAPON",
      `${val(n.weapon.name)}  ${dim(n.weapon.skill)} ` +
        `${dim(n.weapon.damageDice + "d6")}`,
    ),
    row(
      "ARMOR",
      n.armorBody
        ? `${val(n.armorBody.name)} SP ` +
          `${acc(String(n.armorBody.currentSp))}/` +
          `${dim(String(n.armorBody.sp))}`
        : dim("none"),
    ),
    div(),
    row(
      "STATS",
      `REF ${s.ref} DEX ${s.dex} BODY ${s.body} ` +
        `WILL ${s.will} COOL ${s.cool}`,
    ),
    bar(),
  ].join("\r\n"));
}

addCmd({
  name: "+npc",
  pattern: /^\+npc(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+npc[/<switch>] [<args>]  -- Street NPCs for FNFF combat.

Switches:
  (none)/list              NPCs in this room.
  /templates               Archetype catalog.
  /build <name>=<arch>     Spawn NPC (staff). Optional /aiKey.
  /create …                Alias for /build.
  /show <name>             Stat block.
  /ai <name>=<key>         Set walker AI (staff).
  /destroy <name>          Remove NPC (staff).

AI keys: aggressive (default), manual|off|none (ST-run),
  llm|ai-gm (optional bridge).

Examples:
  +npc/templates
  +npc/build Razor=boosterganger
  +npc/build Ace=security_operative/aggressive
  +init
  +pass                    NPCs act via base combat AI.`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (!sw || sw === "list") {
      await listRoom(u);
      return;
    }
    if (sw === "templates" || sw === "arch" || sw === "listarch") {
      listTemplates(u);
      return;
    }
    if (sw === "build" || sw === "create" || sw === "spawn") {
      await buildNpcCmd(u, arg);
      return;
    }
    if (sw === "show" || sw === "view" || sw === "stat") {
      await showNpc(u, arg);
      return;
    }
    if (sw === "ai") {
      await setAi(u, arg);
      return;
    }
    if (sw === "destroy" || sw === "kill" || sw === "delete") {
      await destroyNpc(u, arg);
      return;
    }
    u.send(
      `${ERR}Unknown switch. Try ${val("+npc/list")}, ` +
        `${val("+npc/templates")}, ${val("+npc/build")}.`,
    );
  },
});
