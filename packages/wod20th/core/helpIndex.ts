// core/helpIndex.ts -- LiberationMUSH-style +help index (two-column).
//
// Layout (78 cols, Latin-1 only):
//   ============== title ==============
//    Topics         Reference    | Topics         Reference
//   ==============  Section  ==============
//   TOPIC........ blurb          | TOPIC........ blurb
//   --------------------------------------
//   footer hint
//   ======================================

export const HELP_WIDTH = 78;
/** Half-row width before the " | " separator (38 + 3 + 37 = 78). */
const LEFT_W = 38;
const RIGHT_W = 37;
const SEP = " | ";
/** Topic name field inside a half-row (name + dots). */
const NAME_W = 14;

export interface IHelpTopicRef {
  /** Lookup slug (matches help/<slug>.md, no extension). */
  topic: string;
  /** Short reference blurb (Latin-1). */
  blurb: string;
  /** Optional display label (defaults to topic uppercased). */
  label?: string;
}

export interface IHelpCategory {
  /** Section banner label. */
  name: string;
  topics: readonly IHelpTopicRef[];
}

/**
 * Full wod20th topic catalog for +help index.
 * Order is presentation order; keep blurbs short.
 */
export const HELP_CATALOG: readonly IHelpCategory[] = [
  {
    name: "Overview",
    topics: [
      { topic: "vtm", blurb: "Vampire night loop" },
      { topic: "chargen", blurb: "Character generation" },
      { topic: "sheet", blurb: "View character sheet" },
      { topic: "xp", blurb: "Spend and track XP" },
      { topic: "roll", blurb: "Dice pool rolls" },
      { topic: "rolling", blurb: "Rolling overview" },
      { topic: "stat", blurb: "Staff set/view stats" },
      { topic: "notes", blurb: "Character notes" },
    ],
  },
  {
    name: "Vampire (VtM)",
    topics: [
      { topic: "blood", blurb: "Vitae pool, heal, buff" },
      { topic: "feed", blurb: "Vessels and Herd" },
      { topic: "discipline", blurb: "L1-5 powers" },
      { topic: "beast", blurb: "Frenzy and Roetschreck" },
      { topic: "hazard", blurb: "Fire and sunlight" },
      { topic: "humanity", blurb: "Paths and sins" },
      { topic: "bond", blurb: "Blood bonds 1-3" },
      { topic: "embrace", blurb: "Create neonates" },
      { topic: "ghoul", blurb: "Vitae thralls" },
      { topic: "diablerie", blurb: "Amaranth" },
      { topic: "derange", blurb: "Derangements" },
      { topic: "stake", blurb: "Heart-stake" },
      { topic: "torpor", blurb: "Death-sleep" },
      { topic: "coterie", blurb: "Kindred bands" },
      { topic: "domain", blurb: "City offices" },
      { topic: "boon", blurb: "Favors and debts" },
    ],
  },
  {
    name: "Werewolf (WtA)",
    topics: [
      { topic: "pack", blurb: "Pack and totems" },
      { topic: "sept", blurb: "Sept membership" },
      { topic: "caern", blurb: "Caern nodes" },
      { topic: "moot", blurb: "Sept moots" },
      { topic: "litany", blurb: "Litany of the Garou" },
      { topic: "gift", blurb: "Use gifts" },
      { topic: "combo", blurb: "Combo gifts" },
      { topic: "rite", blurb: "Rites" },
      { topic: "shift", blurb: "Form shifting" },
      { topic: "frenzy", blurb: "Rage frenzy" },
      { topic: "rage", blurb: "Rage pool" },
      { topic: "gnosis", blurb: "Gnosis pool" },
      { topic: "renown", blurb: "Renown and rank" },
      { topic: "scar", blurb: "Battle scars" },
      { topic: "title", blurb: "Garou titles" },
      { topic: "stepside", blurb: "Step sideways" },
      { topic: "realm", blurb: "Umbral realms" },
      { topic: "spirit", blurb: "Spirit catalog" },
      {
        topic: "spirit-interact",
        label: "SPIRIT-USE",
        blurb: "Spirit interaction",
      },
      { topic: "fetish", blurb: "Fetishes" },
    ],
  },
  {
    name: "Combat",
    topics: [
      { topic: "attack", blurb: "Resolve attacks" },
      { topic: "defend", blurb: "Defense options" },
      { topic: "init", blurb: "Initiative" },
      { topic: "split", blurb: "Split actions" },
      { topic: "hurt", blurb: "Apply damage" },
      { topic: "heal", blurb: "Heal damage" },
      { topic: "regen", blurb: "Garou regeneration" },
      { topic: "challenge", blurb: "Formal challenges" },
      {
        topic: "challenge-combat",
        label: "CHAL-COMBAT",
        blurb: "Challenge combat",
      },
    ],
  },
  {
    name: "Equipment & Look",
    topics: [
      { topic: "eq", blurb: "Equipment attrs" },
      { topic: "wear", blurb: "Wear gear" },
      { topic: "wield", blurb: "Wield weapons" },
      { topic: "conceal", blurb: "Conceal items" },
      { topic: "spot", blurb: "Spot concealed" },
      { topic: "look", blurb: "Look / room list" },
      { topic: "desc", blurb: "Descriptions" },
      { topic: "moniker", blurb: "IC moniker" },
      { topic: "deedname", blurb: "Deed name" },
      { topic: "background", blurb: "Backgrounds" },
    ],
  },
  {
    name: "Social & Staff",
    topics: [
      { topic: "vote", blurb: "RP votes" },
      { topic: "npc", blurb: "NPC bestiary" },
      { topic: "moot-phases", blurb: "Moot phase detail" },
    ],
  },
];

/** Center `label` in a full-width = rule (Liberation section banner). */
export function sectionBanner(label: string, width = HELP_WIDTH): string {
  const name = `  ${label}  `;
  if (name.length >= width) return name.slice(0, width);
  const pad = width - name.length;
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return "=".repeat(left) + name + "=".repeat(right);
}

/** Full-width rule of `ch`. */
export function rule(ch = "=", width = HELP_WIDTH): string {
  return ch.repeat(width);
}

/**
 * One half-row: TOPIC........ blurb (padded/truncated to halfW).
 */
export function formatHalf(
  topic: IHelpTopicRef,
  halfW: number,
): string {
  const raw = (topic.label ?? topic.topic).toUpperCase().replace(
    /\s+/g,
    " ",
  );
  const name = raw.length > NAME_W ? raw.slice(0, NAME_W) : raw;
  const dots = Math.max(1, NAME_W - name.length);
  const head = name + ".".repeat(dots);
  const room = halfW - head.length - 1;
  let blurb = topic.blurb.trim();
  if (room < 1) return head.slice(0, halfW).padEnd(halfW);
  if (blurb.length > room) blurb = blurb.slice(0, room);
  return (head + " " + blurb).padEnd(halfW).slice(0, halfW);
}

/** Pair topics into "left | right" rows. */
export function formatTopicRows(
  topics: readonly IHelpTopicRef[],
): string[] {
  const rows: string[] = [];
  for (let i = 0; i < topics.length; i += 2) {
    const left = formatHalf(topics[i], LEFT_W);
    const right = topics[i + 1]
      ? formatHalf(topics[i + 1], RIGHT_W)
      : " ".repeat(RIGHT_W);
    rows.push(left + SEP + right);
  }
  return rows;
}

/** Column header row matching Liberation "Topics / Reference". */
export function columnHeader(): string {
  const left = "Topics".padEnd(NAME_W) + " Reference".padEnd(
    LEFT_W - NAME_W,
  );
  const right = "Topics".padEnd(NAME_W) + " Reference".padEnd(
    RIGHT_W - NAME_W,
  );
  return (left.slice(0, LEFT_W) + SEP + right.slice(0, RIGHT_W)).slice(
    0,
    HELP_WIDTH,
  );
}

/**
 * Render full Liberation-style index.
 * Returns lines joined by %r for MUSH send.
 */
export function renderHelpIndex(
  title = "wod20th +help",
  catalog: readonly IHelpCategory[] = HELP_CATALOG,
): string {
  const lines: string[] = [];
  // Centered title in = rule
  lines.push(sectionBanner(title));
  lines.push(columnHeader());
  for (const cat of catalog) {
    lines.push(sectionBanner(cat.name));
    lines.push(...formatTopicRows(cat.topics));
  }
  lines.push(rule("-"));
  lines.push(
    "For help, type '+help <topic>' where topic is one of the topics above.",
  );
  lines.push(rule("="));
  return lines.join("%r");
}

/** Flatten catalog to topic -> blurb map. */
export function allTopics(
  catalog: readonly IHelpCategory[] = HELP_CATALOG,
): IHelpTopicRef[] {
  const out: IHelpTopicRef[] = [];
  for (const c of catalog) out.push(...c.topics);
  return out;
}

/**
 * Resolve a player-typed topic to a catalog slug.
 * Accepts +blood, blood, BLOOD, wod20th/blood, etc.
 */
export function resolveTopicSlug(raw: string): string | null {
  let q = raw.toLowerCase().trim();
  if (!q) return null;
  q = q.replace(/^\+/, "");
  q = q.replace(/^help\s+/, "");
  q = q.replace(/^wod20th\//, "");
  q = q.replace(/\s+/g, "-");
  // Direct match
  const all = allTopics();
  const hit = all.find(
    (t) =>
      t.topic === q ||
      t.topic.replace(/-/g, "") === q.replace(/-/g, "") ||
      (t.label && t.label.toLowerCase() === q),
  );
  if (hit) return hit.topic;
  // Prefix match (unique)
  const prefs = all.filter(
    (t) => t.topic.startsWith(q) || t.topic.startsWith(q + "-"),
  );
  if (prefs.length === 1) return prefs[0].topic;
  return q; // allow free-form help/<q>.md even if not in catalog
}

/** Categories that contain a topic (for SEE ALSO hints). */
export function categoryForTopic(topic: string): string | null {
  const q = topic.toLowerCase();
  for (const c of HELP_CATALOG) {
    if (c.topics.some((t) => t.topic === q)) return c.name;
  }
  return null;
}
