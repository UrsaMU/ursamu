// Registers CoFD commands with UrsaMU via addCmd().
// Imported for side effects from the top-level commands.ts shim.

import { addCmd, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  sheetExec,
  sheetRestExec,
  sheetSetExec,
  sheetViceExec,
  sheetVirtueExec,
} from "./sheet.ts";
import { rollExec } from "./roll.ts";
import { cgExec } from "./chargen.ts";
import { healthExec } from "./health.ts";
import { beatExec } from "./beat.ts";
import { xpExec } from "./xp.ts";
import { conditionExec } from "./condition.ts";
import { aspirationExec } from "./aspiration.ts";
import {
  approveExec,
  denyExec,
  unapproveExec,
} from "./approve.ts";
import { notesExec } from "./notes.ts";
import { viewsExec } from "./views.ts";
import { gearExec, gearReload, gearEquip, gearUnequip, gearView, tokenExec } from "./gear.ts";
import { tiltExec } from "./tilt.ts";
import { proveExec } from "./prove.ts";
import { combatExec } from "./combat.ts";
import { attackExec } from "./attack.ts";
import { grappleExec } from "./grapple.ts";
import { throwExec } from "./throw.ts";
import { npcExec } from "./npc.ts";
import { aidExec } from "./aid.ts";
import { socialExec } from "./social.ts";
import { integrityExec } from "./integrity.ts";
import { extendedExec } from "./extended.ts";
import { turnExec } from "./turn.ts";
import { zoneExec } from "./zone.ts";
import { districtExec } from "./district.ts";
import { shiftExec } from "./shift.ts";
import { contractExec } from "./contract.ts";
import { hedgeExec } from "./hedge.ts";
import { marketExec } from "./market.ts";
import { debtCommand } from "./debt.ts";
import { iconCommand } from "./icon.ts";
import { spinCommand } from "./spin.ts";
import { infoExec } from "./info.ts";
import { pledgeCommand } from "./pledge.ts";
import { kenningExec } from "./kenning.ts";
import { harvestExec, reapExec } from "./harvest.ts";
import { bedlamExec } from "./bedlam.ts";
import { clashExec } from "./clash.ts";
import { frailtyExec } from "./frailty.ts";
import { dreamCommand } from "./dream.ts";
import { fetchCommand } from "./fetch_cmd.ts";
import { huntCommand } from "./hunt.ts";
import { mantleCommand } from "./mantle_cmd.ts";
import { hobCommand } from "./hob.ts";
import { icExec, oocExec } from "./ic_ooc.ts";
import { timeExec } from "./time.ts";
import { staffkitExec } from "./staffkit.ts";

addCmd({
  name: "+time",
  pattern: /^\+time$/i,
  lock: "connected",
  category: "Cofd",
  help: `+time  — Date, clock, season, weather, moon, sun.

London-like climate. Moon phase follows the 28-day month.
Staff set the game clock with @time.

Examples:
  +time`,
  exec: timeExec,
});

addCmd({
  name: "+staffkit",
  pattern: /^\+staffkit(?:\/(\S+))?\s*(.*)/i,
  lock: "connected builder+",
  category: "Cofd",
  help: `+staffkit <splat> [<target>]  — Install a minimal staff splat kit.

Staff-only shortcut so locks and systems accept you as that splat
without full chargen. Starts with changeling (Lost).

SYNTAX
  +staffkit <splat> [<target>]
  +staffkit/<splat> [<target>]
  +staffkit/list
  +staffkit/clear [<target>]

SPLATS
  changeling   Live Lost sheet, approved, fae flag, Glamour.

EXAMPLES
  +staffkit changeling
  +staffkit/changeling
  +staffkit changeling Alice
  +staffkit/clear`,
  exec: staffkitExec,
});

addCmd({
  name: "+ooc",
  pattern: /^\+ooc$/i,
  lock: "connected",
  category: "Cofd",
  help: `+ooc  — Leave IC play for the OOC Lounge.

Requires %chapproved%cn. If you are in a room with the %chic%cn
flag, that room is saved so %ch+ic%cn can return you.

Builders mark rooms: %ch@set here=ic%cn

Examples:
  +ooc`,
  exec: oocExec,
});

addCmd({
  name: "+ic",
  pattern: /^\+ic(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+ic[/clear|/status]  — Enter IC play (hub or saved room).

Requires %chapproved%cn. Returns to your last IC room (a room
flagged %chic%cn that you left via +ooc), or the IC hub.

Switches:
  /clear    Forget the marker (stay put; next +ic → hub).
  /status   Show where your marker points.

Examples:
  +ic
  +ic/status
  +ic/clear`,
  exec: icExec,
});

addCmd({
  name: "+extended",
  pattern: /^\+extended(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+extended[/sw] [args]  -- Manage CoFD 2e Extended Actions (core p.70).

Switches:
  /start <pool>=<target>[/<maxRolls>][/<interval>][/cum] <description>
                                   Open a new action (owner = you). Default
                                   maxRolls is Resolve+Composure. Interval
                                   default is scene. Add /cum for cumulative
                                   penalty (each attempt subtracts attempts-so-far).
  /roll [<extra-mod>]              Roll your single active action. Stacks with
                                   /wp /rote /9again /8again /job=<number>.
                                   Dramatic failure imposes -2 on the next attempt.
  /status [<id>]                   Show the action (default: your active one).
  /list [mine|here|all]            List actions in scope. /list all is staff-only.
  /abandon <id>                    Cancel an action (owner or staff).
  /finish <id>                     Staff: force success.
  /contest <idA>+<idB>             Staff: link two actions; when one succeeds
                                   the sibling is auto-abandoned.

Examples:
  +extended/start intelligence+occult=10 Decipher the grimoire
  +extended/start strength+stamina=15/6/hour/cum Force the cell door
  +extended/roll
  +extended/roll/wp/9again/job=123 -1
  +extended/status
  +extended/list here
  +extended/abandon ext-12345-678`,
  exec: extendedExec,
});

addCmd({
  name: "+sheet",
  pattern: /^\+sheet(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+sheet [<player>]  -- View a character's Chronicles of Darkness sheet.

During chargen, +sheet shows your draft (or a blank Mortal base if you
have not started +cg yet). After approval it shows the live sheet.
Viewing another player's draft requires canEdit (builder+).

Switches:
  /set <trait>=<value>             Modify a trait (live sheet only). Specialty
                                   descriptions use
                                   'specialty/<skill>=<name>: <description>'.
                                   Size is staff-only (admin/builder).
  /virtue [<player>] [= <reason>]  Restore full Willpower -- Virtue triggered
                                   in a meaningful scene. Cross-player edits
                                   require canEdit (builder+).
  /vice [<player>] [= <reason>]    Restore +1 Willpower -- Vice indulged.
  /rest [<player>] [= <reason>]    Restore full Willpower -- a full night's
                                   rest.

Examples:
  +sheet
  +sheet/set specialty/brawl=Boxing: southpaw stance
  +sheet/virtue = Stood up to the prince
  +sheet/vice = One drink too many
  +sheet/rest`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    if (sw === "set") {
      await sheetSetExec(u);
    } else if (sw === "virtue" || sw === "virtue-trigger") {
      await sheetVirtueExec(u);
    } else if (sw === "vice" || sw === "vice-indulge") {
      await sheetViceExec(u);
    } else if (sw === "rest") {
      await sheetRestExec(u);
    } else {
      await sheetExec(u);
    }
  }
});

addCmd({
  name: "+roll",
  pattern: /^\+roll(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+roll[/wp][/rote][/weapon][/9again|/8again] <expression>  -- Perform a Chronicles of Darkness D10 roll.

Switches:
  /wp        Spends 1 current Willpower to add +3 dice to the pool.
  /rote      Rote action: reroll every failure (1-7) in the initial pool once.
  /weapon    On a hit, add equipped weapon damage as bonus successes.
  /9again    Reroll on 9 or 10 instead of just 10.
  /8again    Reroll on 8, 9, or 10 instead of just 10.

Switches stack via / or , (e.g. +roll/wp/weapon/9again ...).

Examples:
  +roll Strength+Brawl
  +roll Dexterity+Crafts/Automotive+2
  +roll 8
  +roll/wp Resolve+Composure
  +roll/rote Wits+Investigation
  +roll/weapon Strength+Weaponry
  +roll/9again Resolve+Composure
  +roll/8again Wits+Composure
  +roll/wp/rote/9again Stamina+Athletics`,
  exec: rollExec
});

addCmd({
  name: "+health",
  pattern: /^\+health(?:\/([a-z\-]+\d*))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+health [<player>]  -- View or modify a character's Health track.

Switches:
  /bash[<n>]       Apply N bashing damage (default 1).
  /lethal[<n>]     Apply N lethal damage.
  /agg[<n>]        Apply N aggravated damage.
  /heal[<n>]       Heal N damage, heaviest first.
  /heal-bash[<n>]  Heal N bashing damage only.
  /heal-lethal[<n>] Heal N lethal damage only.
  /heal-agg[<n>]   Heal N aggravated damage only.

Cross-player apply/heal requires canEdit (builder+).

Examples:
  +health                       View your Health track.
  +health Marcus                View Marcus's Health track.
  +health/bash                  Apply 1 bashing to yourself.
  +health/lethal3 Marcus        Apply 3 lethal to Marcus (builder+).
  +health/heal2 Marcus          Heal 2 (heaviest first) on Marcus.
  +health/heal-bash5            Heal 5 bashing on yourself.`,
  exec: healthExec,
});

addCmd({
  name: "+beat",
  pattern: /^\+beat(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+beat [/add|/sub][/arcane] [<player>] [= <reason>]  -- Award or subtract a Beat.

Switches:
  /add         Award 1 Beat (default self).
  /sub         Subtract 1 Beat (correction).
  /arcane      Operate on the Arcane Beat track (supernaturals only).

Cross-player edits require canEdit (builder+). Beats convert to Experience
automatically at 5:1 (standard and Arcane tracks separate).

Examples:
  +beat                          View your own Beat/XP pools.
  +beat add                      Award yourself 1 Beat.
  +beat add Marcus = Took a risk Award Marcus a Beat with a reason (builder+).
  +beat add/arcane = Frenzy      Award yourself 1 Arcane Beat.
  +beat sub Marcus               Correct: remove 1 Beat from Marcus.`,
  exec: beatExec,
});

addCmd({
  name: "+xp",
  pattern: /^\+xp(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+xp [<player>]  -- View XP pools, spend XP to raise traits, or list costs.

Switches:
  /spend <trait>=<dots> [for <player>]   Spend XP to raise a trait.
  /list                                  Show the XP cost table.

Cross-player spends require canEdit (builder+).

Examples:
  +xp                            View your own XP pools.
  +xp Marcus                     View Marcus's pools.
  +xp/spend strength=3           Raise your Strength to 3.
  +xp/spend vigor=2 for Marcus   Raise Marcus's Vigor (Arcane XP, builder+).
  +xp/list                       Show the cost table.`,
  exec: xpExec,
});

addCmd({
  name: "+condition",
  pattern: /^\+condition(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+condition [<player>]  -- View or modify active Conditions and Tilts.

Switches:
  /add <key>[/<note>] [for <player>]   Apply a Condition or Tilt.
  /remove <key> [for <player>]         Remove without awarding Beats.
  /resolve <key> [for <player>]        Resolve and award the catalog Beats.
  /list                                Show the catalog.

Cross-player edits require canEdit (builder+).

Examples:
  +condition                         View your own Conditions.
  +condition Marcus                  View Marcus's Conditions.
  +condition/add shaken              Apply Shaken to yourself.
  +condition/add shaken/Spilled mead Apply Shaken with a note.
  +condition/resolve shaken          Resolve Shaken and gain 1 Beat.
  +condition/remove shaken Marcus    Correction: remove without Beats.
  +condition/list                    Show every catalog entry.`,
  exec: conditionExec,
});

addCmd({
  name: "+aspiration",
  pattern: /^\+aspiration(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+aspiration [<player>]  -- View or modify active Aspirations (max 3).

Switches:
  /add <text> [for <player>]        Add a short-term Aspiration.
  /add/long <text> [for <player>]   Add a long-term Aspiration.
  /remove <#> [for <player>]        Remove the Aspiration at slot #.
  /fulfill <#> [for <player>]       Fulfill and gain 1 Beat.

Cross-player edits require canEdit (builder+).

Examples:
  +aspiration                          View your own Aspirations.
  +aspiration Marcus                   View Marcus's Aspirations.
  +aspiration/add Find the killer      Add a short-term Aspiration.
  +aspiration/add/long Become Prince   Add a long-term Aspiration.
  +aspiration/remove 2                 Remove slot 2 (no Beat).
  +aspiration/fulfill 1                Fulfill slot 1 and gain 1 Beat.`,
  exec: aspirationExec,
});

addCmd({
  name: "+cg",
  pattern: /^\+cg(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+cg [<switch>] [<args>]  -- Guided character generation.

Switches:
  /reset              -- You: wipe your sheet + draft and restart.
  /wipe <p>[=reason]  -- Staff: full wipe of another character.
  /set <k>=<v>        -- Set chargen fields/traits.
  /back               -- Previous stage.
  /submit             -- Validate stage / finalize draft.
  /list [<t>]         -- Options index or topic list.
  /info <name>        -- Merit/condition/template detail.

Staff wipe removes live sheet, chargen draft, approved flag,
and fae/forsaken, then seeds a fresh +cg draft. Reason required
when wiping someone else.

Examples:
  +cg
  +cg/reset
  +cg/wipe Alice=Player requested full rebuild
  +cg/set template=mortal
  +cg/submit`,
  exec: cgExec,
});

addCmd({
  name: "+info",
  pattern: /^\+info(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+info <name>  — Detail lookup for merits, conditions, gifts, tilts,
                  dread powers, virtues, vices, seemings, kiths, or courts.

Examples:
  +info giant                 View Giant merit details.
  +info killer instinct       View Killer Instinct gift facet details.
  +info Full Moon's Gift      View Full Moon's Gift details.`,
  exec: infoExec,
});

addCmd({
  name: "+approve",
  pattern: /^\+approve(?:\/(\S+))?\s*(.*)/i,
  lock: "connected admin+",
  category: "Cofd",
  help: `+approve <player>[=<notes>]  -- Promote a chargen draft to a live sheet.

Staff workflow:
  1. +sheet <player>     Review the draft.
  2. +approve <player>  Make it live (sets APPROVED, clears +cg).

Sets the %chapproved%cn flag so the player can no longer use +cg.
A CGEN job is optional; approve works from the draft alone.

Examples:
  +approve Alice
  +approve Alice=Welcome. Watch your touchstones.`,
  exec: approveExec,
});

addCmd({
  name: "+deny",
  pattern: /^\+deny(?:\/(\S+))?\s*(.*)/i,
  lock: "connected admin+",
  category: "Cofd",
  help: `+deny <player>=<reason>  -- Return a chargen draft for revision.

Keeps the player's +cg draft, clears the submitted marker, notifies
them with your reason. They fix with +cg and +cg/submit again.

Examples:
  +deny Alice=Concept needs more detail.
  +deny Bob=Attribute totals are off by one.`,
  exec: denyExec,
});

addCmd({
  name: "+unapprove",
  pattern: /^\+unapprove(?:\/(\S+))?\s*(.*)/i,
  lock: "connected admin+",
  category: "Cofd",
  help: `+unapprove <player>=<reason>  -- Alias for +deny.

Prefer +deny. Same behavior: return draft for revision with a reason.

Examples:
  +unapprove Alice=Concept needs more detail.`,
  exec: unapproveExec,
});

addCmd({
  name: "+prove",
  pattern: /^\+prove(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+prove <traits>[=<player>]  -- Show your trait values to another player or the room.

Switches:
  /here    Always broadcast to the room (default when no =<player>).

Trait list is comma-separated. Accepts everything +roll accepts:
attributes, skills, skill/specialty, willpower, morality (Integrity,
Humanity, etc.), power stat (Blood Potency, Primal Urge, Wyrd...),
and any template power your sheet has (Vigor, Forces, Mind, etc.).

Equipment tokens are also accepted:
  weapon     Your equipped weapon with damage and initiative.
  armor      Your equipped armor with rating and Def/Spd penalties.
  gear       Your full inventory list.

Max 8 traits per command. Output is a PROVE>> system line read from
your live sheet -- it cannot be faked with @emit or pose.

Examples:
  +prove strength                       Broadcast your Strength.
  +prove strength,athletics,brawl       Broadcast three traits.
  +prove subterfuge/cons=Marcus         Whisper a specialty to Marcus.
  +prove/here resolve+composure         (use commas, not +) /here is explicit.
  +prove vigor,blood potency=Lyra       Whisper Vigor + Blood Potency.
  +prove weapon                         Show your equipped weapon.
  +prove armor=Marcus                   Whisper your equipped armor to Marcus.
  +prove weapon,armor,gear              Show full loadout.`,
  exec: proveExec,
});

addCmd({
  name: "+gear",
  pattern: /^\+gear(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+gear [<player>] [<filter>]  -- Browse equipment and manage carried items.

Switches:
  /list [<cat>]                          Catalog by category (weapons|ranged|melee|armor|mental|physical|social|services|ammo).
  /show <key>                            Full catalog entry for an item.
  /add <key>[/<note>] [for <player>]     Add an item; ammo merges into existing stack.
  /remove <#> [for <player>]             Discard inventory slot #.
  /equip <#> [for <player>]              Equip weapon or armor at slot #.
  /unequip <weapon|armor> [for <player>] Unequip a slot.
  /reload [<#|name>] [for <player>]      Reload a firearm; consumes one ammo stack.
  /split <#>=<n> [for <player>]          Split <n> rounds off an ammo stack.
  /damage <#|name>[=<n>] [for <player>]  Apply <n> damage; soaks by Durability.
  /repair <#|name>[=<n>] [for <player>]  Repair <n> hp; clamps to max.
  /token/create <name>=<rating>/<catch>/<drawback> [for <player>] (Staff)
  /token/activate[/catch] <#|name|id>    Activate token (Glamour cost or Catch).

Native get/drop/give handle moving items between players and the room.
Firearms track their own ammo; firing decrements, /reload consumes a stack.
Broken items auto-unequip. Cross-player edits require canEdit (builder+).

Examples:
  +gear                          View your inventory.
  +gear ammo                     View just your ammo stacks.
  +gear/add pistol-light         Add a light pistol.
  +gear/add magazine-9mm-light   Stack a 9mm magazine.
  +gear/equip 1                  Equip slot 1.
  +gear/reload                   Reload your equipped firearm.
  +gear/split 3=5                Split 5 rounds off ammo stack 3.
  +gear/damage rifle=4           Apply 4 damage to your rifle.
  +gear/repair vest=2            Repair 2 hp on your vest.

More:
  help gear ammo                 Magazines, stacking, concealment.
  help gear durability           Soak math, broken state, repair.
  help gear reload               Reload mechanics and ammo consumption.`,
  exec: gearExec,
});

addCmd({
  name: "+token",
  pattern: /^\+token(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+token[/<switch>] <ref>  -- Activate or create Hedgespun Tokens.

Switches:
  /catch           Activate the token by invoking its Catch (no Glamour cost).
  /create          Staff: Create a new custom token in player's inventory.

Examples:
  +token Hedge Ring
  +token/catch 1
  +token/create Golden Apple=3/Eat a worm/Get paranoid`,
  exec: tokenExec,
});

addCmd({
  name: "+reload",
  pattern: /^\+reload\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+reload [<#>] [for <player>]  -- Reload an equipped or carried firearm.

Equivalent to +gear/reload. Without a slot number, reloads the equipped
weapon. See help +gear for inventory management.`,
  exec: async (u: IUrsamuSDK) => {
    const rest = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    await gearReload(u, rest);
  },
});

addCmd({
  name: "+tilt",
  pattern: /^\+tilt(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+tilt [<player>]  -- View or modify active Tilts (Personal + Environmental).

Switches:
  /list [<scope>]                        Catalog (filter: personal|environmental).
  /show <key>                            Full Tilt entry.
  /add <key>[/<note>] [for <player>]     Inflict a Tilt.
  /remove <key> [for <player>]           Remove a Tilt (no Beats awarded).
  /clear [for <player>]                  End-of-scene sweep -- clear all Tilts.

Tilts award no Beats on resolution (CoFD 2e core p.282).
Cross-player edits require canEdit (builder+).

Examples:
  +tilt                          View your active Tilts.
  +tilt/list environmental       List environmental Tilts.
  +tilt/show stunned             Show the Stunned Tilt.
  +tilt/add stunned              Apply Stunned to yourself.
  +tilt/add ice for Marcus       Apply Ice to Marcus (builder+).
  +tilt/clear                    End scene -- wipe your Tilts.`,
  exec: tiltExec,
});

addCmd({
  name: "+notes",
  pattern: /^\+notes(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+notes [...]  -- Character notes with public/private visibility.

Syntax:
  +notes                        Show your own notes.
  +notes <player>               Show another player's visible notes.
  +notes <player>/<name>        Show one note in full.
  +notes/add [<player>/]<name>=<text>    Create a note (public by default).
  +notes/edit [<player>/]<name>=<text>   Replace the text.
  +notes/del [<player>/]<name>           Delete a note.
  +notes/priv [<player>/]<name>=public|private

Notes:
  Private notes are visible only to their owner and staff. Cross-player
  edits require canEdit. Max name 40 chars; max text 8000 chars.`,
  exec: notesExec,
});

addCmd({
  name: "+views",
  pattern: /^\+views?(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+views [name]  -- Detail views on the current place.

Syntax:
  +views                     List views you can see here.
  +views <name>              Read one view.
  +views/list [<place>]      List views (default: here).
  +views/add <name>=<text>   Create a view (needs canEdit).
  +views/edit <name>=<text>  Replace text.
  +views/del <name>          Delete a view.
  +views/lock <name>=<lock>  Set lock (empty or ! clears).

Locks use normal lock logic (flag(), perm(), &&, ||, !).
If any view is visible, look shows a +views Available line.

Examples:
  +views/add Angel=Green wings drip with rain.
  +views/lock Angel=flag(approved)
  +views Angel`,
  exec: viewsExec,
});

addCmd({
  name: "+turn",
  pattern: /^\+turn(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+turn[/sw] [args]  -- Reaction postures and staff auto-pump.

NPC AI is automatic on +combat/next and after PC attacks. These switches
are helpers, not a second turn system.

Switches:
  /done                       Alias for +combat/next (NPC AI on).
  /auto [<max-rounds>]        Builder+: pump until PC turn / all NPCs down /
                              cap. Default 10, hard cap 50.
  /reaction <posture> [target=<name>]
                              Set your reaction posture for the next round.
                              Postures: ambush, overwatch, guard,
                              first-fire-on-adjacent.

Examples:
  +turn/done                       End your turn; NPCs act automatically.
  +turn/auto 5                     Builder: pump up to 5 rounds.
  +turn/reaction ambush            Set ambush posture.
  +turn/reaction overwatch target=Marcus
                                   Overwatch keyed to Marcus.`,
  exec: turnExec,
});

addCmd({
  name: "+combat",
  pattern: /^\+combat(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+combat [/switch] [<args>]  -- Manage a Chronicles of Darkness combat encounter.

Switches:
  /start                   Open a new encounter in the current room.
  /join [for <player>]     Add yourself (or another player) to the encounter.
                           Auto-opens an encounter here if none exists.
  /leave [for <player>]    Remove yourself (or another player) from the encounter.
  /begin                   Roll initiative for all participants and begin.
                           Auto-opens and adds you if none exists.
  /next [/manual]          Advance turn. Default: NPCs act via AI until the
                           next PC (or a manual NPC). /manual = one slot only.
  /end                     Resolve the encounter and dismiss participants.
  /order                   Show the current initiative table.
  /ambush <target>         Contested Dex+Stealth vs Wits+Composure ambush check.
  /recover                 Spend 1 Willpower to clear your Beaten Down state.
  /surrender               Declare surrender; attackers cannot target you.
  /breakpin                Spend 1 Willpower to break suppression-pin.
  /cover <level> [for <player>]    Declare cover. Level: partial|substantial|full|none.
  /conceal <level> [for <player>]  Declare concealment. Level: light|medium|heavy|none.
  /status [<player>]       Show a participant's cover, conceal, dodge, and Defense.

NPC AI runs automatically after PC attacks and on /next. Opt out per NPC
with +npc/ai <name>=manual (or off/none). Cross-player /join, /leave,
/cover, /conceal require canEdit (builder+).

Examples:
  +combat                   Show the current encounter status.
  +combat/start             Open a new encounter.
  +combat/join              Add yourself to the initiative order.
  +combat/begin             Roll initiative and announce the order.
  +combat/order             Display the initiative table.
  +combat/next              End turn; NPCs act automatically.
  +combat/next/manual       Advance one slot with no AI.
  +combat/ambush Marcus     Try to ambush Marcus.
  +combat/cover partial     Take partial cover (-1 to attackers).
  +combat/conceal heavy     Hide in heavy concealment (-3 to attackers).
  +combat/status Marcus     Inspect Marcus's combat state.
  +combat/end               Close the encounter.`,
  exec: combatExec,
});

addCmd({
  name: "+attack",
  pattern: /^\+attack(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+attack <target>[/<switches>]  -- Perform a combat attack in an active encounter.

Switches (stackable with /):
  /unarmed /melee /ranged /thrown  Pool override.
  /all-out                         +2 dice; attacker loses Defense.
  /charge                          +2 dice; attacker loses Defense.
  /aim                             Bank +1 aim for next /ranged attack (max 3).
  /offhand                         -2 dice.
  /pull[=<max>]                    Pulling blow; cap damage at <max>.
  /head /arm /leg /hand /eye /heart /torso  Specified target location.
  /burst-short /burst-med /burst-long       Autofire bonuses.
  /suppress                        Suppressive burst-long; no damage, pins others.
  /into-melee[=<n>]                -2 per bystander to avoid.
  /target-prone                    Target is prone (-2 ranged, +2 melee).
  /target-surprised                Target is surprised (no Defense).
  /willpower                       Spend 1 WP for +3 dice.
  /no-ammo                         Skip ammo decrement (ST override).

Requires an active encounter (+combat/begin). Must be your turn.
Cross-player Health writes require canEdit (builder+).

Examples:
  +attack Marcus
  +attack Marcus/melee/all-out
  +attack Beth/ranged/aim
  +attack Goon/unarmed/head
  +attack Vlad/willpower/specified=torso`,
  exec: attackExec,
});

addCmd({
  name: "+grapple",
  pattern: /^\+grapple\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+grapple <target>  -- Initiate a grapple in an active encounter (Str+Brawl vs Defense).
+grapple/<move>    -- Execute a move during an active grapple.

Moves:
  /break-free      Attempt to escape (Str+Brawl >= holder's Str+Brawl).
  /control-weapon  Control a weapon in the grapple.
  /damage          Deal bashing damage (Str+Brawl).
  /disarm          Disarm the opponent.
  /drop-prone      Drag both combatants to the ground.
  /hold            Maintain the grapple without a move.
  /restrain        Fully restrain the opponent.
  /take-cover      Use the opponent as cover.

Requires an active encounter (+combat/begin). Must be your turn.

Examples:
  +grapple Marcus
  +grapple/damage
  +grapple/break-free
  +grapple/restrain`,
  exec: grappleExec,
});

addCmd({
  name: "+throw",
  pattern: /^\+throw(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+throw <item-key> [at <target>]  -- Throw a grenade (AoE) or aerodynamic weapon (single target).

Switches:
  /fratricide        Include the thrower in the blast (debug / cinematic).
  /willpower (/wp)   Spend 1 Willpower for +3 dice.
  /into-melee[=<n>]  -n dice to avoid hitting bystanders.

Grenades (blast > 0) damage every encounter participant. Net successes
above each target's Stamina deal full force damage (lethal); equal
successes deal half force (round down); below evades the blast.

Tilts: stun grenades inflict Stunned; smoke inflicts Blinded; frag /
molotov inflict Knocked-Down when damage >= target Size.

Aerodynamic weapons (knife / shuriken) require 'at <target>' and
resolve like a normal ranged attack with no range penalty.

Requires an active encounter (+combat/begin). Must be your turn.

Examples:
  +throw grenade-frag-standard      Throw a frag grenade at the room.
  +throw grenade-stun               Flashbang every participant.
  +throw knife at Marcus            Throw a knife at Marcus.
  +throw/fratricide grenade-molotov Include yourself in the blast.`,
  exec: throwExec,
});

addCmd({
  name: "+npc",
  pattern: /^\+npc(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+npc [/switch] [<args>]  -- Spawn and manage non-player antagonists.

Switches:
  /list                              Show all NPCs in the current room (default).
  /build <name>=<archetype>[/<tier>] Spawn an NPC with full stat block (staff).
  /create <name>=<archetype>         Alias for /build.
  /show <name-or-id>                 Display the full stat block.
  /powers                            List the Dread Powers / Numina catalog.
  /addpower <npc>=<key>              Attach a dread power to an NPC (staff).
  /rmpower <npc>=<key>               Detach a dread power (staff).
  /ai <name>=<ai-archetype>          Set NPC AI (staff). Default on:
                                     beshilu-swarmer, azlu-stalker,
                                     spirit-ridden-feral. Use manual|off|none
                                     for ST-controlled (pauses AI on their turn).
  /aggro <name>=<target>             Spike NPC threat toward target (staff).
  /aggro-mode <name>=<mode>          Builder+: override a single mob's aggro (passive|territorial|hunter). Persists on the sheet; zone wander/aggro hooks read it live.
  /destroy <name-or-id>              Remove an NPC (staff only).

Archetypes: thug, cultist, soldier, beast, lieutenant, boss, hunter,
professional, occultist, ghost, spirit, mastermind.

Tiers: minor (mook), major (named antagonist), storyteller (PC-equivalent).
Without /<tier> the archetype's default tier is used.

NPCs are real game objects flagged 'npc' with a CoFD sheet at state.cofd
plus a directory record in cofd.npcs. They join initiative and accept
+attack like players. Cross-player edits require canEdit (builder+);
/build, /addpower, /rmpower, and /destroy require staff (admin or builder).

Examples:
  +npc                              List NPCs in the room.
  +npc/build Goon=thug              Spawn a Thug (minor tier).
  +npc/build Karl=hunter/storyteller Spawn a storyteller-tier Hunter.
  +npc/show Goon                    Show Goon's stat block.
  +npc/powers                       List Dread Powers / Numina.
  +npc/addpower Karl=mortal-mask    Attach Mortal Mask.
  +npc/destroy Goon                 Remove the NPC by name.
  +npc/aggro-mode Goon=hunter       Override Goon's aggro mode to hunter.`,
  exec: npcExec,
});

addCmd({
  name: "+aid",
  pattern: /^\+aid(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+aid <target>  -- Render first aid (Dexterity + Medicine).

Each success converts 1 lethal box on the patient to bashing. If no
lethal remains, successes clear bashing instead. Aggravated damage
cannot be treated by first aid. Exceptional success (5+) also clears
one bashing automatically. Dramatic failure inflicts 1 lethal on the
patient. Once per scene per patient.

Switches:
  /reset <player>   ST: clear the patient's aid-lock for the next scene.

Examples:
  +aid Marcus           Treat Marcus's wounds.
  +aid                  Self-aid (must have damage to treat).
  +aid/reset Marcus     Staff: clear Marcus's once-per-scene lock.`,
  exec: aidExec,
});

addCmd({
  name: "+integrity",
  pattern: /^\+integrity(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+integrity [<player>]  -- View Integrity, trigger a Breaking Point, or adjust the track.

Switches:
  /break <reason> [+/-N]                    Self-trigger a Breaking Point.
  /break <player>=<reason> [+/-N]           ST-initiated for another player.
  /set <0-10> [for <player>]                ST: set Integrity rating directly.

Pool is Resolve + Composure + Integrity-rating mod + optional situational
modifier (capped +/-5 per RAW p.74). Outcomes:
  Dramatic failure: -1 Integrity, Broken/Fugue/Madness Condition, +1 Beat.
  Failure         : -1 Integrity, Shaken/Guilty Condition.
  Success         : no loss, Guilty/Shaken/Spooked Condition.
  Exceptional     : no loss, Steadfast/Inspired Condition, +1 Willpower, +1 Beat.

Cross-player /break and /set require canEdit (builder+).

Examples:
  +integrity                          View your Integrity track.
  +integrity Marcus                   View Marcus's Integrity.
  +integrity/break Watched a murder -3   Self-trigger with -3 situational mod.
  +integrity/break Marcus=Killed in self-defense -4  ST roll for Marcus.
  +integrity/set 5 for Marcus         Staff: set Marcus to Integrity 5.`,
  exec: integrityExec,
});

addCmd({
  name: "+social",
  pattern: /^\+social(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+social [/switch] [<args>]  -- Chronicles of Darkness Social Maneuvering (Core p.81-83).

Switches:
  /start <target>=<goal>          Open a maneuver with a stated goal.
  /impression <level> [for <t>]   Set impression (hostile|average|good|excellent|perfect). ST/canEdit.
  /door [<reason>] [for <t>]      Roll Manipulation+Persuasion vs Composure. Opens one door (two on exceptional).
  /soft <kind>=<text> [for <t>]   Soft leverage: aspiration removes a door; vice/gift bumps impression.
  /hard [severe] <text> [for <t>] Hard leverage: threats/blackmail. Removes 1 door (2 if severe); worsens impression.
  /force [for <t>]                Force the doors: one-shot roll vs remaining-doors penalty. All-or-nothing.
  /status [<target>]              Show the maneuver panel.
  /list                           List all your active maneuvers.
  /end [for <t>]                  Abandon the maneuver. Opened doors close.

Doors base = min(Resolve, Composure) of the subject. Hostile impression
cannot roll until improved. Cumulative -1 penalty per failed door roll.
Dramatic Failure ends the maneuver and grants subject immunity.

Examples:
  +social/start Marcus=Loan me the grimoire
  +social/impression good for Marcus
  +social/soft aspiration=Help him achieve academic glory
  +social/door Pitch the offer
  +social/hard severe Threaten him at gunpoint
  +social/force
  +social/end`,
  exec: socialExec,
});

addCmd({
  name: "+zone",
  pattern: /^\+zone(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+zone[/sw] [args]  -- Staff: manage themed regions of rooms populated with wandering NPCs.

Switches:
  /list                                  Show all zones.
  /show <name>                           Inspect a zone.
  /create <name>                         Builder+: create a zone anchored to this room.
  /add <name>=<roomId> [<roomId>...]     Builder+: extend the zone with explicit rooms.
  /from-exits <name>                     Builder+: extend by walking exits from current members.
  /populate <name>=<archetype>x<N> [aggro=<mode>]
                                         Builder+: spawn N NPCs of an archetype across the zone.
                                         aggro = passive | territorial | hunter (default territorial).
  /populate <name>=theme=<theme> [size=small|medium|large] [aggro=<mode>]
                                         Builder+: spawn a weighted mix from a themed table.
                                         themes = forest | city | urban-decay | sewer | ruins.
                                         size: small=3, medium=6 (default), large=12 picks.
  /wander <name>=on|off                  Builder+: start/stop the wander tick.
  /respawn <name>=<seconds>|off          Builder+: refill spawn-rule deficits on a cooldown.
  /flavor <name>=on|off                  Builder+: ambient atmosphere broadcasts (default on).
  /theme <name>=<theme>|none             Builder+: set theme tag (gates flavor pool and is informational).
  /migration <name>=on|off               Builder+: allow mobs to wander into adjacent rooms in OTHER zones.
  /destroy <name>                        Builder+: delete the zone (NPCs remain; clean up via +npc).

Aggro modes:
  passive       Mob will not initiate combat.
  territorial   Mob attacks PCs who enter its current room.
  hunter        Attacks intruders AND walks toward distant active encounters in the zone.

Overlap precedence: when a room appears in multiple zones, the OLDEST zone
owns it for aggro and wander purposes (deterministic by createdAt).

Examples:
  +zone/create deepwood
  +zone/from-exits deepwood
  +zone/theme deepwood=forest
  +zone/populate deepwood=beshilu x6 aggro=hunter
  +zone/populate deepwood=theme=forest size=large aggro=hunter
  +zone/respawn deepwood=120
  +zone/flavor deepwood=on
  +zone/wander deepwood=on`,
  exec: zoneExec,
});

addCmd({
  name: "+kenning",
  pattern: /^\+kenning(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+kenning [<target>]  -- Fae perception (Wits + Wyrd).

No target: roll Wits+Wyrd and report a result tier for
nearby supernatural presence. With a target: mortal
harvest suitability, fae recognition, or glamour
signature. Requires a changeling sheet.

Examples:
  +kenning
  +kenning Alice
  +kenning the stranger`,
  exec: kenningExec,
});

addCmd({
  name: "+contract",
  pattern: /^\+contract(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+contract [<name>]  -- List or invoke a Changeling Contract.

Switches:
  (none) / list          Contracts on your sheet.
  /info <name>           Catalog detail for a Contract.
  /loophole <name>       Invoke using the listed loophole (0 Glamour).
  /learn <name>          Learn contract with XP (checks prerequisites).
  /grant <player>=<name> Staff: Grant a contract directly.
  <name>                 Invoke (pay cost; roll pool if any).
  <name> on <target>     Inflict Conditions/Tilts on a target.

While Mask is down (+shift mien), successful Contract rolls count
as exceptional (successes floored at Wyrd). Seeming clauses print
when your seeming matches. Named Conditions/Tilts in effect text
auto-apply on success (self or on <target>).

Examples:
  +contract
  +contract/loophole Hostile Takeover
  +contract Paralyzing Presence on Bob
  +contract Tale of the Baba Yaga on Alice`,
  exec: contractExec,
});

addCmd({
  name: "+harvest",
  pattern: /^\+harvest(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+harvest [target][=pool]  -- Harvest Glamour from emotion (CtL).

Roll Presence+Empathy (or =custom pool). Each success = 1 Glamour.
Cannot harvest fae. Reaping is predatory:

  +harvest/reap <target>  Fill Glamour; target loses WP=Wyrd,
                          gains Ravaged; you take a breaking point.

Examples:
  +harvest
  +harvest Alice
  +harvest Bob=Manipulation+Subterfuge
  +harvest/reap Charlie`,
  exec: harvestExec,
});

addCmd({
  name: "+reap",
  pattern: /^\+reap(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+reap <target>  -- Rip Glamour from a non-fae target (CtL).

Alias of +harvest/reap. Touch required (RP). Fills your Glamour,
drains Willpower equal to Wyrd, applies Ravaged, breaking point.

Examples:
  +reap Alice`,
  exec: async (u) => {
    const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    await reapExec(u, rest);
  },
});

addCmd({
  name: "+bedlam",
  pattern: /^\+bedlam(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+bedlam <emotion> [+G]  -- Incite Bedlam (CtL p.110).

Cost 1 Glamour + 1 Willpower. Pool Manipulation+Wyrd
(+Pandemoniacal, +extra Glamour dice up to 5). Contests each
PC in the room (Composure+Wyrd). Emotions:

  desire/spring → Wanton   wrath/summer → Competitive
  fear/autumn   → Frightened   sorrow/winter → Lethargic

Examples:
  +bedlam fear
  +bedlam desire 2`,
  exec: bedlamExec,
});

addCmd({
  name: "+clash",
  pattern: /^\+clash(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+clash <target> [reason]  -- Clash of Wills (CtL p.126).

Both sides roll Power Stat + higher of Resolve/Composure.
Higher successes win; ties cancel.

Examples:
  +clash Alice
  +clash Bob masking contest`,
  exec: clashExec,
});

addCmd({
  name: "+frailty",
  pattern: /^\+frailty(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+frailty  -- List Wyrd frailties (taboos and banes).

  +sheet/set frailty=taboo: never break bread with liars
  +sheet/set frailty=bane: cold iron
  +frailty/iron   Cold iron rules summary
  +frailty/check <text>   Parse a frailty line

Acting against a frailty source costs 1 WP/action and
−3 dice (−5 major). Cold iron deals aggravated to Lost.

Examples:
  +frailty
  +frailty/iron`,
  exec: frailtyExec,
});

addCmd({
  name: "+dream",
  pattern: /^\+dream(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+dream[/sw]  -- Oneiromancy: Bastions and weaves (CtL).

  (none)              Dream form / Bastion status.
  /ivory              Gate of Ivory (own Bastion, Res+Com).
  /horn               Gate of Horn (from Hedge).
  /enter <name>       Enter another's Bastion vs Fort.
  /wake [/forced]     Leave the dreamscape.
  /weaves             Dreamweave catalog.
  /weave <effect>     Shape the dream (subtle/paradigm).
  /role <text>        Take a fitting role.
  /travel <exit>      Move on Dreaming Roads.
  /road <name>        Staff: tag Roads node.
  /link <lab>=<room>  Staff: link Roads exits.
  /linkboth …         Staff: bidirectional link.
  /bastion <n>[=f]    Staff: tag room as Bastion.

Examples:
  +dream/ivory
  +dream/weave memory
  +dream/travel moon-arch
  +dream/enter Alice
  +dream/wake`,
  exec: dreamCommand,
});

addCmd({
  name: "+fetch",
  pattern: /^\+fetch(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+fetch[/sw]  -- Fetches and Echoes (CtL p.233).

  (none)              Status (link or fetch sheet).
  /echoes             Echo catalog.
  /echo <slug> [note] Activate Echo (fetch sheet).
  /flaw <text>        Set human flaw.
  /met                Met original face-to-face.
  /create <ch>=<Name>[/flaw][/mat] [for <p>]  Staff.
  /link <ch>=<fetch>  Staff link sheets.
  /mode <p>=adversary|other-half|hard-lesson
  /grant-echo <p>=<slug>

Examples:
  +fetch
  +fetch/echo summon-shard
  +fetch/create Bob=Bobby/empty smile for FetchBot`,
  exec: fetchCommand,
});

addCmd({
  name: "+hunt",
  pattern: /^\+hunt(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+hunt[/sw]  -- Wild Hunt and Huntsman powers (CtL).

  (none)              Hunt status (quarry or Huntsman).
  /powers             Huntsman Dread Power catalog.
  /power <slug>       Activate a power.
  /track <quarry>     Advance hunt (Wits+Survival+Wyrd).
  /read [<quarry>]    Kindred Spirits readout.
  /mark <ch>=<hunter> Staff: begin a hunt.
  /end [<who>]        End the hunt.
  /create <player>    Staff: make Huntsman sheet.
  /grant <p>=<slug>   Staff: grant a power.

Mask-down quarry adds their Wyrd to track pools.
Progress 1–10: scent → trail → closing → cornered.

Examples:
  +hunt/track Alice
  +hunt/power kindred-spirits
  +hunt/mark Bob=TheVerderer`,
  exec: huntCommand,
});

addCmd({
  name: "+mantle",
  pattern: /^\+mantle(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+mantle  -- Court Mantle bonuses (CtL p.117–118).

  (none)                 Show court Mantle dots and bonuses.
  /glamour <note>        +1 Glamour court emotion (1/scene).
  /debt                  Autumn•••• wipe Goblin Debt (1/story).
  /clarity               Spring••••• convert Clarity Cond.

Dice auto on +roll. High-dot:
  Summer••• /protect armor  Summer••••• /defend agg
  Autumn••• Contract −1G vs Fae  Winter••••• no wound pen

Examples:
  +mantle
  +mantle/debt
  +mantle/clarity
  +attack Bob/defend
  +roll/protect`,
  exec: mantleCommand,
});

addCmd({
  name: "+hob",
  pattern: /^\+hob(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+hob[/sw]  -- Hobgoblins (CtL p.252 light).

  (none)              Status (if hobgoblin sheet).
  /concepts           Concept list.
  /powers             Dread Power catalog keys.
  /power <key>        Activate a known power.
  /create <p>=Name/concept[/wyrd]  Staff.
  /grant <p>=<key>    Staff grant Dread Power.

Concepts: trickster, merchant, predator, guardian,
crafter, custom. NPC: hobgoblin-trader (+npc).

Examples:
  +hob/create Bob=Needlegrin/merchant/3
  +hob/power innocuous`,
  exec: hobCommand,
});

addCmd({
  name: "+hedge",
  pattern: /^\+hedge(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+hedge[/sw] [args]  -- CtL Hedge, Hollows, keys, fruit.

Player:
  (none)                 Realm, Hollow budget, gates, path.
  /open|/exit [n][=key]  Portal; key phrase free-opens.
  /claim                 Claim unclaimed Hollow.
  /hollow [list|slug]    Hollow Merit enhancements.
  /escape                Escape Route out of Hollow.
  /access                Easy Access into home Hollow (1G).
  /route                 Route Zero (1/day path+WP in Hollow).
  /luxury [item]         Luxury Goods pull (Hollow).
  /garden                Shadow Garden harvest.
  /find <gate>           Find Hidden Entry (−2).
  /travel|/forage|/fruit|/eat

Builder+:
  /create /link /set /setway /destroy /ways /season
  /setway n/key=phrase   Shared open key.
  Room: flavor, maskflavor, hollowrating, hollowowner.

Examples:
  +hedge/open Gate=three red leaves
  +hedge/hollow size-2
  +hedge/access
  +hedge/route
  +hedge/luxury rope and lantern
  +hedge/setway Gate/maskName=Old cellar door`,
  exec: hedgeExec,
});

addCmd({
  name: "+market",
  pattern: /^\+market(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+market[/sw] [args]  -- Goblin Markets (CtL).

Player (in a market room):
  (none)              Browse stalls and prices.
  /catalog [filter]   Full goods catalog.
  /buy <slug> [debt]  Pay Glamour (or take Debt).
  /credit <slug>      Buy on credit (Goblin Debt).

Builder+:
  /create <name>      Open a market in this room.
  /stock <slug> <n>   Set stock (−1 = unlimited).
  /open /close        Toggle market open.
  /destroy [id]       Remove market.
  /list               All markets.

Debt: +debt, +debt/pay <id>, staff +debt/call.

Examples:
  +market
  +market/buy amaranthine
  +market/credit trifle-token
  +market/create Night Bazaar`,
  exec: marketExec,
});

addCmd({
  name: "+debt",
  pattern: /^\+debt(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+debt[/sw] [args]  -- Goblin Debts from market credit.

Switches:
  (none) / list       Your open and called debts.
  /pay <id>           Mark a debt paid (service done).
  /call <p> <id>=msg  Staff: call in a debt.
  /clear <p> <id>     Staff: force clear.

Examples:
  +debt
  +debt/pay debt-1234
  +debt/call Alice abc12345=Bring three teeth by dawn`,
  exec: debtCommand,
});

addCmd({
  name: "+icon",
  pattern: /^\+icon(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+icon[/sw] [args]  -- Icons: lost pieces of self (CtL).

Switches:
  (none) / list       List your Icons.
  /info <id|name>     Full Icon detail.
  /spend <id> [=note] Burn an Icon for Glamour surge.
  /grant <p>=name/... Staff: grant Icon.
  /recover <p> <id>   Staff: mark recovered.
  /hold <p> <id>=who  Staff: set holder.
  /remove <p> <id>    Staff: delete Icon.

Examples:
  +icon
  +icon/spend childhood-laugh=face the Huntsman
  +icon/grant Pix=Mother's Song/memory/The Keeper`,
  exec: iconCommand,
});

addCmd({
  name: "+spin",
  pattern: /^\+spin(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+spin[/sw] [args]  -- Hedgespinning (reshape the Hedge).

Must be in a Hedge or Hollow room. Costs Glamour;
rolls Wits + Crafts|Occult + Wyrd vs effect target.

Switches:
  (none) / list       Effect catalog.
  /info <effect>      Effect detail.
  /path|/shelter|...  Spin that effect.
  path [text]         Same without slash.
  /veil <mask text>   Set mortal-facing room veil.

Examples:
  +spin
  +spin path
  +spin/veil A quiet suburban park
  +spin fruit`,
  exec: spinCommand,
});

addCmd({
  name: "+shift",
  pattern: /^\+shift(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+shift [<form>]  -- Change form or Mask state (template-routed).

Changeling (CtL):
  +shift                 Status (Mask / animal / Glamour).
  +shift mien            Drop Mask (1 Glamour). True face shows.
  +shift mask            Raise Mask (1 Glamour).
  +shift <animal>        Chrysalis form (2 Glamour; need Contract).
  +shift human           Leave animal form (free).
  +shift/list [animals]  Legal forms or full animal catalog.
  +shift/info <form>     Mechanics summary.
  +shift <form> for <x>  Staff/canEdit: shift an NPC or other PC.

Prose: +sheet/set mask=... and +sheet/set mien=...
Animals: +sheet/set animals=wolf,hawk (with Chrysalis on sheet).
Combat end free-raises Mask / ends animal form.

Werewolf forms are not online yet.

Examples:
  +shift
  +shift mien
  +shift wolf
  +shift human
  +shift/list animals
  +shift mien for Goon`,
  exec: shiftExec,
});

addCmd({
  name: "+district",
  pattern: /^\+district(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+district[/sw] [args]  -- Show or configure district traits and limits.

Switches:
  /show [<target>]                       Show district details (default: here).
  /set [<target>/]<trait>=<val>          Set trait value (e.g. Access, Safety).
  /type [<target>/]<archetype>          Set archetype type/name.
  /create-parent <name>[=<archetype>]   Create a district parent object.

Examples:
  +district
  +district/set safety=2
  +district/set #10/sizemax=3
  +district/create-parent ParentSlums=slums`,
  exec: districtExec,
});

addCmd({
  name: "+equip",
  pattern: /^\+equip\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+equip <#|name> [for <player>]  -- Equip an item in inventory.

Examples:
  +equip shotgun           Equip shotgun.
  +equip 1                 Equip inventory slot 1.`,
  exec: (u) => {
    const rest = (u.cmd.args[0] ?? "").trim();
    return gearEquip(u, rest);
  },
});

addCmd({
  name: "+wield",
  pattern: /^\+wield\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+wield <#|name> [for <player>]  -- Wield a weapon in inventory.

Examples:
  +wield shotgun           Wield shotgun.
  +wield 1                 Wield inventory slot 1.`,
  exec: (u) => {
    const rest = (u.cmd.args[0] ?? "").trim();
    return gearEquip(u, rest);
  },
});

addCmd({
  name: "+wear",
  pattern: /^\+wear\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+wear <#|name> [for <player>]  -- Wear armor in inventory.

Examples:
  +wear vest               Wear armor.
  +wear 2                  Wear inventory slot 2.`,
  exec: (u) => {
    const rest = (u.cmd.args[0] ?? "").trim();
    return gearEquip(u, rest);
  },
});

addCmd({
  name: "+unequip",
  pattern: /^\+unequip\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+unequip <weapon|armor> [for <player>]  -- Unequip weapon or armor.

Examples:
  +unequip weapon          Unequip your weapon.
  +unequip armor           Unequip your armor.`,
  exec: (u) => {
    const rest = (u.cmd.args[0] ?? "").trim();
    return gearUnequip(u, rest);
  },
});

addCmd({
  name: "inventory",
  pattern: /^(?:inventory|i)$/i,
  lock: "connected",
  category: "Cofd",
  help: `inventory  -- View your equipment and carried items.

Synonyms: i, +gear`,
  exec: (u) => {
    return gearView(u, "");
  },
});

addCmd({
  name: "+pledge",
  pattern: /^\+pledge(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cofd",
  help: `+pledge[/sw] [args]  -- Manage Changeling pledges (seals/oaths/bargains).

Switches:
  /seal <target>=[dur/]<text>/<sanc>  Seal target's words (1 Glamour).
  /seal/strengthen <target>=...       Strengthen seal (1 Glamour + 1 WP).
  /oath <type>/<targ>=<text>/<boon>/<sanc>  Propose oath (1 Glamour).
  /bargain <targ>=<serv>/<pay>        Bargain with mortal (1 Glamour).
  /accept <id>                        Accept a pending proposed pledge.
  /refute <id>                        Refute pending proposed seal (1 Glam).
  /list [<player>]                    List pledges involving player.
  /view <id>                          View details of a pledge.
  /release <id>                       Safely release/end a pledge.
  /break <id>[=reason]                Break pledge & trigger sanction.

Examples:
  +pledge/seal Bob=scene/I will not fight/1 bashing
  +pledge/oath personal/Alice=never lie/swap-pools/notoriety
  +pledge/accept 4a8b7c9e`,
  exec: pledgeCommand,
});

