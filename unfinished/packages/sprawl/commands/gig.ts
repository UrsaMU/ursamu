/** +gig — player auto street contracts (d66 + nodes). */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import {
  ARR,
  ERR,
  OK,
  header,
  footer,
  dim,
  good,
  val,
  ylw,
} from "./chrome.ts";
import {
  getChar,
  requireChar,
  saveChar,
  isStaff,
} from "../engine/sheet-io.ts";
import {
  GIG_BOSSES,
  GIG_COMPLICATIONS,
  GIG_CONTRACTS,
  GIG_MINIONS,
  GIG_OBJECTIVES,
  GIG_ROOMS,
  GIG_TARGETS,
  GIG_VENUES,
} from "../engine/catalog.ts";
import {
  abandonGig,
  applyGigComplete,
  destroyGigToken,
  dropGigToken,
  findGigToken,
  formatGigCard,
  rewardsForGig,
  rollGig,
} from "../engine/gigs.ts";
import {
  isBossNode,
  nodeReadyToAdvance,
  populateGigNode,
  pushGigNodeAndLook,
} from "../engine/gig-run.ts";
import {
  destroyGigSite,
  enterGigSite,
  leaveGigSite,
} from "../engine/gig-site.ts";
import {
  getGigRoomArt,
  setGigRoomArt,
} from "../engine/gig-art.ts";
import { apCost } from "../engine/advance-rules.ts";
import {
  crewIdsOf,
  isGigLeader,
  loadCharById,
  makeInvite,
  payCrewTurnin,
  syncGigToCrew,
  withLeader,
} from "../engine/gig-party.ts";
import { rollSoftwareObsolescence } from "../engine/software-life.ts";

addCmd({
  name: "+gig",
  pattern: /^\+gig(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Sprawl Goons",
  help: `+gig[/<switch>]  — Street contract + party site.

Solo or crew. Leader pulls; invite friends; shared room.

Switches:
  (none)|/pull     New gig (you = leader)
  /invite <name>   Invite to your crew
  /join            Accept invite
  /crew            List crew
  /kick <name>     Leader removes runner
  /enter · /leave · /push · /turnin
  /abandon
  /image <slug>=url  Staff art

Examples:
  +gig
  +gig/invite Alice
  Alice: +gig/join
  +gig/enter
  +gig/turnin`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const c = requireChar(u);
    if (!c) {
      u.send(`${ARR}No sheet. ${val("+chargen")} first.`);
      return;
    }

    if (sw === "catalog" || sw === "tables") {
      u.send(
        [
          header("GIG TABLES"),
          `  contracts ${val(GIG_CONTRACTS.length)}` +
          `  venues ${val(GIG_VENUES.length)}`,
          `  rooms ${val(GIG_ROOMS.length)}` +
          `  minions ${val(GIG_MINIONS.length)}`,
          `  comps ${val(GIG_COMPLICATIONS.length)}` +
          `  bosses ${val(GIG_BOSSES.length)}`,
          `  targets ${val(GIG_TARGETS.length)}` +
          `  objectives ${val(GIG_OBJECTIVES.length)}`,
          `  ${dim("d66 · data/gig-*.json")}`,
          footer(),
        ].join("\r\n"),
      );
      return;
    }

    if (sw === "list") {
      if (!isStaff(u)) {
        u.send(`${ERR}Staff only.`);
        return;
      }
      if (!arg) {
        u.send(`${ERR}Usage: ${val("+gig/list <player>")}`);
        return;
      }
      const t = await u.util.target(u.me, arg, true);
      if (!t) {
        u.send(`${ERR}Not found.`);
        return;
      }
      const live = getChar(t);
      if (!live?.activeGig) {
        u.send(`${ARR}${val(String(t.name))} — no gig.`);
        return;
      }
      u.send(
        [
          header(`GIG · ${t.name}`),
          ...formatGigCard(live.activeGig),
          footer(),
        ].join("\r\n"),
      );
      return;
    }

    if (sw === "status" || sw === "show" || sw === "card") {
      if (!c.activeGig) {
        u.send(
          `${ARR}No active gig. ${val("+gig")} to pull one.`,
        );
        return;
      }
      const g = c.activeGig;
      const onSite = !!(g.siteRoomId &&
        (u.me.location === g.siteRoomId ||
          u.here?.id === g.siteRoomId));
      const hints: string[] = [];
      if (!onSite) {
        hints.push("+gig/enter");
      } else if (g.tokenId) {
        hints.push("+gig/turnin");
      } else if (isBossNode(g)) {
        if (g.objective === "hack-node") {
          hints.push(`+hack PRIMARY`);
        }
        hints.push("+attack · +hack");
      } else if ((g.minionObjIds ?? []).length) {
        hints.push("+attack · +hack");
      } else if (g.nodeCleared) {
        hints.push("+gig/push");
      } else {
        hints.push("+gig/enter");
      }
      u.send(
        [
          header("ACTIVE GIG"),
          ...formatGigCard(g),
          `  ${dim(hints.join(" · "))}`,
          footer(),
        ].join("\r\n"),
      );
      return;
    }

    if (sw === "invite") {
      const gig = c.activeGig;
      if (!gig) {
        u.send(`${ARR}No gig. ${val("+gig")} first.`);
        return;
      }
      if (!isGigLeader(gig, u.me.id)) {
        u.send(`${ERR}Only the leader can invite.`);
        return;
      }
      if (!arg) {
        u.send(`${ERR}Usage: ${val("+gig/invite <player>")}`);
        return;
      }
      const t = await u.util.target(u.me, arg, true);
      if (!t?.flags?.has?.("player")) {
        u.send(`${ERR}Player not found.`);
        return;
      }
      if (t.id === u.me.id) {
        u.send(`${ARR}You're already lead.`);
        return;
      }
      const them = getChar(t);
      if (!them?.chargenComplete) {
        u.send(`${ARR}They need a live sheet.`);
        return;
      }
      if (them.activeGig && them.activeGig.id !== gig.id) {
        u.send(`${ERR}They're already on another gig.`);
        return;
      }
      const inv = makeInvite(
        c,
        u.me.id,
        String(u.me.name ?? "Leader"),
      );
      if (!inv) {
        u.send(`${ERR}No gig.`);
        return;
      }
      await saveChar(u, { ...them, gigInvite: inv }, t.id);
      u.send(
        `${OK}Invited ${val(String(t.name))} — ` +
          `they type ${val("+gig/join")}.`,
      );
      u.send(
        `${OK}${val(String(u.me.name))} invited you to gig ` +
          `"${gig.title}". Type ${val("+gig/join")}.`,
        t.id,
      );
      return;
    }

    if (sw === "join") {
      const inv = c.gigInvite;
      if (!inv) {
        u.send(
          `${ARR}No invite. Ask the lead to ` +
            `${val("+gig/invite you")}.`,
        );
        return;
      }
      if (c.activeGig && c.activeGig.id !== inv.gigId) {
        u.send(`${ERR}Finish or abandon your current gig.`);
        return;
      }
      const leadPack = await loadCharById(inv.leaderId);
      if (!leadPack?.char.activeGig) {
        u.send(`${ARR}Leader's gig is gone.`);
        await saveChar(u, { ...c, gigInvite: undefined });
        return;
      }
      const leadGig = leadPack.char.activeGig;
      if (leadGig.id !== inv.gigId) {
        u.send(`${ARR}Invite expired.`);
        await saveChar(u, { ...c, gigInvite: undefined });
        return;
      }
      const crew = crewIdsOf(withLeader(leadGig, inv.leaderId));
      if (!crew.includes(u.me.id)) crew.push(u.me.id);
      const nextGig = withLeader(
        { ...leadGig, crewIds: crew },
        inv.leaderId,
      );
      // Update leader crew list
      await saveChar(u, {
        ...leadPack.char,
        activeGig: nextGig,
      }, inv.leaderId);
      await saveChar(u, {
        ...c,
        activeGig: nextGig,
        gigInvite: undefined,
      });
      await syncGigToCrew(u, {
        ...leadPack.char,
        activeGig: nextGig,
      });
      u.send(
        `${OK}Joined crew on "${nextGig.title}". ` +
          `${val("+gig/enter")} when ready.`,
      );
      u.send(
        `${OK}${val(String(u.me.name))} joined your gig crew.`,
        inv.leaderId,
      );
      return;
    }

    if (sw === "crew" || sw === "party") {
      const gig = c.activeGig;
      if (!gig) {
        u.send(`${ARR}No active gig.`);
        return;
      }
      const ids = crewIdsOf(withLeader(gig, gig.leaderId ?? u.me.id));
      const lines = [header("GIG CREW")];
      for (const id of ids) {
        const p = await loadCharById(id);
        const name = p
          ? String(p.obj.name ?? id)
          : `#${id}`;
        const tag = id === (gig.leaderId ?? u.me.id)
          ? "leader"
          : "crew";
        lines.push(`  ${val(name)} ${dim(tag)}`);
      }
      lines.push(
        `  ${dim("+gig/invite <name> · +gig/join · +gig/kick")}`,
      );
      lines.push(footer());
      u.send(lines.join("\r\n"));
      return;
    }

    if (sw === "kick") {
      const gig = c.activeGig;
      if (!gig || !isGigLeader(gig, u.me.id)) {
        u.send(`${ERR}Leader only.`);
        return;
      }
      if (!arg) {
        u.send(`${ERR}Usage: ${val("+gig/kick <player>")}`);
        return;
      }
      const t = await u.util.target(u.me, arg, true);
      if (!t) {
        u.send(`${ERR}Not found.`);
        return;
      }
      if (t.id === u.me.id) {
        u.send(`${ARR}Use +gig/abandon to quit as lead.`);
        return;
      }
      const crew = crewIdsOf(gig).filter((id) => id !== t.id);
      const nextGig = { ...gig, crewIds: crew };
      await saveChar(u, { ...c, activeGig: nextGig });
      const them = getChar(t);
      if (them?.activeGig?.id === gig.id) {
        await saveChar(u, {
          ...them,
          activeGig: undefined,
        }, t.id);
      }
      await syncGigToCrew(u, { ...c, activeGig: nextGig });
      u.send(`${OK}Removed ${val(String(t.name))} from crew.`);
      u.send(
        `${ARR}Removed from gig crew.`,
        t.id,
      );
      return;
    }

    if (sw === "enter" || sw === "site" || sw === "go") {
      const gig = c.activeGig;
      if (!gig) {
        u.send(`${ARR}No gig. ${val("+gig")} first.`);
        return;
      }
      try {
        // Crew: pull latest site id from leader if needed
        let working = gig;
        if (
          gig.leaderId &&
          gig.leaderId !== u.me.id &&
          !gig.siteRoomId
        ) {
          const lead = await loadCharById(gig.leaderId);
          if (lead?.char.activeGig?.siteRoomId) {
            working = {
              ...gig,
              ...lead.char.activeGig,
              crewIds: crewIdsOf(lead.char.activeGig),
            };
          }
        }
        const r = await enterGigSite(u, c, working);
        let next = r.next;
        const g = next.activeGig!;
        // First body in empty node: hostiles + systems
        const empty =
          !(g.minionObjIds ?? []).length &&
          !(g.systemObjIds ?? []).length &&
          !g.bossObjId &&
          !g.tokenId &&
          g.status !== "token";
        const popMsgs: string[] = [];
        if (empty) {
          const pop = await populateGigNode(u, next, g);
          next = pop.next;
          popMsgs.push(...pop.msgs);
        }
        await saveChar(u, next);
        await syncGigToCrew(u, next);
        u.send(
          [
            `${OK}${r.created ? "Site built" : "On site"}` +
              ` — ${val(next.activeGig?.roomName ?? "site")}.`,
            ...popMsgs.map((m) => `  ${m}`),
            `  ${dim(
              "look · +attack · +hack · +gig/push · +gig/leave",
            )}`,
          ].join("\r\n"),
        );
      } catch (e: unknown) {
        u.send(
          `${ERR}${e instanceof Error ? e.message : "enter failed"}`,
        );
      }
      return;
    }

    if (sw === "leave" || sw === "exit" || sw === "out") {
      if (!c.activeGig) {
        u.send(`${ARR}No active gig.`);
        return;
      }
      const next = await leaveGigSite(u, c, {
        destroy: false,
      });
      await saveChar(u, next);
      u.send(
        `${OK}Left the site.` +
          ` ${dim("+gig/enter to return · run still open")}`,
      );
      return;
    }

    if (sw === "image" || sw === "art") {
      if (!isStaff(u)) {
        u.send(`${ERR}Staff only.`);
        return;
      }
      const eq = arg.indexOf("=");
      if (eq < 0) {
        const slug = arg.toLowerCase() || "";
        if (slug) {
          const url = await getGigRoomArt(slug);
          u.send(
            url
              ? `${val(slug)} → ${url}`
              : `${ARR}No art for ${val(slug)}.`,
          );
          return;
        }
        u.send(
          `${ERR}Usage: ${val("+gig/image <room-slug>=<url|clear>")}`,
        );
        return;
      }
      const slug = arg.slice(0, eq).trim();
      const url = arg.slice(eq + 1).trim();
      try {
        await setGigRoomArt(slug, url);
        u.send(
          `${OK}Room art ${val(slug)}` +
            (url.toLowerCase() === "clear"
              ? " cleared."
              : " set."),
        );
      } catch (e: unknown) {
        u.send(
          `${ERR}${e instanceof Error ? e.message : "failed"}`,
        );
      }
      return;
    }

    if (sw === "abandon" || sw === "cancel") {
      if (!c.activeGig) {
        u.send(`${ARR}No active gig.`);
        return;
      }
      await destroyGigToken(u, c.activeGig.tokenId);
      await destroyGigSite(u, c.activeGig);
      const home = c.activeGig.returnRoomId;
      if (home) {
        try {
          if (typeof u.teleport === "function") {
            await u.teleport(u.me.id, home);
          } else {
            await u.db.modify(u.me.id, "$set", {
              location: home,
            });
          }
        } catch {
          /* ok */
        }
      }
      await saveChar(u, abandonGig(c));
      u.send(`${OK}Gig abandoned. Site wiped. No pay.`);
      return;
    }

    // /spawn kept as alias — enter already populates
    if (sw === "spawn" || sw === "boss" || sw === "mobs") {
      u.send(
        `${ARR}Hostiles spawn on ${val("+gig/enter")}` +
          ` (and after ${val("+gig/push")}). ` +
          `Type ${val("+gig/enter")}.`,
      );
      return;
    }

    if (sw === "push" || sw === "next" || sw === "advance") {
      const gig = c.activeGig;
      if (!gig) {
        u.send(`${ARR}No active gig.`);
        return;
      }
      if (gig.tokenId) {
        u.send(
          `${ARR}Target secured — ${val("+gig/turnin")}.`,
        );
        return;
      }
      if (isBossNode(gig)) {
        const gate = nodeReadyToAdvance(gig);
        if (!gate.ok) {
          u.send(`${ARR}${gate.reason}`);
          return;
        }
        u.send(
          `${ARR}Final node — ` +
            (gig.objective === "hack-node"
              ? `${val("+hack")} primary, then `
              : "") +
            `${val("+gig/turnin")}.`,
        );
        return;
      }
      const gate = nodeReadyToAdvance(gig);
      if (!gate.ok) {
        u.send(`${ERR}${gate.reason}`);
        return;
      }
      if (!isGigLeader(gig, u.me.id)) {
        u.send(`${ERR}Only the leader can +gig/push.`);
        return;
      }
      const r = await pushGigNodeAndLook(u, c, gig);
      await saveChar(u, r.next);
      await syncGigToCrew(u, r.next);
      u.send(
        [
          `${OK}${r.msg}`,
          ...r.msgs.map((m) => `  ${m}`),
          ...formatGigCard(r.next.activeGig ?? gig).slice(0, 6),
          `  ${dim("look — room image/desc updated")}`,
        ].join("\r\n"),
      );
      return;
    }

    if (sw === "turnin" || sw === "complete" || sw === "done") {
      const gig = c.activeGig;
      if (!gig) {
        u.send(`${ARR}No active gig.`);
        return;
      }
      // Any crew can turn in if they hold the token
      const token = await findGigToken(u, u.me.id, gig.id);
      if (!token) {
        u.send(
          `${ERR}No turn-in target on you. ` +
            `Whoever holds the token: ${val("+gig/turnin")}.`,
        );
        return;
      }
      // Pay whole crew full shares
      const leadId = gig.leaderId ?? u.me.id;
      let leadChar = c;
      if (leadId !== u.me.id) {
        const lp = await loadCharById(leadId);
        if (lp) leadChar = lp.char;
      }
      const paid = await payCrewTurnin(
        u,
        leadId === u.me.id ? c : leadChar,
        withLeader(gig, leadId),
      );
      // If turn-in person isn't leader, still pay them via their complete
      let next = c;
      if (leadId === u.me.id) {
        next = paid.leaderNext;
      } else {
        const { next: n } = applyGigComplete(c, gig);
        next = n;
        await saveChar(u, paid.leaderNext, leadId);
      }
      // Between missions: software obsolescence (Nodejacker)
      const obs = rollSoftwareObsolescence(next);
      next = obs.next;
      await destroyGigToken(u, token.id);
      const home = gig.returnRoomId;
      await destroyGigSite(u, gig);
      // Send all crew home
      for (const id of paid.paid) {
        if (!home) break;
        try {
          if (typeof u.teleport === "function") {
            await u.teleport(id, home);
          } else {
            await u.db.modify(id, "$set", { location: home });
          }
        } catch {
          /* ok */
        }
      }
      await saveChar(u, next);
      const cost = apCost();
      const reward = paid.reward;
      const out = [
        `${OK}Gig complete: ${val(gig.title)}`,
        `  ${good(
          `+${reward.bityuan} b¥ · +${reward.ap} AP`,
        )}` +
        (paid.paid.length > 1
          ? ` ${dim(`×${paid.paid.length} crew`)}`
          : ""),
        `  ${dim("Site collapsed. Crew outside.")}`,
        `  ${dim(
          `b¥ ${next.bityuan} · AP ${next.ap}` +
            ` · Lv${next.level}`,
        )}`,
        `  ${dim(
          next.ap >= cost
            ? "+advance/<track> ready"
            : "bank AP toward +advance",
        )}`,
      ];
      if (obs.died.length) {
        out.push(
          `  ${ylw("Software obsolete:")} ` +
            obs.died.join(", "),
        );
      }
      u.send(out.join("\r\n"));
      return;
    }

    if (sw === "force" || sw === "grant") {
      if (!isStaff(u)) {
        u.send(`${ERR}Staff only.`);
        return;
      }
      const gig = c.activeGig;
      if (!gig) {
        u.send(`${ARR}No active gig on you.`);
        return;
      }
      const { token, next } = await dropGigToken(u, c, gig);
      if (!token) {
        u.send(`${ARR}Token already exists or failed.`);
        return;
      }
      await saveChar(u, next);
      u.send(
        `${OK}Forced token ${val(gig.targetName)}. ` +
          `${val("+gig/turnin")}`,
      );
      return;
    }

    if (sw === "complete-for" || sw === "force-complete") {
      if (!isStaff(u)) {
        u.send(`${ERR}Staff only.`);
        return;
      }
      // complete own gig without token
      const gig = c.activeGig;
      if (!gig) {
        u.send(`${ARR}No active gig.`);
        return;
      }
      const { next, reward } = applyGigComplete(c, gig);
      await destroyGigToken(u, gig.tokenId);
      await destroyGigSite(u, gig);
      await saveChar(u, next);
      u.send(
        `${OK}Staff-complete ${val(gig.title)} · ` +
          `+${reward.bityuan} b¥ · +${reward.ap} AP`,
      );
      return;
    }

    if (c.activeGig && sw !== "new" && sw !== "reroll") {
      if (
        !sw || sw === "pull" || sw === "start" || sw === "roll"
      ) {
        const g = c.activeGig;
        const onSite = g.siteRoomId &&
          (u.me.location === g.siteRoomId ||
            u.here?.id === g.siteRoomId);
        u.send(
          [
            header("ACTIVE GIG"),
            ...formatGigCard(g),
            onSite
              ? `  ${ylw("You are on-site.")} ` +
                `${dim("look · +attack · +hack · +gig/push")}`
              : `  ${ylw(">>> +gig/enter <<<")} ` +
                `${dim("site + hostiles + systems")}`,
            `  ${dim("or +gig/abandon to quit")}`,
            footer(),
          ].join("\r\n"),
        );
        return;
      }
    }

    if (
      sw &&
      ![
        "pull",
        "new",
        "reroll",
        "start",
        "roll",
      ].includes(sw)
    ) {
      u.send(
        `${ERR}Unknown. ` +
          `${val("+gig")} /enter /invite /join /push /turnin`,
      );
      return;
    }

    const raw = rollGig();
    const gig = withLeader(raw, u.me.id);
    await saveChar(u, { ...c, activeGig: gig });
    const rw = rewardsForGig(gig);
    const max = gig.nodesMax ?? 1;
    u.send(
      [
        header("STREET GIG"),
        ...formatGigCard(gig),
        `  Payout ~${val(rw.bityuan)} b¥` +
        ` · ${val(rw.ap)} AP · ${val(max)} nodes` +
        ` · each crew full share`,
        ``,
        `  ${ylw(">>> TYPE:  +gig/enter  <<<")}`,
        `  ${dim("Site room + auto hostiles/systems.")}`,
        ``,
        `  Party: ${val("+gig/invite Alice")} → ` +
        `they ${val("+gig/join")} → all ${val("+gig/enter")}`,
        `  Then: look · +attack · +hack · ` +
        `+gig/push · +gig/turnin`,
        footer(),
      ].join("\r\n"),
    );
  },
});
