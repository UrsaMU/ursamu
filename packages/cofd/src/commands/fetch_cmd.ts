// +fetch — Fetch doubles and Echoes (CtL p.233+).

import { divider, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  activateEcho,
  buildFetchSheet,
  ECHOES,
  isFetchSheet,
  linkChangelingToFetch,
  markMetOriginal,
  readFetchState,
  writeFetchState,
} from "../fetch/index.ts";
import { isChangelingSheet } from "../form/mask.ts";
import {
  getSheet,
  isStaff,
  persistSheet,
} from "./hedge_helpers.ts";

export async function fetchCommand(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  if (!sw || sw === "status" || sw === "list") {
    return await fetchStatus(u, rest);
  }
  if (sw === "echoes") return await fetchEchoesList(u);
  if (sw === "echo") return await fetchEcho(u, rest);
  if (sw === "flaw") return await fetchFlaw(u, rest);
  if (sw === "met") return await fetchMet(u, rest);
  if (sw === "create") return await fetchCreate(u, rest);
  if (sw === "link") return await fetchLink(u, rest);
  if (sw === "mode") return await fetchMode(u, rest);
  if (sw === "grant-echo") return await fetchGrantEcho(u, rest);

  u.send(`Unknown +fetch switch: /${sw}. Try +fetch`);
}

async function fetchStatus(
  u: IUrsamuSDK,
  who: string,
): Promise<void> {
  let target = u.me;
  if (who && isStaff(u.me)) {
    const t = await u.util.target(u.me, who, true);
    if (!t) {
      u.send(`No player matches '${who}'.`);
      return;
    }
    target = t;
  }
  const sheet = getSheet(target);
  if (!sheet) {
    u.send("No character sheet.");
    return;
  }
  const lines = [await divider("F E T C H")];
  const st = readFetchState(sheet);

  if (isFetchSheet(sheet)) {
    lines.push(
      `  You are a %cyfetch%cn` +
        (st?.originalName
          ? ` of ${st.originalName}`
          : "") + ".",
    );
    lines.push(
      `  Wyrd ${sheet.powerStatValue}  Glamour ` +
        `${sheet.energyCurrent}`,
    );
    lines.push(
      `  Flaw: ${(st?.flaw ?? sheet.customFields?.flaw ?? "—")
        .slice(0, 60)}`,
    );
    lines.push(
      `  Materials: ${(st?.materials ?? "—").slice(0, 50)}`,
    );
    lines.push(
      `  Story: ${st?.storyMode ?? "unknown"}  ` +
        `Normalcy: ${st?.normalcyOn !== false ? "on" : "off"}  ` +
        `Met original: ${st?.metOriginal ? "yes" : "no"}`,
    );
    const echoes = st?.echoes ?? [];
    lines.push(`  Echoes: ${echoes.join(", ") || "(attuned)"}`);
    lines.push("  +fetch/echo <name>  +fetch/echoes");
  } else if (isChangelingSheet(sheet)) {
    if (st?.fetchId || st?.fetchName) {
      lines.push(
        `  Your fetch: %cy${st.fetchName ?? st.fetchId}%cn` +
          (st.fetchId ? ` (#${st.fetchId.slice(-6)})` : ""),
      );
      if (st.flaw) lines.push(`  Flaw: ${st.flaw.slice(0, 60)}`);
      if (st.storyMode) {
        lines.push(`  Story mode: ${st.storyMode}`);
      }
    } else {
      lines.push("  No fetch linked.");
      lines.push(
        "  Staff: +fetch/create <you>=<FetchName>/flaw/…",
      );
    }
  } else {
    lines.push("  Not a changeling or fetch sheet.");
  }
  u.send(lines.join("\n"));
}

async function fetchEchoesList(u: IUrsamuSDK): Promise<void> {
  const lines = [
    await divider("E C H O E S"),
    "  Fetches use Echoes, not Contracts.",
  ];
  for (const e of ECHOES) {
    const auto = e.automatic ? " [auto]" : "";
    lines.push(
      `  %cy${e.slug}%cn  Wyrd ${e.minWyrd}+  ` +
        `${e.glamour}G${auto}`,
    );
    lines.push(`    ${e.name}: ${e.description.slice(0, 58)}`);
  }
  lines.push("  +fetch/echo <slug> [note]");
  u.send(lines.join("\n"));
}

async function fetchEcho(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet || !isFetchSheet(sheet)) {
    u.send("Only fetch sheets activate Echoes.");
    return;
  }
  const sp = rest.indexOf(" ");
  const key = (sp >= 0 ? rest.slice(0, sp) : rest).trim();
  const note = sp >= 0 ? rest.slice(sp + 1).trim() : "";
  if (!key) {
    u.send("Usage: +fetch/echo <name> [note]");
    return;
  }
  const r = activateEcho(sheet, key, note || undefined);
  if (!r.ok || !r.sheet) {
    u.send(r.reason ?? "Echo failed.");
    return;
  }
  await persistSheet(u, u.me.id, r.sheet);
  u.send(r.lines.join("\n"));
}

async function fetchFlaw(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet) {
    u.send("No sheet.");
    return;
  }
  if (!rest) {
    const st = readFetchState(sheet);
    u.send(
      `Flaw: ${st?.flaw ?? sheet.customFields?.flaw ?? "(none)"}`,
    );
    return;
  }
  if (!isFetchSheet(sheet) && !isStaff(u.me)) {
    u.send("Only fetches set their own flaw (or staff).");
    return;
  }
  const st = readFetchState(sheet) ?? { echoes: [] };
  const next = writeFetchState(sheet, {
    ...st,
    flaw: rest.slice(0, 200),
  });
  next.customFields = {
    ...next.customFields,
    flaw: rest.slice(0, 200),
  };
  await persistSheet(u, u.me.id, next);
  u.send(`Flaw set: ${rest.slice(0, 70)}`);
}

async function fetchMet(
  u: IUrsamuSDK,
  _rest: string,
): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet || !isFetchSheet(sheet)) {
    u.send("Fetch sheets only (+fetch/met).");
    return;
  }
  const next = markMetOriginal(sheet);
  await persistSheet(u, u.me.id, next);
  u.send(
    "Marked: you have met your original face-to-face. " +
      "Mimic Contract unlocked.",
  );
}

/**
 * Staff: +fetch/create <changeling>=<FetchName>[/flaw][/materials]
 * Builds fetch data onto the changeling's link; optionally targets
 * an existing player to become the fetch sheet.
 */
async function fetchCreate(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isStaff(u.me)) {
    u.send("Permission denied. Builder+ to create fetches.");
    return;
  }
  const eq = rest.indexOf("=");
  if (eq < 0) {
    u.send(
      "Usage: +fetch/create <changeling>=<FetchName>" +
        "[/flaw text][/materials text]",
    );
    u.send(
      "  Optional: +fetch/create <ch>=<name> for <player> " +
        "to write the fetch template onto that player.",
    );
    return;
  }
  const left = rest.slice(0, eq).trim();
  let right = rest.slice(eq + 1).trim();
  let forPlayer = "";
  const forM = right.match(/\s+for\s+(\S+)\s*$/i);
  if (forM) {
    forPlayer = forM[1];
    right = right.slice(0, forM.index).trim();
  }
  const bits = right.split("/").map((s) => s.trim());
  const fetchName = bits[0] || "Fetch";
  const flaw = bits[1] || "Never quite learned how to love.";
  const materials = bits[2] || "leaves, stolen breath, glass";

  const orig = await u.util.target(u.me, left, true);
  if (!orig) {
    u.send(`No changeling matches '${left}'.`);
    return;
  }
  const oSheet = getSheet(orig);
  if (!oSheet || !isChangelingSheet(oSheet)) {
    u.send("Target must be a changeling sheet.");
    return;
  }

  if (forPlayer) {
    const fp = await u.util.target(u.me, forPlayer, true);
    if (!fp) {
      u.send(`No player matches '${forPlayer}'.`);
      return;
    }
    const built = buildFetchSheet(oSheet, {
      originalId: orig.id,
      originalName: u.util.displayName(orig, u.me),
      fetchName,
      flaw,
      materials,
      storyMode: "adversary",
    });
    await persistSheet(u, fp.id, built);
    const linked = linkChangelingToFetch(
      oSheet,
      fp.id,
      fetchName,
      { flaw, materials, storyMode: "adversary" },
    );
    await persistSheet(u, orig.id, linked);
    u.send(
      `Fetch sheet on ${u.util.displayName(fp, u.me)} ` +
        `linked to ${u.util.displayName(orig, u.me)} ` +
        `as %cy${fetchName}%cn.`,
    );
    return;
  }

  // Link-only stub on changeling (no body yet)
  const linked = linkChangelingToFetch(
    oSheet,
    `stub:${fetchName.toLowerCase().replace(/\s+/g, "-")}`,
    fetchName,
    { flaw, materials, storyMode: "unknown" },
  );
  await persistSheet(u, orig.id, linked);
  u.send(
    `Fetch %cy${fetchName}%cn linked on ` +
      `${u.util.displayName(orig, u.me)} (stub id). ` +
      `Add body: … for <player>.`,
  );
}

async function fetchLink(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isStaff(u.me)) {
    u.send("Staff only.");
    return;
  }
  // +fetch/link <changeling>=<fetch player>
  const eq = rest.indexOf("=");
  if (eq < 0) {
    u.send("Usage: +fetch/link <changeling>=<fetch player>");
    return;
  }
  const a = await u.util.target(u.me, rest.slice(0, eq).trim(), true);
  const b = await u.util.target(u.me, rest.slice(eq + 1).trim(), true);
  if (!a || !b) {
    u.send("Both names must match players.");
    return;
  }
  const aS = getSheet(a);
  const bS = getSheet(b);
  if (!aS || !isChangelingSheet(aS)) {
    u.send("Left side must be changeling.");
    return;
  }
  if (!bS || !isFetchSheet(bS)) {
    u.send("Right side must be a fetch template sheet.");
    return;
  }
  const name = u.util.displayName(b, u.me);
  const linked = linkChangelingToFetch(aS, b.id, name);
  const fetchSide = writeFetchState(bS, {
    ...(readFetchState(bS) ?? { echoes: [] }),
    originalId: a.id,
    originalName: u.util.displayName(a, u.me),
    fetchName: name,
  });
  await persistSheet(u, a.id, linked);
  await persistSheet(u, b.id, fetchSide);
  u.send(
    `Linked ${u.util.displayName(a, u.me)} ↔ fetch ${name}.`,
  );
}

async function fetchMode(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isStaff(u.me)) {
    u.send("Staff: +fetch/mode <player>=adversary|other-half|hard-lesson");
    return;
  }
  const eq = rest.indexOf("=");
  if (eq < 0) {
    u.send("Usage: +fetch/mode <player>=adversary|other-half|hard-lesson");
    return;
  }
  const t = await u.util.target(u.me, rest.slice(0, eq).trim(), true);
  if (!t) {
    u.send("Not found.");
    return;
  }
  const mode = rest.slice(eq + 1).trim().toLowerCase();
  const allowed = ["adversary", "other-half", "hard-lesson", "unknown"];
  if (!allowed.includes(mode)) {
    u.send(`Mode must be one of: ${allowed.join(", ")}`);
    return;
  }
  const sheet = getSheet(t);
  if (!sheet) {
    u.send("No sheet.");
    return;
  }
  const st = readFetchState(sheet) ?? { echoes: [] };
  const next = writeFetchState(sheet, {
    ...st,
    // deno-lint-ignore no-explicit-any
    storyMode: mode as any,
  });
  await persistSheet(u, t.id, next);
  u.send(`Story mode set to ${mode}.`);
}

async function fetchGrantEcho(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isStaff(u.me)) {
    u.send("Staff only.");
    return;
  }
  const eq = rest.indexOf("=");
  if (eq < 0) {
    u.send("Usage: +fetch/grant-echo <player>=<echo slug>");
    return;
  }
  const t = await u.util.target(u.me, rest.slice(0, eq).trim(), true);
  if (!t) {
    u.send("Not found.");
    return;
  }
  const slug = rest.slice(eq + 1).trim().toLowerCase();
  const sheet = getSheet(t);
  if (!sheet || !isFetchSheet(sheet)) {
    u.send("Target must be a fetch sheet.");
    return;
  }
  const st = readFetchState(sheet) ?? { echoes: [] };
  if (st.echoes.includes(slug)) {
    u.send("Already has that Echo.");
    return;
  }
  const next = writeFetchState(sheet, {
    ...st,
    echoes: [...st.echoes, slug],
  });
  await persistSheet(u, t.id, next);
  u.send(`Granted Echo %cy${slug}%cn.`);
}
