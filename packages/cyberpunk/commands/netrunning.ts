/**
 * +netrun -- Netrunning and NET Architecture Commands
 */
import { addCmd, DBO } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import type { ICPRCharacter, INetrun, INetArchitecture } from "../db/schemas.ts";
import { bar, div, hdr, lbl, val, acc, dim, ARR, ERR, OK, row } from "./chargen.ts";
import {
  resolveInterfaceAbility, resolveIceAttack, resolveProgramAttack,
  getCurrentFloor, advanceFloor, getFloor, appendNetLog,
  buildSimpleArchitecture, getNetActionsPerTurn,
  hasNetActionsRemaining,
} from "../engine/netrunning.ts";
import { INTERFACE_ABILITIES, PROGRAMS } from "../data/programs.ts";
import type { InterfaceAbilityName } from "../data/programs.ts";
import { emitNetrunAction, emitNetrunIceHit, emitNetrunBreach } from "../engine/emitters.ts";

const netrunDB = new DBO<INetrun>("cpr.netruns");
const archDB = new DBO<INetArchitecture>("cpr.architectures");

addCmd({
  name: "+netrun",
  pattern: /^\+netrun(?:\/(jack|jack_out|action|programs|status|build|endturn))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+netrun[/<switch>] [<argument>]  -- Access and navigate NET architectures.

Switches:
  /jack <architecture>       Jack into a NET architecture.
  /jack_out                  Disconnect from the NET.
  /status                    Show current floor, defenses, and NET actions.
  /action <ability> [vs <DV>]  Use an Interface Ability.
  /programs                  Show your loaded programs.
  /build <name> <floors> <DV>  (Admin) Create a simple architecture.
  /endturn                   End your NET turn, resetting your action budget.

Interface Abilities: backdoor, cloak, control, eye_dee, pathfinder,
                     scanner, slide, virus, zap

Examples:
  +netrun/jack Arasaka_Tower    Jack into an architecture.
  +netrun/status                See your current position.
  +netrun/action pathfinder     Map the architecture.
  +netrun/action backdoor vs 18 Bypass a password (DV 18).
  +netrun/endturn               End turn and reset NET action budget.
  +netrun/jack_out              Disconnect safely.`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "status").toLowerCase().trim().replace("-", "_");
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character on file.`); return; }
    if (cpr.role !== "netrunner" && sw !== "build" && sw !== "status") {
      u.send(`${ERR}Only Netrunners can jack into the NET directly.`); return;
    }

    if (sw === "build") { await buildArch(u, arg); return; }
    if (sw === "jack") { await jackIn(u, cpr, arg); return; }
    if (sw === "jack_out") { await jackOut(u, cpr); return; }
    if (sw === "status") { await showStatus(u, cpr); return; }
    if (sw === "action") { await doAction(u, cpr, arg); return; }
    if (sw === "programs") { showPrograms(u, cpr); return; }
    if (sw === "endturn") { await endTurn(u, cpr); return; }
    u.send(`${ERR}Unknown switch "/${sw}".`);
  },
});

async function jackIn(u: IUrsamuSDK, cpr: ICPRCharacter, archName: string): Promise<void> {
  const existing = (await netrunDB.find({ runnerId: u.me.id, active: true }))[0];
  if (existing) { u.send(`${ERR}Already jacked in. Use +netrun/jack_out first.`); return; }

  if (!archName) { u.send(`${ARR}Specify target: +netrun/jack <architecture>`); return; }

  const arch = (await archDB.find({ name: archName, roomId: u.me.location }))[0]
    ?? (await archDB.find({ name: archName }))[0];
  if (!arch) { u.send(`${ERR}NET architecture "${archName}" not found.`); return; }

  const netrun: INetrun = {
    id: crypto.randomUUID(),
    archId: arch.id,
    runnerId: u.me.id,
    runnerName: u.util.displayName(u.me, u.me),
    active: true,
    startedAt: Date.now(),
    currentFloor: { [u.me.id]: 0 },
    actionsUsedThisTurn: 0,
    log: [`${u.util.displayName(u.me, u.me)} jacked into ${arch.name}`],
  };

  await netrunDB.create(netrun);
  u.send([
    bar(),
    hdr(`jacking in -- ${arch.name}`),
    div(),
    row("TARGET ARCH",   val(arch.name)),
    row("TOTAL FLOORS",  val(arch.totalFloors)),
    row("NET ACTIONS",   val(getNetActionsPerTurn(cpr))),
    div(),
    row("FLOOR 1 TYPE",  val(arch.floors[0]?.type ?? "?")),
    row("FLOOR 1 DV",    val(arch.floors[0]?.dv ?? "?")),
    bar(),
  ].join("\r\n"));
}

async function jackOut(u: IUrsamuSDK, cpr: ICPRCharacter): Promise<void> {
  const netrun = (await netrunDB.find({ runnerId: u.me.id, active: true }))[0];
  if (!netrun) { u.send(`${ERR}Not jacked in.`); return; }
  await netrunDB.update({ id: netrun.id }, { active: false });
  u.send(`${OK}Jacked out. Meat-side connection closed.`);
}

async function showStatus(u: IUrsamuSDK, cpr: ICPRCharacter): Promise<void> {
  const netrun = (await netrunDB.find({ runnerId: u.me.id, active: true }))[0];
  if (!netrun) { u.send(`${ERR}Not jacked in.`); return; }

  const arch = (await archDB.find({ id: netrun.archId }))[0];
  const floorIdx = getCurrentFloor(netrun, u.me.id);
  const floor = arch ? getFloor(arch.floors, floorIdx) : null;

  u.send([
    bar(),
    hdr("net status"),
    div(),
    row("ARCHITECTURE",  val(arch?.name ?? "UNKNOWN")),
    row("CURRENT FLOOR", `${val(floorIdx + 1)} ${dim("of")} ${val(arch?.totalFloors ?? "?")}`),
    row("FLOOR TYPE",    val(floor?.type ?? "?")),
    row("FLOOR DV",      val(floor?.dv ?? "?")),
    div(),
    row("NET ACTIONS",   val(getNetActionsPerTurn(cpr))),
    row("INT",           val(cpr.stats.int)),
    row("INTERFACE",     val(cpr.skills["interface"] ?? 0)),
    bar(),
  ].join("\r\n"));
}

async function doAction(u: IUrsamuSDK, cpr: ICPRCharacter, arg: string): Promise<void> {
  const netrun = (await netrunDB.find({ runnerId: u.me.id, active: true }))[0];
  if (!netrun) { u.send(`${ERR}Not jacked in. Use +netrun/jack <architecture>.`); return; }

  // Turn budget enforcement
  if (!hasNetActionsRemaining(netrun, cpr)) {
    u.send(`${ERR}No NET actions remaining this turn. Use +netrun/endturn to advance.`);
    return;
  }
  const actionsUsed = netrun.actionsUsedThisTurn ?? 0;

  const arch = (await archDB.find({ id: netrun.archId }))[0];
  const floorIdx = getCurrentFloor(netrun, u.me.id);
  const floor = arch ? getFloor(arch.floors, floorIdx) : null;

  // Parse: "abilityName [vs DV]"
  const vsMatch = arg.match(/^(\S+)(?:\s+vs\s+(\d+))?$/i);
  const abilityRaw = vsMatch?.[1]?.toLowerCase().replace(/-/g, "_") ?? arg;
  const forcedDV = vsMatch?.[2] ? parseInt(vsMatch[2], 10) : undefined;

  const abilityName = abilityRaw as InterfaceAbilityName;
  if (!INTERFACE_ABILITIES.includes(abilityName)) {
    u.send([
      `${ERR}Unknown ability.`,
      `${ARR}Valid: ${INTERFACE_ABILITIES.join(", ")}`,
    ].join("\r\n"));
    return;
  }

  const floorDV = forcedDV ?? floor?.dv ?? 15;
  const result = resolveInterfaceAbility(cpr, abilityName, floorDV);

  // Consume one NET action
  await netrunDB.update({ id: netrun.id }, { actionsUsedThisTurn: actionsUsed + 1 } as Partial<INetrun>);

  const abilityLabel = abilityName.replace(/_/g, " ").toUpperCase();
  const outcomeTag = result.success ? `${OK}${acc("SUCCESS")}` : `${ERR}%crFAILED%cn`;
  u.send([
    div(),
    row("ABILITY",  val(abilityLabel)),
    row("ROLL",     `${val(result.roll)}  ${dim("total")} ${val(result.total)}  ${dim("vs DV")} ${val(floorDV)}`),
    row("RESULT",   outcomeTag),
    `  ${dim(result.effect)}`,
    div(),
  ].join("\r\n"));

  await emitNetrunAction(u.me, cpr, abilityName, result.success);

  // Advance floor on successful backdoor/pathfinder
  if (result.success && (abilityName === "backdoor") && floor) {
    const updated = advanceFloor(netrun, u.me.id);
    const nextFloor = arch ? getFloor(arch.floors, getCurrentFloor(updated, u.me.id)) : null;
    await netrunDB.update({ id: netrun.id }, { currentFloor: updated.currentFloor });
    if (nextFloor) {
      u.send([
        `${OK}Breach -- advancing to floor ${val(getCurrentFloor(updated, u.me.id) + 1)}.`,
        row("FLOOR TYPE", val(nextFloor.type)),
        row("FLOOR DV",   val(nextFloor.dv)),
      ].join("\r\n"));
      await emitNetrunBreach(u.me, arch?.name ?? "unknown", getCurrentFloor(updated, u.me.id));
    } else {
      u.send([
        bar("="),
        hdr("architecture breached"),
        `  ${OK}Core reached. Full system access.`,
        bar("="),
      ].join("\r\n"));
    }
  }
}

async function endTurn(u: IUrsamuSDK, cpr: ICPRCharacter): Promise<void> {
  const netrun = (await netrunDB.find({ runnerId: u.me.id, active: true }))[0];
  if (!netrun) { u.send(`${ERR}Not jacked in.`); return; }

  await netrunDB.update({ id: netrun.id }, { actionsUsedThisTurn: 0 } as Partial<INetrun>);
  const netActionsPerTurn = getNetActionsPerTurn(cpr);
  const msg = `${OK}New turn begins -- ${val(String(netActionsPerTurn))} NET actions available.`;
  u.send(msg);
  u.here.broadcast?.(msg, { exclude: [u.me.id] });
}

function showPrograms(u: IUrsamuSDK, cpr: ICPRCharacter): void {
  const loaded = (cpr.roleData as Record<string, unknown>)?.programs as string[] | undefined;
  const lines: string[] = [
    bar(),
    hdr("deck -- loaded programs"),
    div(),
  ];
  if (!loaded || loaded.length === 0) {
    lines.push(`  ${dim("No programs loaded. Discuss role items with staff.")}`);
  } else {
    for (const progName of loaded) {
      const prog = PROGRAMS.find((p) => p.name === progName);
      if (prog) {
        lines.push(row(
          prog.name.replace(/_/g, " ").toUpperCase(),
          `${lbl("ATK/DEF")} ${val(prog.atk ?? prog.def ?? 0)}  ${dim(prog.effect)}`,
        ));
      }
    }
  }
  lines.push(bar());
  u.send(lines.join("\r\n"));
}

async function buildArch(u: IUrsamuSDK, arg: string): Promise<void> {
  const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard");
  if (!isAdmin) { u.send(`${ERR}Admin access required.`); return; }

  const parts = arg.split(" ");
  if (parts.length < 3) { u.send(`${ARR}Usage: +netrun/build <name> <floors> <floorDV>`); return; }
  const archName = parts[0];
  const floors = parseInt(parts[1], 10);
  const floorDV = parseInt(parts[2], 10);

  if (isNaN(floors) || floors < 1 || floors > 20) { u.send(`${ERR}Floors must be 1-20.`); return; }
  if (isNaN(floorDV)) { u.send(`${ERR}DV must be a number.`); return; }

  const arch = buildSimpleArchitecture(archName, u.me.id, u.me.location ?? "", floors, floorDV);
  await archDB.create(arch);
  u.send([
    `${OK}NET architecture compiled.`,
    row("NAME",   val(archName)),
    row("FLOORS", val(floors)),
    row("DV",     val(floorDV)),
  ].join("\r\n"));
}
