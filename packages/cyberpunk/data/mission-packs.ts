/**
 * Mission packs for +run — AI-GM end-to-end runs.
 * Keep line width ≤ 78.
 */
import type {
  IMissionObjective,
  IMissionPhase,
} from "../db/schemas.ts";

export interface IMissionPack {
  id: string;
  title: string;
  /** One-line board blurb. */
  blurb: string;
  brief: string;
  payoutEb: number;
  heatMax: number;
  /** Suggested roles (soft). */
  roleHints: string[];
  phases: IMissionPhase[];
  objectives: Omit<IMissionObjective, "done">[];
}

export const MISSION_PACKS: readonly IMissionPack[] = [
  {
    id: "maelstrom-smash",
    title: "Maelstrom Chop-Shop Smash",
    blurb: "Hit a Maelstrom garage. Neutralize muscle. Grab the crate.",
    brief:
      "A Fixer needs a sealed crate pulled from a Maelstrom chop-shop " +
      "on the Combat Zone fringe. Expect chrome junkies with bad aim " +
      "and worse manners. In, drop the muscle, grab the crate, out.",
    payoutEb: 1200,
    heatMax: 6,
    roleHints: ["solo", "lawman", "nomad"],
    phases: [
      {
        id: "approach",
        title: "Approach",
        kind: "rp",
        scene:
          "Rain sheets off a corrugated garage roof. Neon from a " +
          "half-dead sign stutters MAEL—STROM PARTS. Two bikes and a " +
          "panel van out front. Bass from inside. The crate is " +
          "supposed to be in the back bay.",
        onEnter:
          "Let the crew recon. Offer a door, a side window, or a " +
          "noisy front. Do not pose for them.",
      },
      {
        id: "breach",
        title: "Breach",
        kind: "combat",
        scene:
          "Inside: oil stink, welding sparks, a workbench of half-" +
          "stripped cyberlimbs. Maelstromers turn as you enter — " +
          "chrome smiles, cheap SMGs.",
        spawn: ["boosterganger", "boosterganger"],
        onEnter:
          "Spawn threats if not present. Call for +init when " +
          "violence starts. Objective: clear hostiles.",
      },
      {
        id: "grab",
        title: "The Crate",
        kind: "loot",
        scene:
          "The back bay is quieter. A sealed plastisteel crate " +
          "stamped with a Fixer glyph sits under a tarp. Sirens " +
          "somewhere distant — or getting closer.",
        onEnter:
          "Crate is the prize. Optional scavenge. Heat rises if " +
          "they linger.",
      },
      {
        id: "exfil",
        title: "Exfil",
        kind: "exfil",
        scene:
          "Night air and wet asphalt. The garage door yawns " +
          "behind you. Somewhere a bike engine coughs to life.",
        onEnter:
          "One last beat of pressure, then complete the run if " +
          "the crate objective is done.",
      },
    ],
    objectives: [
      {
        id: "clear-muscle",
        text: "Neutralize the Maelstrom muscle in the garage",
        auto: "threats_clear",
      },
      {
        id: "secure-crate",
        text: "Secure the sealed crate",
        auto: "manual",
      },
      {
        id: "exfil-clean",
        text: "Get the crew out of the hot zone",
        auto: "phase_reach",
      },
    ],
  },
  {
    id: "data-grab",
    title: "Satellite Office Data Grab",
    blurb: "Quiet breach. Copy the file. No alarms if you can help it.",
    brief:
      "A mid-tier corp satellite office holds a research shard. " +
      "The client wants a clean copy — no massacres if avoidable. " +
      "Netrunner preferred; muscle for when quiet fails.",
    payoutEb: 2000,
    heatMax: 8,
    roleHints: ["netrunner", "solo", "tech"],
    phases: [
      {
        id: "lobby",
        title: "Lobby",
        kind: "rp",
        scene:
          "Glass and badge scanners. A bored security solo at the " +
          "desk. Soft jazz, harder eyes on the cameras. After " +
          "hours — skeleton crew.",
        onEnter:
          "Social or stealth options. Heat if they go loud early.",
      },
      {
        id: "server",
        title: "Server closet",
        kind: "net",
        scene:
          "A humming rack closet. One chair, one jack, stale " +
          "recycled air. The architecture is small but mean.",
        onEnter:
          "Netrunners jack in (+netrun). Others watch the door. " +
          "If combat, spawn a guard.",
        spawn: ["security_officer"],
      },
      {
        id: "extract",
        title: "Extract",
        kind: "exfil",
        scene:
          "Elevator lights crawl. The lobby camera still watches. " +
          "Outside, Night City traffic is cover if you move now.",
        onEnter:
          "Complete when data objective is done and crew exits.",
      },
    ],
    objectives: [
      {
        id: "get-inside",
        text: "Get the team past the lobby",
        auto: "manual",
      },
      {
        id: "copy-data",
        text: "Copy the research shard (NET or physical)",
        auto: "manual",
      },
      {
        id: "leave",
        text: "Exfil without a total wipe",
        auto: "phase_reach",
      },
    ],
  },
  {
    id: "courier-wrong",
    title: "Courier Gone Wrong",
    blurb: "Simple drop. Then the guns come out.",
    brief:
      "Hand off a package in a Watson alley. Easy money — until " +
      "the other crew decides they want both package and pay.",
    payoutEb: 800,
    heatMax: 5,
    roleHints: ["solo", "fixer", "nomad"],
    phases: [
      {
        id: "meet",
        title: "The Meet",
        kind: "rp",
        scene:
          "A narrow alley behind a noodle stall. Steam, grease, " +
          "one flickering tube light. Your contact is late — or " +
          "already here in the dark.",
        onEnter: "Tension beat. Then the ambush.",
      },
      {
        id: "ambush",
        title: "Ambush",
        kind: "combat",
        scene:
          "Muzzle flash from the dumpster line. Someone wants the " +
          "package and does not care who bleeds for it.",
        spawn: ["boosterganger", "boosterganger", "boosterganger"],
        onEnter: "Fight. Package stays with the crew if they win.",
      },
      {
        id: "away",
        title: "Get Clear",
        kind: "exfil",
        scene:
          "Sirens far off. The alley smells like cordite and " +
          "burnt noodles. Time to vanish into traffic.",
        onEnter: "Short exfil; complete if crew still has the bag.",
      },
    ],
    objectives: [
      {
        id: "survive-ambush",
        text: "Survive the ambush",
        auto: "threats_clear",
      },
      {
        id: "keep-package",
        text: "Keep the package",
        auto: "manual",
      },
      {
        id: "extract",
        text: "Leave the alley alive",
        auto: "phase_reach",
      },
    ],
  },
];

export function getMissionPack(id: string): IMissionPack | undefined {
  const key = id.toLowerCase().trim();
  return MISSION_PACKS.find(
    (p) => p.id === key || p.id.startsWith(key),
  );
}

export function listMissionPackIds(): string[] {
  return MISSION_PACKS.map((p) => p.id);
}
