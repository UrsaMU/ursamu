// splats/vtm/data/magicPaths.ts -- Thaumaturgy & Necromancy path catalog.
//
// Blood-magic schools use paths: the caster's primary path always equals
// her school rating (V20 p.212); secondary paths are bought separately
// (V20 p.124: new 7 XP, raise current x4) and stored on the character as
// disciplines["<Path Name>"]. Thaumaturgical Countermagic is a separate
// Discipline in V20 and lives in VTM_DISCIPLINES, not here.

export type MagicSchool = "thaumaturgy" | "necromancy";

export interface IMagicPathDef {
  id: string;
  name: string;
  school: MagicSchool;
  /** Usual primary path for the school (informational). */
  commonPrimary?: boolean;
  book: string;
  blurb: string;
}

function mp(
  school: MagicSchool,
  name: string,
  book: string,
  blurb: string,
  commonPrimary = false,
): IMagicPathDef {
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    name,
    school,
    commonPrimary,
    book,
    blurb,
  };
}

// -- Thaumaturgy paths (V20 p.212-230) --------------------------------------
// Path of Blood is the assumed primary for Tremere (V20 p.213).
export const THAUMATURGY_PATHS: readonly IMagicPathDef[] = [
  mp("thaumaturgy", "Path of Blood", "V20 p.213",
    "Manipulation of Kindred vitae; the default Tremere primary.",
    true),
  mp("thaumaturgy", "Elemental Mastery", "V20 p.214",
    "Communion with and control of inanimate matter and elemental spirits."),
  mp("thaumaturgy", "The Green Path", "V20 p.215",
    "Manipulation of plant matter, living or dead."),
  mp("thaumaturgy", "Hands of Destruction", "V20 p.217",
    "Decay, corrosion, and ruin; favored by Sabbat thaumaturges."),
  mp("thaumaturgy", "The Lure of Flames", "V20 p.218",
    "Conjure mystical fire; feared for good reason."),
  mp("thaumaturgy", "Neptune's Might", "V20 p.218",
    "Manipulation of standing water; dehydrate foes at mastery."),
  mp("thaumaturgy", "Movement of the Mind", "V20 p.220",
    "Telekinesis through blood magic; flight at mastery."),
  mp("thaumaturgy", "The Path of Conjuring", "V20 p.220",
    "Summon objects -- and at mastery, simulacra -- from thin air."),
  mp("thaumaturgy", "The Path of Corruption", "V20 p.221",
    "Twist victims' thoughts, desires, and loyalties."),
  mp("thaumaturgy", "The Path of Mars", "V20 p.224",
    "Martial blood magic of the Sabbat war-casters."),
  mp("thaumaturgy", "The Path of Technomancy", "V20 p.224",
    "Control and destruction of electronic devices."),
  mp("thaumaturgy", "The Path of the Father's Vengeance", "V20 p.226",
    "Curses from the Book of Nod, visited on Cainites alone."),
  mp("thaumaturgy", "Weather Control", "V20 p.228",
    "Fog, storms, and lightning; subtle at first, catastrophic at mastery."),
];

// -- Necromancy paths (V20 p.159-177) ---------------------------------------
// Sepulchre is the assumed primary (V20 p.159). The Corpse in the Monster,
// the Grave's Decay, and the Path of the Four Humors are the old Mortis
// paths, listed as Necromancy paths (V20 p.168).
export const NECROMANCY_PATHS: readonly IMagicPathDef[] = [
  mp("necromancy", "Sepulchre Path", "V20 p.160",
    "Witness, summon, and command the spirits of the dead.",
    true),
  mp("necromancy", "The Ash Path", "V20 p.163",
    "Peer into and physically enter the Underworld."),
  mp("necromancy", "The Bone Path", "V20 p.164",
    "Animate corpses; zombies and shambling hordes."),
  mp("necromancy", "The Cenotaph Path", "V20 p.166",
    "Discover and forge fetters linking the living and the dead."),
  mp("necromancy", "The Corpse in the Monster", "V20 p.168",
    "Mortis: take on the traits of the corpse -- or inflict them."),
  mp("necromancy", "The Grave's Decay", "V20 p.171",
    "Mortis: channel the force of decay itself."),
  mp("necromancy", "Path of the Four Humors", "V20 p.173",
    "Mortis: tap the four humors beyond mere vitae."),
  mp("necromancy", "Vitreous Path", "V20 p.174",
    "Nihilistics: manipulate the energies of entropy and death."),
];

export const ALL_MAGIC_PATHS: readonly IMagicPathDef[] = [
  ...THAUMATURGY_PATHS,
  ...NECROMANCY_PATHS,
];

export function getMagicPath(idOrName: string): IMagicPathDef | undefined {
  const q = idOrName.toLowerCase().trim();
  return ALL_MAGIC_PATHS.find(
    (p) =>
      p.id === q ||
      p.name.toLowerCase() === q ||
      p.name.toLowerCase().includes(q) ||
      p.id.replace(/-/g, " ") === q,
  );
}

export function pathsForSchool(school: MagicSchool): IMagicPathDef[] {
  return ALL_MAGIC_PATHS.filter((p) => p.school === school);
}

/** Default primary path when a character first learns the school. */
export function defaultPrimaryPath(school: MagicSchool): string {
  return school === "thaumaturgy" ? "Path of Blood" : "Sepulchre Path";
}
