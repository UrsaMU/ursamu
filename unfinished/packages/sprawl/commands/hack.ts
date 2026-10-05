/** +hack +console — nodejacking (Cognition vs system DS). */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import {
  footer,
  ARR,
  ERR,
  OK,
  bad,
  header,
  dim,
  panelClose,
  panelOpen,
  good,
  divider,
  scan,
  val,
  ylw,
} from "./chrome.ts";
import {
  gatherBonuses,
  applyResilience,
} from "../engine/action.ts";
import {
  clearPendingGlitch,
  forceCriticalRoll,
  formatCriticalStatus,
  woundGlitch,
} from "../engine/damage.ts";
import { rollCybershellCritical } from "../engine/crit-tables.ts";
import {
  getInventory,
  requireChar,
  saveChar,
} from "../engine/sheet-io.ts";
import { buyStreetItem } from "./gear-buy.ts";
import {
  CONSOLES,
  EXPLOITS,
  SOFTWARE,
  find,
} from "../engine/catalog.ts";
import {
  consoleSpec,
  equipConsole,
  freeSoftwareSlots,
  installSoftware,
  listSoftware,
  removeSoftware,
  usedSoftwareSlots,
} from "../engine/net.ts";
import {
  formatFastHackDice,
  parsePoolDice,
  resolveFastHack,
} from "../engine/fast-hack.ts";
import {
  applySystemResponses,
  effectiveCognition,
  hackBlockedReason,
  netStatusLines,
  tickNetState,
  tryCleanMalware,
} from "../engine/sys-response.ts";
import {
  bankNetExploit,
  consumeExploitHackBuffs,
  formatBankLines,
  netExploitCatalogLines,
  useBankedExploit,
} from "../engine/exploit-inv.ts";
import {
  afterSoftwareHack,
  applyNeuralSoak,
  prepareSoftwareHack,
  useSoftware,
} from "../engine/software-fx.ts";
import {
  buyExpertAi,
  buyExtraRam,
  formatUpgradeCatalog,
  plantLogicBomb,
  tuneFirewall,
} from "../engine/console-upgrade.ts";
import {
  applyHyperionGlitch,
  hullHackParts,
} from "../engine/hull-specials.ts";
import {
  packIntoDemon,
  unpackDemon,
} from "../engine/software-life.ts";
import { maybeLootOnHack } from "../engine/company-loot.ts";
import { useNetHardware } from "../engine/net-hardware.ts";
import {
  flushHeatSpawns,
  pendingSpawnLines,
} from "../engine/heat-spawn.ts";
import {
  consoleWar,
  runApSoftOnPlayer,
} from "../engine/console-war.ts";
import { tryGigHackAfterRoll } from "../engine/gig-systems.ts";

addCmd({
  name: "+console",
  pattern: /^\+console(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+console[/<switch>] [slug]  — Cyberspace deck + software.

Switches:
  /catalog              Hulls (RAM · slots · FW)
  /equip <slug>         Equip a console
  /software             Loaded + catalog
  /load <slug>          Install (uses console slots)
  /unload <slug>        Remove software
  /run <slug>           Launch software effect
  /buy <slug>           Pay b¥ → equip/load (market)
  /upgrade [list|ram|ai|fw|bomb]
  /pack <demon>=s1,s2   Demon pack software
  /unpack <demon>
  /hw <slug>            Nodejacker hardware
  /war <player>         Breach another PC's deck
  /run <soft>=<player>  AP soft vs player
  /clean · /status

Examples:
  +console/pack demon-i=hunter,cloak
  +console/war Alice
  +console/run quiver=Alice`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    let c = requireChar(u);
    if (!c) {
      u.send(`${ARR}No sheet.`);
      return;
    }
    c = tickNetState(c);
    // Flush due heat spawns into the room
    {
      const fl = await flushHeatSpawns(u, c);
      c = fl.next;
      if (fl.notes.length) {
        await saveChar(u, c);
        for (const n of fl.notes) {
          u.send(`${ylw("HEAT")} ${n}`);
        }
      }
    }
    if (!sw) {
      const soft = c.software ?? [];
      const spec = consoleSpec(c);
      const used = usedSoftwareSlots(c);
      const free = freeSoftwareSlots(c);
      const maxSlots = used + free;
      const lines = [
        header("CONSOLE"),
        `  Deck ${spec
          ? val(spec.name)
          : dim("none — +console/equip")}`,
      ];
      if (spec) {
        lines.push(
          `  RAM ${val(spec.ram)}` +
            (spec.ramBonus
              ? dim(`(+${spec.ramBonus})`)
              : "") +
            ` · Slots ${val(used)}/${val(maxSlots)}` +
            ` ${dim(`(${free} free)`)}` +
            ` · FW DS${val(spec.firewall)}` +
            (spec.firewallBonus
              ? dim(`(+${spec.firewallBonus})`)
              : "") +
            ` · +${val(spec.bonus)}`,
        );
        const ai = spec.hullAi + spec.aiCog;
        if (ai > 0) {
          lines.push(
            `  AI Cog ${val(ai)}` +
              (spec.hullAi
                ? ` ${dim(`hull ${spec.hullAi}`)}`
                : "") +
              (spec.aiCog
                ? ` ${dim(`install ${spec.aiCog}`)}`
                : ""),
          );
        }
        if (c.logicBomb) {
          lines.push(
            `  ${ylw("Logic bomb")}` +
              ` DS${c.logicBomb.hideDs}` +
              (c.logicBomb.eventTrigger
                ? " event"
                : " timed"),
          );
        }
      }
      const obs = new Set(c.softwareObsolete ?? []);
      lines.push(
        `  Soft ${soft.length
          ? soft.map((s) =>
            obs.has(s) ? dim(s + "*") : val(s)
          ).join(" ")
          : dim("empty")}`,
      );
      if (c.softwarePacks && Object.keys(c.softwarePacks).length) {
        lines.push(divider("DEMON PACKS"));
        for (const [d, list] of Object.entries(c.softwarePacks)) {
          const n = list.length;
          lines.push(
            `  ${val(d)} ${dim(`(${n})`)} ` +
              (list.length
                ? list.map((s) => val(s)).join(" ")
                : dim("empty")),
          );
        }
        lines.push(
          `  ${dim("+console/pack d=a,b · /unpack d")}`,
        );
      } else if (soft.some((s) => s.startsWith("demon-"))) {
        lines.push(
          `  ${dim("Demon loaded — pack with")}` +
            ` ${val("+console/pack demon-i=soft,soft")}`,
        );
      }
      if (obs.size) {
        lines.push(`  ${dim("* obsolete — no bonus")}`);
      }
      for (const L of netStatusLines(c)) {
        lines.push(`  ${ylw("NET")} ${L}`);
      }
      for (const L of pendingSpawnLines(c)) {
        lines.push(`  ${ylw("ETA")} ${L}`);
      }
      lines.push(footer("NODE"));
      u.send(lines.join("\r\n"));
      return;
    }
    if (sw === "status" || sw === "net") {
      const lines = [header("NET STATE")];
      const st = netStatusLines(c);
      if (!st.length) lines.push(`  ${dim("clear")}`);
      for (const L of st) lines.push(`  ${L}`);
      lines.push(footer("NODE"));
      u.send(lines.join("\r\n"));
      return;
    }
    if (sw === "clean" || sw === "purge") {
      const r = tryCleanMalware(c);
      await saveChar(u, r.next);
      u.send(
        r.notes[0]?.includes("purged")
          ? `${OK}${r.notes[0]}`
          : `${ARR}${r.notes[0] ?? "no effect"}`,
      );
      return;
    }
    if (sw === "run" || sw === "use" || sw === "launch") {
      if (!arg) {
        u.send(
          `${ERR}Usage: ${val("+console/run <slug>")}` +
            ` or ${val("+console/run soft=player")}`,
        );
        return;
      }
      // AP soft vs player: quiver=Alice
      const eq = arg.indexOf("=");
      if (eq > 0) {
        const soft = arg.slice(0, eq).trim();
        const who = arg.slice(eq + 1).trim();
        const war = await runApSoftOnPlayer(u, c, soft, who);
        if (!war.ok) {
          u.send(`${ERR}${war.error}`);
          return;
        }
        await saveChar(u, war.attacker);
        u.send(
          [
            `${OK}AP SOFT`,
            ...war.notes.map((n) => `  ${n}`),
          ].join("\r\n"),
        );
        if (war.defenderId) {
          for (const n of war.notes) {
            u.send(`${ylw("NETWAR")} ${n}`, war.defenderId);
          }
        }
        return;
      }
      const r = useSoftware(c, arg);
      if (r.error) {
        u.send(`${ERR}${r.error}`);
        return;
      }
      await saveChar(u, r.next);
      u.send(
        [
          `${OK}Software`,
          ...r.notes.map((n) => `  ${n}`),
        ].join("\r\n"),
      );
      return;
    }
    if (sw === "war" || sw === "breach" || sw === "deckwar") {
      if (!arg) {
        u.send(`${ERR}Usage: ${val("+console/war <player>")}`);
        return;
      }
      const war = await consoleWar(u, c, arg);
      if (!war.ok) {
        u.send(`${ERR}${war.error}`);
        return;
      }
      await saveChar(u, war.attacker);
      u.send(
        [
          `${OK}CONSOLE WAR`,
          ...war.notes.map((n) => `  ${n}`),
        ].join("\r\n"),
      );
      if (war.defenderId) {
        u.send(
          `${ylw("NETWAR")} ${u.me.name} hit your deck!`,
          war.defenderId,
        );
        for (const n of war.notes.slice(0, 4)) {
          u.send(`  ${n}`, war.defenderId);
        }
      }
      return;
    }
    if (sw === "buy" || sw === "purchase") {
      if (!arg) {
        u.send(
          `${ERR}Usage: ${val("+console/buy <console|soft>")}` +
            `  ${dim("or +market console")}`,
        );
        return;
      }
      const res = await buyStreetItem(u, c, arg);
      u.send(res.msg);
      return;
    }
    if (sw === "pack") {
      const eq = arg.indexOf("=");
      if (eq < 0) {
        u.send(
          `${ERR}Usage: ` +
            `${val("+console/pack demon-i=soft1,soft2")}`,
        );
        return;
      }
      const demon = arg.slice(0, eq).trim();
      const softs = arg.slice(eq + 1).split(",")
        .map((s) => s.trim()).filter(Boolean);
      const r = packIntoDemon(c, demon, softs);
      if ("error" in r) {
        u.send(`${ERR}${r.error}`);
        return;
      }
      await saveChar(u, r);
      u.send(
        `${OK}Packed ${val(softs.join(", "))} → ${val(demon)}`,
      );
      return;
    }
    if (sw === "unpack") {
      if (!arg) {
        u.send(`${ERR}Usage: ${val("+console/unpack <demon>")}`);
        return;
      }
      const r = unpackDemon(c, arg);
      if ("error" in r) {
        u.send(`${ERR}${r.error}`);
        return;
      }
      await saveChar(u, r);
      u.send(`${OK}Unpacked ${val(arg)}.`);
      return;
    }
    if (sw === "hw" || sw === "hardware" || sw === "tool") {
      if (!arg) {
        u.send(`${ERR}Usage: ${val("+console/hw <slug>")}`);
        return;
      }
      const r = useNetHardware(c, arg);
      if (!r.ok) {
        u.send(`${ERR}${r.error}`);
        return;
      }
      await saveChar(u, r.next);
      u.send(
        [`${OK}Hardware`, ...r.notes.map((n) => `  ${n}`)]
          .join("\r\n"),
      );
      return;
    }
    if (
      sw === "upgrade" || sw === "upgrades" ||
      sw === "mod" || sw === "tune"
    ) {
      const parts = arg.toLowerCase().split(/\s+/).filter(Boolean);
      const kind = parts[0] ?? "list";
      if (
        !kind || kind === "list" || kind === "catalog" ||
        kind === "help"
      ) {
        u.send(
          [
            header("CONSOLE UPGRADES"),
            ...formatUpgradeCatalog().map((L) =>
              L.length > 78 ? L.slice(0, 75) + "…" : L
            ),
            `  ${dim("+console/upgrade ram [n]")}`,
            `  ${dim("+console/upgrade ai [n]")}`,
            `  ${dim("+console/upgrade fw")}`,
            `  ${dim("+console/upgrade bomb [event] [note]")}`,
            footer("NODE"),
          ].join("\r\n"),
        );
        return;
      }
      if (!consoleSpec(c)) {
        u.send(`${ERR}Equip a console first.`);
        return;
      }
      const nPts = parts[1] && /^\d+$/.test(parts[1])
        ? Number(parts[1])
        : 1;
      let res;
      if (kind === "ram" || kind === "memory") {
        res = buyExtraRam(c, nPts);
      } else if (
        kind === "ai" || kind === "expert" || kind === "agent"
      ) {
        res = buyExpertAi(c, nPts);
      } else if (
        kind === "fw" || kind === "firewall" || kind === "tune"
      ) {
        res = tuneFirewall(c);
      } else if (
        kind === "bomb" || kind === "logic" ||
        kind === "logic-bomb"
      ) {
        res = plantLogicBomb(c, parts.slice(1).join(" "));
      } else {
        u.send(
          `${ERR}Unknown upgrade. ` +
            `${val("+console/upgrade list")}`,
        );
        return;
      }
      if (!res.ok) {
        u.send(`${ERR}${res.error}`);
        return;
      }
      await saveChar(u, res.next);
      u.send(
        [
          `${OK}Upgrade`,
          ...res.notes.map((n) => `  ${n}`),
        ].join("\r\n"),
      );
      return;
    }
    if (sw === "catalog") {
      const lines = [header("CONSOLES")];
      for (const r of CONSOLES) {
        const slots = r.slots === "cognition"
          ? "Cog"
          : String(r.slots ?? "?");
        lines.push(
          `  ${val(r.slug)}` +
            ` RAM${r.ram ?? "?"} · sl${slots}` +
            ` · FW${r.firewall ?? "?"}` +
            ` · ${dim(String(r.cost ?? "?"))}b¥`,
        );
        lines.push(`    ${dim(String(r.name))}`);
      }
      lines.push(footer());
      u.send(lines.join("\r\n"));
      return;
    }
    if (sw === "software" || sw === "soft") {
      const lines = [header("SOFTWARE")];
      const have = new Set(c.software ?? []);
      const spec = consoleSpec(c);
      const used = usedSoftwareSlots(c);
      if (spec) {
        lines.push(
          `  ${dim("Slots")} ${val(used)}/${val(spec.slots)}` +
            ` · ${dim(spec.slug)}`,
        );
      } else {
        lines.push(`  ${dim("No console equipped")}`);
      }
      lines.push(`  ${dim("Loaded:")}`);
      if (!have.size) lines.push(`  ${dim("(none)")}`);
      for (const s of have) {
        const row = find("software", s);
        const cost = Number(row?.slots ?? 1) || 1;
        lines.push(
          `  ${val(s)} ${dim("sl" + cost)}` +
            ` ${dim(String(row?.name ?? ""))}`,
        );
      }
      lines.push(divider("CATALOG"));
      for (const r of listSoftware()) {
        const on = have.has(r.slug) ? ylw(" ✓") : "";
        const cost = Number(r.slots ?? 1) || 1;
        lines.push(
          `  ${val(r.slug)}${on}` +
            ` ${dim("sl" + cost)}` +
            ` ${dim(String(r.name))}`,
        );
      }
      lines.push(footer("NODE"));
      u.send(lines.join("\r\n"));
      return;
    }
    if (sw === "load" || sw === "install") {
      if (!arg) {
        u.send(`${ERR}Usage: ${val("+console/load <slug>")}`);
        return;
      }
      const r = installSoftware(c, arg);
      if ("error" in r) {
        u.send(`${ERR}${r.error}`);
        return;
      }
      await saveChar(u, r);
      const spec = consoleSpec(r);
      const used = usedSoftwareSlots(r);
      const max = spec?.slots ?? "?";
      u.send(
        `${OK}Loaded ${val(arg)}` +
          ` (${val(used)}/${val(max)} slots).`,
      );
      return;
    }
    if (sw === "unload" || sw === "remove") {
      if (!arg) {
        u.send(`${ERR}Usage: ${val("+console/unload <slug>")}`);
        return;
      }
      const r = removeSoftware(c, arg);
      if ("error" in r) {
        u.send(`${ERR}${r.error}`);
        return;
      }
      await saveChar(u, r);
      const spec = consoleSpec(r);
      const used = usedSoftwareSlots(r);
      u.send(
        `${OK}Unloaded ${val(arg)}` +
          (spec
            ? ` (${val(used)}/${val(spec.slots)} slots).`
            : "."),
      );
      return;
    }
    if (sw === "equip") {
      if (!arg) {
        u.send(`${ERR}Usage: ${val("+console/equip <slug>")}`);
        return;
      }
      const r = equipConsole(c, arg);
      if ("error" in r) {
        u.send(`${ERR}${r.error}`);
        return;
      }
      await saveChar(u, r);
      const spec = consoleSpec(r)!;
      u.send(
        `${OK}Equipped ${val(spec.name)}.` +
          ` RAM ${val(spec.ram)}` +
          ` · slots ${val(spec.slots)}` +
          ` · FW DS${val(spec.firewall)}` +
          ` · +${val(spec.bonus)} hack.`,
      );
      return;
    }
    u.send(
      `${ERR}Switches: /catalog /equip /load /run /war` +
        ` /buy /upgrade /pack /hw /clean /status`,
    );
  },
});

addCmd({
  name: "+hack",
  pattern: /^\+hack(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+hack[/<exploit>] <ds|name> [dN] [+upgrade|+glitch]
  — Fast Hack: pool = Cognition + RAM d6.

Need a console equipped. Sum dice + bonuses > DS.
1s → System Response · 6s → net Exploit.

On gig sites: +hack camera · +hack 12 · +hack primary
Optional dN rolls fewer dice (default = full pool).

Examples:
  +hack 12
  +hack sec-camera d4
  +hack/find 10 +upgrade`,

  exec: async (u: IUrsamuSDK) => {
    const exploitSw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const raw = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    if (!raw && !exploitSw) {
      u.send(
        `${ERR}Usage: ${val("+hack[/<exploit>] <ds|name> [dN]")}`,
      );
      return;
    }
    let c = requireChar(u);
    if (!c) {
      u.send(`${ARR}No sheet.`);
      return;
    }
    c = tickNetState(c);
    {
      const fl = await flushHeatSpawns(u, c);
      c = fl.next;
      if (fl.notes.length) {
        for (const n of fl.notes) {
          u.send(`${ylw("HEAT")} ${n}`);
        }
      }
    }
    const blocked = hackBlockedReason(c);
    if (blocked) {
      u.send(`${ERR}${blocked}`);
      await saveChar(u, c);
      return;
    }
    const spec = consoleSpec(c);
    if (!spec) {
      u.send(
        `${ERR}Equip a console first: ` +
          `${val("+console/equip <slug>")}`,
      );
      return;
    }

    let ds = 10;
    let rest = raw;
    let exploit = find("exploit", exploitSw);
    if (!exploit && exploitSw && /^\d+$/.test(exploitSw)) {
      ds = Number(exploitSw);
      rest = raw;
    } else if (exploit) {
      ds = Number(exploit.ds ?? 10);
      const parts = raw.split(/\s+/);
      if (parts[0] && /^\d+$/.test(parts[0])) {
        ds = Number(parts[0]);
        rest = parts.slice(1).join(" ");
      }
    } else {
      const parts = (exploitSw ? exploitSw + " " : "")
        .concat(raw)
        .trim()
        .split(/\s+/);
      if (parts[0] && find("exploit", parts[0])) {
        exploit = find("exploit", parts[0]);
        ds = Number(exploit?.ds ?? 10);
        parts.shift();
      }
      if (parts[0] && /^\d+$/.test(parts[0])) {
        ds = Number(parts[0]);
        parts.shift();
      }
      rest = parts.join(" ");
    }

    const tokens = rest.toLowerCase().split(/\s+/).filter(Boolean);
    const pooled = parsePoolDice(tokens);
    const hadPending = (c.pendingGlitch ?? 0) > 0;
    let glitch = woundGlitch(c);
    let upgrade = 0;
    let extra = 0;
    for (const t of pooled.rest) {
      if (t === "+glitch" || t === "glitch") glitch++;
      if (t === "+upgrade" || t === "upgrade") upgrade++;
      if (/^\+\d+$/.test(t)) extra += Number(t.slice(1));
    }

    const consoleBonus = spec.bonus;
    const parts: string[] = [];
    if (consoleBonus) {
      parts.push(`${spec.slug} +${consoleBonus}`);
      extra += consoleBonus;
    }
    const buffs = consumeExploitHackBuffs(c);
    c = buffs.next;
    const soft = prepareSoftwareHack(
      c,
      exploit ? String(exploit.slug ?? "") : "",
    );
    extra += soft.bonus;
    parts.push(...soft.parts);
    if (exploit) parts.push(`exploit ${exploit.name}`);
    upgrade += soft.autoUpgrade + buffs.autoUpgrade;
    const hull = hullHackParts(spec);
    extra += hull.bonus;
    parts.push(...hull.parts);

    // Easy scripter: coding DS floor 12
    if (
      c.net?.easyScripter &&
      exploit &&
      String(exploit.slug) === "coding"
    ) {
      ds = Math.min(ds, 12);
    }

    const { items, load } = await getInventory(u, u.me);
    const gath = gatherBonuses(
      c,
      "cognition",
      extra,
      parts,
      load,
      items,
    );

    const ice = c.net?.iceDsBonus ?? 0;
    if (ice > 0) ds += ice;
    if (soft.dsPenalty > 0) {
      ds = Math.max(1, ds - soft.dsPenalty);
    }

    const hyp = applyHyperionGlitch(c, spec, glitch);
    c = hyp.next;
    glitch = hyp.glitch;

    const cog = effectiveCognition(c);
    const result = resolveFastHack({
      cognition: cog,
      ram: spec.ram,
      diceCount: pooled.dice,
      bonuses: gath.total,
      ds,
      glitch,
      upgrade,
    });

    let sheet = c;
    if (hadPending) {
      sheet = clearPendingGlitch(sheet);
    }
    let neural = result.damageToSelf;
    const title = exploit
      ? String(exploit.name)
      : `DS${ds}`;
    const lines = [
      panelOpen("FAST HACK", title),
      scan(),
      `  Pool ${val(result.diceCount)}` +
        `/${val(result.poolMax)}` +
        ` ${dim(`Cog${cog}+RAM${spec.ram}`)}` +
        (ice ? ` ${ylw("ICE+" + ice)}` : ""),
      `  Dice ${dim(formatFastHackDice(result))}` +
        ` = ${val(result.diceSum)}`,
      `  Bonus ${val(result.bonuses)}` +
        (gath.parts.length
          ? ` ${dim(gath.parts.join(", "))}`
          : ""),
      `  Total ${val(result.total)} vs DS ${val(ds)}` +
        ` → ${
          result.success ? good("IN") : bad("BURNED")
        }`,
    ];
    if (hadPending) {
      lines.push(
        `  ${dim("ICE Glitch spent (was sticky)")}`,
      );
    }
    for (const n of soft.notes) {
      lines.push(`  ${dim("SOFT")} ${n}`);
    }
    for (const n of buffs.notes) {
      lines.push(`  ${ylw("BANK")} ${n}`);
    }
    for (const n of hyp.notes) {
      lines.push(`  ${dim("HULL")} ${n}`);
    }
    if (result.ones) {
      lines.push(
        `  ${ylw("1s")} ×${result.ones} → responses`,
      );
    }
    if (result.sixes) {
      lines.push(
        `  ${good("6s")} ×${result.sixes} → exploits`,
      );
    }

    for (const sys of result.responses) {
      lines.push(
        `  ${ylw("SYSTEM")} ${sys.name}` +
          ` — ${dim(sys.blurb)}`,
      );
      neural += sys.extraNeural;
    }
    const applied = applySystemResponses(
      sheet,
      result.responses,
    );
    sheet = applied.next;
    neural += applied.neural;
    for (const note of applied.notes) {
      lines.push(`  ${bad("→")} ${note}`);
    }
    for (const ex of result.exploits) {
      sheet = bankNetExploit(sheet, ex.slug);
      lines.push(
        `  ${good("EXPLOIT")} ${ex.name}` +
          (ex.roll ? ` ${dim("d66 " + ex.roll)}` : "") +
          ` — ${dim(ex.blurb)}`,
      );
    }

    if (neural > 0) {
      const soaked = applyNeuralSoak(neural, soft.neuralSoak);
      neural = soaked.neural;
      if (soaked.blocked) {
        lines.push(
          `  ${good("Neuroshield")} absorbs ${soaked.blocked}`,
        );
      }
      if (neural > 0) {
        sheet = applyResilience(sheet, -neural);
        lines.push(`  ${bad("Neural damage " + neural)}`);
      } else {
        lines.push(`  ${dim("no neural damage")}`);
      }
    } else {
      lines.push(`  ${dim("no feedback")}`);
    }

    const post = afterSoftwareHack(sheet, {
      success: result.success,
      resilienceAfterNeural: sheet.resilience,
    });
    sheet = post.next;
    for (const n of post.notes) {
      lines.push(`  ${good("SOFT")} ${n}`);
    }

    const loot = maybeLootOnHack(sheet, {
      success: result.success,
      exploitSlug: exploit
        ? String(exploit.slug ?? "")
        : undefined,
    });
    sheet = loot.next;
    for (const n of loot.notes) {
      lines.push(`  ${ylw("LOOT")} ${n}`);
    }

    if (sheet.resilience <= 0 && !sheet.critical) {
      const injury = sheet.isCybershell
        ? rollCybershellCritical(false)
        : undefined;
      const forced = forceCriticalRoll(sheet, { injury });
      sheet = forced.next;
      lines.push(`  ${bad("RES 0")} — neural critical`);
      for (const L of formatCriticalStatus(forced.injury)) {
        lines.push(L);
      }
    } else if (sheet.resilience <= 0 && sheet.critical) {
      lines.push(
        `  ${bad("RES 0")} · crit ${sheet.critical.location}` +
          ` sev${sheet.critical.severity}`,
      );
    }

    if (result.success) {
      const nameBits = raw.split(/\s+/).filter((t) =>
        t &&
        !/^\+/.test(t) &&
        !/^\d+$/.test(t) &&
        !/^(?:d|#|pool:?|dice:?)\d+$/i.test(t) &&
        !/^\d+d$/i.test(t) &&
        t !== "glitch" &&
        t !== "upgrade"
      );
      const ref = nameBits[0] ??
        (exploit && !/^\d+$/.test(exploitSw)
          ? String(exploit.slug)
          : String(ds));
      const gigHack = await tryGigHackAfterRoll(
        u,
        sheet,
        ds,
        ref,
      );
      sheet = gigHack.next;
      for (const n of gigHack.notes) {
        lines.push(`  ${good(n)}`);
      }
    }

    await saveChar(u, sheet);

    lines.push(
      `  Res ${val(sheet.resilience)}` +
        `/${val(sheet.resilienceMax)}`,
    );
    if (sheet.pendingGlitch) {
      lines.push(
        `  ${ylw("Pending Glitch")} ×${sheet.pendingGlitch}`,
      );
    }
    if (sheet.critical) {
      lines.push(
        `  ${dim("+critical · +stabilize · +clinic")}`,
      );
    }
    lines.push(panelClose("NODE"));
    u.send(lines.join("\r\n"));
    void SOFTWARE;
  },
});

addCmd({
  name: "+exploit",
  pattern: /^\+exploit(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+exploit[/<switch>] [ref]  — Bank + action exploits.

Bank fills when Fast Hack rolls 6s.
Spend with /use before the edge goes cold.

Switches:
  (none)|/bank     Held bank from 6s
  /use <n|slug>    Spend banked exploit
  /catalog [q]     d66 net exploit table
  /actions [q]     Action verbs + DS (+hack/find)

Examples:
  +exploit
  +exploit/use 1
  +exploit/use vulnerability
  +exploit/catalog zero`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    let c = requireChar(u);
    if (!c) {
      u.send(`${ARR}No sheet.`);
      return;
    }
    c = tickNetState(c);

    if (
      sw === "use" || sw === "spend" || sw === "burn" ||
      sw === "play"
    ) {
      if (!arg) {
        u.send(
          `${ERR}Usage: ${val("+exploit/use <n|slug>")}`,
        );
        return;
      }
      const r = useBankedExploit(c, arg);
      if (!r.ok) {
        u.send(`${ERR}${r.error}`);
        return;
      }
      await saveChar(u, r.next);
      u.send(
        [
          `${OK}Exploit`,
          ...r.notes.map((n) => `  ${n}`),
        ].join("\r\n"),
      );
      return;
    }

    if (
      sw === "catalog" || sw === "table" || sw === "d66" ||
      sw === "net"
    ) {
      const lines = [
        header("NET EXPLOITS d66"),
        ...netExploitCatalogLines(arg),
        `  ${dim("Gained on 6s · +exploit/use to spend")}`,
        footer("NODE"),
      ];
      u.send(lines.join("\r\n"));
      return;
    }

    if (
      sw === "actions" || sw === "verbs" || sw === "action"
    ) {
      const q = arg.toLowerCase();
      const lines = [header("HACK ACTIONS")];
      for (const e of EXPLOITS) {
        if (
          q &&
          !e.slug.includes(q) &&
          !String(e.name).toLowerCase().includes(q)
        ) {
          continue;
        }
        lines.push(
          `  ${val(e.slug)} DS${val(e.ds as number)}` +
            ` ${dim(String(e.blurb ?? "").slice(0, 40))}`,
        );
      }
      lines.push(
        `  ${dim("+hack/<action> <ds|target>")}`,
        footer(),
      );
      u.send(lines.join("\r\n"));
      return;
    }

    // default / bank / bare arg filter on bank or actions
    if (
      !sw || sw === "bank" || sw === "inv" || sw === "held" ||
      sw === "list"
    ) {
      const lines = [
        header("EXPLOIT BANK"),
        ...formatBankLines(c),
        divider("BUFFS"),
      ];
      const st = netStatusLines(c).filter((L) =>
        /bank|block|stealth|extra|immuno|back door|scripter/i
          .test(L)
      );
      if (!st.length) lines.push(`  ${dim("no active buffs")}`);
      else for (const L of st) lines.push(`  ${L}`);
      lines.push(
        `  ${dim("+exploit/use <n> · /catalog · /actions")}`,
        footer("NODE"),
      );
      u.send(lines.join("\r\n"));
      // if bare name matches action, also hint
      if (arg) {
        const e = EXPLOITS.find((x) =>
          x.slug.includes(arg) ||
          String(x.name).toLowerCase().includes(arg)
        );
        if (e) {
          u.send(
            `${ARR}Action ${val(e.slug)} DS${e.ds} — ` +
              `${val("+hack/" + e.slug)} ` +
              `or ${val("+exploit/actions")}`,
          );
        }
      }
      return;
    }

    // +exploit/control style via switch as action name
    if (sw && !arg) {
      const e = EXPLOITS.find((x) =>
        x.slug === sw ||
        String(x.name).toLowerCase() === sw
      );
      if (e) {
        u.send(
          [
            header(String(e.name).toUpperCase()),
            `  ${val(e.slug)} DS${val(e.ds as number)}`,
            `  ${dim(String(e.blurb ?? ""))}`,
            `  ${dim("+hack/" + e.slug + " <ds|target>")}`,
            footer(),
          ].join("\r\n"),
        );
        return;
      }
    }

    u.send(
      `${ERR}Switches: /bank /use /catalog /actions`,
    );
  },
});
