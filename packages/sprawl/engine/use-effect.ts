/**
 * Shared use logic for object:use hook, +lazarus, +drug/use.
 */
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import {
  ARR,
  ERR,
  OK,
  bad,
  dim,
  panelClose,
  panelOpen,
  good,
  scan,
  val,
  ylw,
} from "../commands/chrome.ts";
import {
  applyResilience,
  formatDice,
  gatherBonuses,
  resolveAction,
} from "./action.ts";
import {
  carriedItems,
  consumeUse,
  displayName,
  inferConsumable,
  isUsable,
  itemData,
  writeItemData,
} from "./items.ts";
import {
  getChar,
  getInventory,
  requireChar,
  saveChar,
} from "./sheet-io.ts";
import {
  NARCOTICS,
  find,
  findByName,
} from "./catalog.ts";
import type { ISprawlChar } from "../db/schemas.ts";

export async function findUsableByEffect(
  u: IUrsamuSDK,
  ownerId: string,
  effect: string,
): Promise<IDBObj | null> {
  const items = await carriedItems(u, ownerId);
  const lc = effect.toLowerCase();
  for (const o of items) {
    const d = itemData(o);
    if (!d) continue;
    if ((d.useEffect ?? "").toLowerCase() === lc) return o;
    if (lc === "lazarus" && /lazarus/i.test(d.slug + displayName(o))) {
      return o;
    }
  }
  return null;
}

function activeDrugs(c: ISprawlChar): unknown[] {
  const bag = c as unknown as Record<string, unknown>;
  const d = bag.drugs;
  return Array.isArray(d) ? d : [];
}

/** Dose narcotic by slug; returns message lines. Does not consume item. */
export async function doseNarcotic(
  u: IUrsamuSDK,
  actor: IDBObj,
  drugSlug: string,
): Promise<{ ok: boolean; message: string }> {
  const c = requireChar(u, actor) ?? getChar(actor);
  if (!c || !c.chargenComplete) {
    return { ok: false, message: `${ARR}No sheet.` };
  }
  const row = find("narcotic", drugSlug) ??
    findByName(NARCOTICS, drugSlug);
  if (!row) {
    return {
      ok: false,
      message: `${ERR}Unknown drug ${val(drugSlug)}.`,
    };
  }
  const { items, load } = await getInventory(u, actor);
  const ds = Number(row.addictionDs ?? 12);
  const gath = gatherBonuses(
    c,
    "equilibrium",
    0,
    [],
    load,
    items,
  );
  let resist = 0;
  const parts = [...gath.parts];
  for (const a of c.augs) {
    if (
      a.slug === "bio-auditor" ||
      a.slug === "toxin-scrubbers"
    ) {
      resist += 1;
      parts.push(`${a.name} +1`);
    }
  }
  const addiction = resolveAction({
    stat: "equilibrium",
    statValue: c.stats.equilibrium,
    bonuses: gath.total + resist,
    ds,
    dangerous: false,
  });
  const hooked = !addiction.success;
  const drugs = [
    ...activeDrugs(c),
    {
      slug: row.slug,
      name: row.name,
      at: Date.now(),
      effect: row.effect,
      duration: row.duration,
    },
  ];
  let next = {
    ...c,
    ...({ drugs } as object),
  } as ISprawlChar;
  if (row.slug === "slaught" || row.slug === "red-rapture") {
    next = applyResilience(next, 3);
  }
  await saveChar(u, next, actor.id);
  actor.state = { ...actor.state, sprawl: next };
  const hookLine = hooked
    ? `${bad("HOOKED")} — craving in 24h`
    : `${good("clean")} addiction check`;
  return {
    ok: true,
    message: [
      panelOpen("DOSE", String(row.name) ),
      scan(),
      `  ${dim(String(row.effect))}`,
      `  Duration ${val(String(row.duration))}`,
      `  Addiction vs DS${val(ds)}` +
      ` total ${val(addiction.total)} → ${hookLine}`,
      `  Dice ${dim(formatDice(addiction.dice))}`,
      `  ${ylw("Comedown:")} Glitch all actions` +
      ` for 2d6 hours after`,
      panelClose("CHEM"),
    ].join("\r\n"),
  };
}

export type UseEffectOpts = {
  /** Patient for lazarus (default = actor). */
  patient?: IDBObj;
};

export async function applyUseEffect(
  u: IUrsamuSDK,
  actor: IDBObj,
  thing: IDBObj,
  opts: UseEffectOpts = {},
): Promise<{ ok: boolean; message: string }> {
  let d = itemData(thing);
  if (!d) {
    return { ok: false, message: `${ERR}Not a Sprawl item.` };
  }
  // Market packs often lack useEffect/uses — infer + persist.
  const name = displayName(thing);
  const inferred = inferConsumable(d, name);
  if (inferred.changed) {
    d = inferred.data;
    await writeItemData(u, thing, d);
  }
  if (!isUsable(d)) {
    return {
      ok: false,
      message:
        `${ERR}You can't use ${val(name)} that way.`,
    };
  }

  const effect = (d.useEffect ?? "narrative").toLowerCase();
  const patient = opts.patient ?? actor;

  // Effects that need a living sheet first
  if (effect === "lazarus" || effect.startsWith("drug:")) {
    const who = effect === "lazarus" ? patient : actor;
    const c = requireChar(u, who) ?? getChar(who);
    if (!c || !c.chargenComplete) {
      return { ok: false, message: `${ARR}No sheet.` };
    }
  }

  if (effect === "lazarus") {
    const spent = await consumeUse(u, thing);
    let c = getChar(patient)!;
    c = applyResilience(c, 3);
    await saveChar(u, c, patient.id);
    patient.state = { ...patient.state, sprawl: c };
    const left = spent.destroyed
      ? "blister empty"
      : `${spent.left} left`;
    const who = patient.id === actor.id
      ? "you"
      : val(String(patient.name ?? "patient"));
    const msg =
      `${OK}Lazarus on ${who}. ` +
      `Res ${val(c.resilience)}/${val(c.resilienceMax)}` +
      ` (${left}).`;
    if (patient.id !== actor.id) {
      u.send(
        `${OK}${val(String(actor.name))} slapped a` +
          ` Lazarus on you. Res ` +
          `${val(c.resilience)}/${val(c.resilienceMax)}.`,
        patient.id,
      );
    }
    return { ok: true, message: msg };
  }

  if (effect.startsWith("drug:")) {
    const slug = effect.slice(5);
    const dose = await doseNarcotic(u, actor, slug);
    if (!dose.ok) return dose;
    const spent = await consumeUse(u, thing);
    const left = spent.destroyed
      ? `\r\n  ${dim("pack empty — tossed")}`
      : `\r\n  ${spent.left} ${d.unit ?? "use"} left`;
    return {
      ok: true,
      message: dose.message + left,
    };
  }

  // narrative / travel / cash / default
  if (d.uses == null) {
    return {
      ok: true,
      message: `${OK}You use ${val(name)}.`,
    };
  }
  const spent = await consumeUse(u, thing);
  if (spent.destroyed) {
    return {
      ok: true,
      message:
        `${OK}Used last of ${val(name)}. ` +
        `${dim("Gone.")}`,
    };
  }
  const unit = d.unit ?? "use";
  let flavor = `${OK}You use ${val(name)}.`;
  if (effect === "travel") {
    flavor =
      `${OK}Swipe ${val(name)} — cab en route.`;
  } else if (effect === "cash") {
    flavor =
      `${OK}Burn a charge on ${val(name)}.`;
  }
  return {
    ok: true,
    message:
      `${flavor} ${val(spent.left)} ${unit}` +
      (spent.data.usesMax != null
        ? `/${spent.data.usesMax}`
        : "") +
      ` left.`,
  };
}
