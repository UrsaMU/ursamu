// +pledge command executor — Seals, Oaths, and Bargains.

import { divider, type IDBObj, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  createPledge,
  getPledge,
  listPledges,
  updatePledge,
} from "../pledges/index.ts";
import {
  getSheet,
  isStaff,
  persistSheet,
} from "./market_helpers.ts";
import { isChangelingSheet } from "../form/mask.ts";

export async function pledgeCommand(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  if (sw === "" || sw === "list") {
    return await pledgeList(u, rest);
  }
  if (sw === "view" || sw === "show") {
    return await pledgeView(u, rest);
  }
  if (sw === "seal" || sw.startsWith("seal/")) {
    return await pledgeSeal(u, sw, rest);
  }
  if (sw === "oath" || sw.startsWith("oath/")) {
    return await pledgeOath(u, sw, rest);
  }
  if (sw === "bargain") {
    return await pledgeBargain(u, rest);
  }
  if (sw === "accept") {
    return await pledgeAccept(u, rest);
  }
  if (sw === "refute") {
    return await pledgeRefute(u, rest);
  }
  if (sw === "release") {
    return await pledgeRelease(u, rest);
  }
  if (sw === "break") {
    return await pledgeBreak(u, rest);
  }

  u.send(`Unknown +pledge switch: /${sw}`);
}

async function pledgeList(u: IUrsamuSDK, who: string): Promise<void> {
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
  const list = await listPledges(target.id);
  const lines = [
    await divider("P L E D G E S"),
    `  Pledges involving ${u.util.displayName(target, u.me)}:`,
  ];
  if (list.length === 0) {
    lines.push("  (none)");
  } else {
    for (const p of list) {
      const typeStr = p.kind === "oath"
        ? `${p.oathType} oath`
        : p.kind;
      let statusColor = "%cgactive%cn";
      if (p.status === "pending") statusColor = "%cypending%cn";
      if (p.status === "broken") statusColor = "%crbroken%cn";
      if (p.status === "released") statusColor = "released";
      lines.push(
        `  %cy${p.id.slice(-8)}%cn  [${typeStr}] ` +
          `${p.statement.slice(0, 30)}... (${statusColor})`,
      );
    }
  }
  u.send(lines.join("\n"));
}

async function pledgeView(u: IUrsamuSDK, id: string): Promise<void> {
  if (!id) {
    u.send("Usage: +pledge/view <id>");
    return;
  }
  const all = await listPledges(u.me.id);
  const p = all.find((x) => x.id === id || x.id.endsWith(id));
  if (!p) {
    u.send(`No pledge found with ID '${id}' involving you.`);
    return;
  }
  const lines = [
    await divider(`PLEDGE ${p.id.slice(-8).toUpperCase()}`),
    `  Kind: ${p.kind} ${p.oathType ? `(${p.oathType})` : ""}`,
    `  Status: ${p.status}`,
    `  Parties: ${p.partyNames.join(", ")}`,
    `  Statement: ${p.statement}`,
    `  Sanction: ${p.sanction}`,
  ];
  if (p.boon) lines.push(`  Boon/Benefit: ${p.boon}`);
  if (p.duration) lines.push(`  Duration: ${p.duration}`);
  if (p.strengthened) lines.push("  Strengthened: Yes (spends Willpower)");
  if (p.contractTrigger) {
    lines.push(`  Contract Trigger: ${p.contractTrigger}`);
  }
  if (p.brokenReason) lines.push(`  Broken Reason: ${p.brokenReason}`);
  u.send(lines.join("\n"));
}

async function pledgeSeal(
  u: IUrsamuSDK,
  sw: string,
  rest: string,
): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet) {
    u.send("No character sheet.");
    return;
  }
  const isCg = isChangelingSheet(sheet);
  if (!isCg) {
    u.send("Sealing requires the Wyrd (changeling).");
    return;
  }

  const eq = rest.indexOf("=");
  if (eq < 0) {
    u.send("Usage: +pledge/seal <target>=[duration/]<text>/<sanction>");
    return;
  }
  const targetName = rest.slice(0, eq).trim();
  const argsPart = rest.slice(eq + 1).trim();
  const parts = argsPart.split("/");
  if (parts.length < 2) {
    u.send("Usage: +pledge/seal <target>=[duration/]<text>/<sanction>");
    return;
  }

  const target = await u.util.target(u.me, targetName, true);
  if (!target) {
    u.send(`Target '${targetName}' not found.`);
    return;
  }

  let duration = "";
  let statement = "";
  let sanction = "";
  if (parts.length >= 3) {
    duration = parts[0].trim();
    statement = parts[1].trim();
    sanction = parts[2].trim();
  } else {
    statement = parts[0].trim();
    sanction = parts[1].trim();
  }

  const strengthen = sw === "seal/strengthen";
  const costGlamour = 1;
  const costWillpower = strengthen ? 1 : 0;

  if (sheet.energyCurrent < costGlamour) {
    u.send("Not enough Glamour.");
    return;
  }
  if (strengthen && sheet.advantages.willpowerCurrent < costWillpower) {
    u.send("Not enough Willpower to strengthen.");
    return;
  }

  // Deduct costs
  sheet.energyCurrent -= costGlamour;
  if (strengthen) {
    sheet.advantages.willpowerCurrent -= costWillpower;
  }
  await persistSheet(u, u.me.id, sheet);

  const targetSheet = getSheet(target);
  const targetFae = targetSheet ? isChangelingSheet(targetSheet) : false;

  const pledge = await createPledge({
    kind: "seal",
    oathType: "",
    parties: [u.me.id, target.id],
    partyNames: [
      u.util.displayName(u.me, u.me),
      u.util.displayName(target, u.me),
    ],
    statement,
    sanction,
    duration: duration || undefined,
    strengthened: strengthen || undefined,
  });

  if (targetFae) {
    u.send(`Proposed seal to ${u.util.displayName(target, u.me)}. ` +
      `Awaiting their acceptance.`);
    u.send(
      `Player ${u.util.displayName(u.me, target)} proposed a seal: ` +
        `"${statement}" (Sanction: ${sanction}). Use +pledge/accept ` +
        `${pledge.id.slice(-8)} or +pledge/refute ${pledge.id.slice(-8)}.`,
      target.id,
    );
  } else {
    await updatePledge(pledge.id, (p) => ({ ...p, status: "active" }));
    u.send(`You have sealed the words of ${u.util.displayName(target, u.me)}.`);
    u.send(
      `Your words have been sealed by ${u.util.displayName(u.me, target)}: ` +
        `"${statement}" (Sanction: ${sanction}).`,
      target.id,
    );
  }
}

async function pledgeOath(
  u: IUrsamuSDK,
  sw: string,
  rest: string,
): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet) {
    u.send("No character sheet.");
    return;
  }
  if (!isChangelingSheet(sheet)) {
    u.send("Only changelings can swear oaths.");
    return;
  }

  // Oath type can be from switch (+pledge/oath/personal) or first arg
  let type = "";
  let argPayload = rest;
  if (sw.startsWith("oath/")) {
    type = sw.slice(5).trim();
  } else {
    const slash = rest.indexOf("/");
    if (slash < 0) {
      u.send("Usage: +pledge/oath <type>/<target>=<text>/<boon>/<sanction>");
      return;
    }
    type = rest.slice(0, slash).trim();
    argPayload = rest.slice(slash + 1).trim();
  }

  const typeClean = type.toLowerCase() as "societal" | "personal" | "hostile";
  if (!["societal", "personal", "hostile"].includes(typeClean)) {
    u.send("Oath type must be societal, personal, or hostile.");
    return;
  }

  const eq = argPayload.indexOf("=");
  if (eq < 0) {
    u.send("Usage: +pledge/oath <type>/<target>=<text>/<boon>/<sanction>");
    return;
  }
  const targetName = argPayload.slice(0, eq).trim();
  const restPart = argPayload.slice(eq + 1).trim();
  const parts = restPart.split("/");
  if (parts.length < 2) {
    u.send("Usage: +pledge/oath <type>/<target>=<text>/<boon>/<sanction>");
    return;
  }

  const target = await u.util.target(u.me, targetName, true);
  if (!target) {
    u.send(`Target '${targetName}' not found.`);
    return;
  }

  const statement = parts[0].trim();
  const boon = parts[1].trim();
  const sanction = parts[2]?.trim() || "oathbreaker condition";

  if (sheet.energyCurrent < 1) {
    u.send("Not enough Glamour to swear an oath.");
    return;
  }
  sheet.energyCurrent -= 1;
  await persistSheet(u, u.me.id, sheet);

  const pledge = await createPledge({
    kind: "oath",
    oathType: typeClean,
    parties: [u.me.id, target.id],
    partyNames: [
      u.util.displayName(u.me, u.me),
      u.util.displayName(target, u.me),
    ],
    statement,
    sanction,
    boon,
  });

  u.send(`Proposed ${typeClean} oath to ${u.util.displayName(target, u.me)}.`);
  u.send(
    `Player ${u.util.displayName(u.me, target)} proposed a ${typeClean} oath: ` +
      `"${statement}" (Boon: ${boon}, Sanction: ${sanction}). ` +
      `Use +pledge/accept ${pledge.id.slice(-8)} to agree.`,
    target.id,
  );
}

async function pledgeBargain(u: IUrsamuSDK, rest: string): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet) {
    u.send("No character sheet.");
    return;
  }
  if (!isChangelingSheet(sheet)) {
    u.send("Only changelings can strike bargains.");
    return;
  }

  const hasMien = sheet.formState?.system === "mask" &&
    sheet.formState.current === "mien";
  if (!hasMien) {
    u.send("You must drop your Mask (+shift mien) to strike a bargain with a mortal.");
    return;
  }

  const eq = rest.indexOf("=");
  if (eq < 0) {
    u.send("Usage: +pledge/bargain <target>=<service>/<payment>");
    return;
  }
  const targetName = rest.slice(0, eq).trim();
  const restPart = rest.slice(eq + 1).trim();
  const parts = restPart.split("/");
  if (parts.length < 2) {
    u.send("Usage: +pledge/bargain <target>=<service>/<payment>");
    return;
  }

  const target = await u.util.target(u.me, targetName, true);
  if (!target) {
    u.send(`Target '${targetName}' not found.`);
    return;
  }

  const service = parts[0].trim();
  const payment = parts[1].trim();

  if (sheet.energyCurrent < 1) {
    u.send("Not enough Glamour to strike a bargain.");
    return;
  }
  sheet.energyCurrent -= 1;
  await persistSheet(u, u.me.id, sheet);

  const pledge = await createPledge({
    kind: "bargain",
    oathType: "",
    parties: [u.me.id, target.id],
    partyNames: [
      u.util.displayName(u.me, u.me),
      u.util.displayName(target, u.me),
    ],
    statement: `Service: ${service}`,
    boon: `Payment: ${payment}`,
    sanction: "loss of camouflage, obliged condition removal",
  });

  u.send(`Proposed bargain to ${u.util.displayName(target, u.me)}.`);
  u.send(
    `Player ${u.util.displayName(u.me, target)} proposed a bargain: ` +
      `Service: "${service}", Payment: "${payment}". ` +
      `Use +pledge/accept ${pledge.id.slice(-8)} to agree.`,
    target.id,
  );
}

async function pledgeAccept(u: IUrsamuSDK, id: string): Promise<void> {
  if (!id) {
    u.send("Usage: +pledge/accept <id>");
    return;
  }
  const list = await listPledges(u.me.id);
  const pledge = list.find(
    (p) =>
      p.status === "pending" &&
      (p.id === id || p.id.endsWith(id)) &&
      p.parties[0] !== u.me.id,
  );
  if (!pledge) {
    u.send("No pending pledge found for you to accept.");
    return;
  }

  // Deduct Glamour if oath
  if (pledge.kind === "oath") {
    const sheet = getSheet(u.me);
    if (!sheet) {
      u.send("No character sheet.");
      return;
    }
    if (sheet.energyCurrent < 1) {
      u.send("Not enough Glamour to accept and bind the oath.");
      return;
    }
    sheet.energyCurrent -= 1;
    await persistSheet(u, u.me.id, sheet);
  }

  await updatePledge(pledge.id, (p) => ({
    ...p,
    status: "active",
    acceptedAt: Date.now(),
  }));

  // Handle specific boon logic:
  // Bargain: add Obliged condition to the changeling (party[0])
  if (pledge.kind === "bargain") {
    const chActor = await u.util.target(u.me, pledge.parties[0], true);
    if (chActor) {
      const chSheet = getSheet(chActor);
      if (chSheet) {
        chSheet.conditions = chSheet.conditions || [];
        if (!chSheet.conditions.some((c) => c.key === "obliged")) {
          chSheet.conditions.push({
            key: "obliged",
            note: `Bargain with ${pledge.partyNames[1]}`,
          });
          await persistSheet(u, chActor.id, chSheet);
        }
      }
    }
  }

  // Court Oath: add first dot of Mantle Merit
  if (pledge.kind === "oath" && pledge.oathType === "societal") {
    const isCourt = pledge.statement.toLowerCase().includes("court");
    if (isCourt) {
      const sheet = getSheet(u.me);
      if (sheet) {
        // Detect court name or default
        let courtName = "court";
        const words = pledge.statement.split(" ");
        const idx = words.findIndex(
          (w) => w.toLowerCase() === "court",
        );
        if (idx > 0) courtName = words[idx - 1];
        const key = `mantle:${courtName.toLowerCase()}`;
        if (!sheet.merits[key]) {
          sheet.merits[key] = 1;
          await persistSheet(u, u.me.id, sheet);
          u.send(
            `You gained the first dot of %chMantle (${courtName})%cn!`,
          );
        }
      }
    }
  }

  u.send(`You accepted the pledge.`);
  u.send(
    `Player ${u.util.displayName(u.me, u.me)} accepted the pledge: "${pledge.statement}".`,
    pledge.parties[0],
  );
}

async function pledgeRefute(u: IUrsamuSDK, id: string): Promise<void> {
  if (!id) {
    u.send("Usage: +pledge/refute <id>");
    return;
  }
  const list = await listPledges(u.me.id);
  const pledge = list.find(
    (p) =>
      p.status === "pending" &&
      (p.id === id || p.id.endsWith(id)) &&
      p.parties[0] !== u.me.id,
  );
  if (!pledge) {
    u.send("No pending pledge found for you to refute.");
    return;
  }

  const sheet = getSheet(u.me);
  const isFae = sheet ? isChangelingSheet(sheet) : false;

  if (isFae && pledge.kind === "seal") {
    if (!sheet) {
      u.send("No character sheet.");
      return;
    }
    if (sheet.energyCurrent < 1) {
      u.send("Not enough Glamour to refute the seal.");
      return;
    }
    sheet.energyCurrent -= 1;
    await persistSheet(u, u.me.id, sheet);
  }

  await updatePledge(pledge.id, (p) => ({
    ...p,
    status: "released",
    endedAt: Date.now(),
  }));

  u.send("You refuted the proposed pledge.");
  u.send(
    `Player ${u.util.displayName(u.me, u.me)} refuted the proposed pledge: "${pledge.statement}".`,
    pledge.parties[0],
  );
}

async function pledgeRelease(u: IUrsamuSDK, id: string): Promise<void> {
  if (!id) {
    u.send("Usage: +pledge/release <id>");
    return;
  }
  const list = await listPledges(u.me.id);
  const pledge = list.find(
    (p) =>
      p.status === "active" && (p.id === id || p.id.endsWith(id)),
  );
  if (!pledge) {
    u.send("No active pledge found with that ID involving you.");
    return;
  }

  // Bargain: remove Obliged condition
  if (pledge.kind === "bargain") {
    const chActor = await u.util.target(u.me, pledge.parties[0], true);
    if (chActor) {
      const chSheet = getSheet(chActor);
      if (chSheet && chSheet.conditions) {
        chSheet.conditions = chSheet.conditions.filter((c) => c.key !== "obliged");
        await persistSheet(u, chActor.id, chSheet);
      }
    }
  }

  await updatePledge(pledge.id, (p) => ({
    ...p,
    status: "released",
    endedAt: Date.now(),
  }));

  u.send("The pledge has been released safely.");
  const otherId = pledge.parties.find((id) => id !== u.me.id);
  if (otherId) {
    u.send(
      `Player ${u.util.displayName(u.me, u.me)} has released the pledge: "${pledge.statement}".`,
      otherId,
    );
  }
}

async function pledgeBreak(u: IUrsamuSDK, rest: string): Promise<void> {
  const eq = rest.indexOf("=");
  const id = (eq >= 0 ? rest.slice(0, eq) : rest).trim();
  const reason = eq >= 0 ? rest.slice(eq + 1).trim() : "broken promise";

  if (!id) {
    u.send("Usage: +pledge/break <id>[=reason]");
    return;
  }
  const list = await listPledges(u.me.id);
  const pledge = list.find(
    (p) =>
      p.status === "active" && (p.id === id || p.id.endsWith(id)),
  );
  if (!pledge) {
    u.send("No active pledge found with that ID involving you.");
    return;
  }

  await updatePledge(pledge.id, (p) => ({
    ...p,
    status: "broken",
    brokenReason: reason,
    endedAt: Date.now(),
  }));

  // Apply consequences to the break-er (the actor who called break, or the target)
  // Normally the person who breaks is u.me, let's apply sanction to u.me.
  const sheet = getSheet(u.me);
  if (sheet) {
    // Add Oathbreaker condition for oaths
    if (pledge.kind === "oath") {
      sheet.conditions = sheet.conditions || [];
      if (!sheet.conditions.some((c) => c.key === "oathbreaker")) {
        sheet.conditions.push({ key: "oathbreaker" });
      }
    }

    // Apply seal damage/Willpower sanction
    const sanc = pledge.sanction.toLowerCase();
    if (sanc.includes("bashing")) {
      const match = sanc.match(/(\d+)\s+bashing/);
      const amount = match ? parseInt(match[1]) : 1;
      sheet.health = sheet.health || { bashing: 0, lethal: 0, aggravated: 0 };
      sheet.health.bashing += amount;
    }
    if (sanc.includes("lethal")) {
      const match = sanc.match(/(\d+)\s+lethal/);
      const amount = match ? parseInt(match[1]) : 1;
      sheet.health = sheet.health || { bashing: 0, lethal: 0, aggravated: 0 };
      sheet.health.lethal += amount;
    }
    if (sanc.includes("willpower")) {
      const match = sanc.match(/(\d+)\s+willpower/);
      const amount = match ? parseInt(match[1]) : 1;
      sheet.advantages.willpowerCurrent = Math.max(
        0,
        sheet.advantages.willpowerCurrent - amount,
      );
    }

    // Bargain: remove Obliged
    if (pledge.kind === "bargain") {
      sheet.conditions = sheet.conditions || [];
      sheet.conditions = sheet.conditions.filter((c) => c.key !== "obliged");
    }

    await persistSheet(u, u.me.id, sheet);
  }

  u.send(`You broke the pledge! Consequences applied: ${pledge.sanction}`);
  const otherId = pledge.parties.find((id) => id !== u.me.id);
  if (otherId) {
    u.send(
      `Player ${u.util.displayName(u.me, u.me)} broke the pledge: ` +
        `"${pledge.statement}" (Reason: ${reason}). Sanction triggered: ${pledge.sanction}`,
      otherId,
    );
  }
}
