/**
 * tools/extract_merits.ts
 *
 * Extracts merit names + dot ratings from books/cofd.txt and prints a JSON array
 * compatible with resources/merits.json schema.
 *
 * Usage:
 *   deno run -A tools/extract_merits.ts > resources/merits_extracted.json
 */

const text = await Deno.readTextFile("./books/cofd.txt");

// Known-false positives to skip (abbreviations, chapter headers, etc.)
const SKIP = new Set([
  "Style",
  "Prerequisite",
  "Effect",
  "Note",
  "Optional",
  "New Merit",
  "Drawback",
  "Exceptional Success",
  "Action",
  "Roll",
  "Cost",
  "Duration",
  "Story",
  "Sample",
  "For Example",
  "Dramatic Failure",
  "Failure",
  "Success",
]);

// Merit categories by keyword — rough heuristic
const _CATEGORY_MAP: Record<string, string> = {
  "Mental": "Mental",
  "Physical": "Physical",
  "Social": "Social",
  "Fighting": "Fighting Style",
  "Supernatural": "Supernatural",
};

// Known category assignments for common merits
const KNOWN_CATEGORIES: Record<string, string> = {
  "Eidetic Memory": "Mental",
  "Encyclopedic Knowledge": "Mental",
  "Area of Expertise": "Mental",
  "Eye for the Strange": "Mental",
  "Common Sense": "Mental",
  "Fast Reflexes": "Physical",
  "Danger Sense": "Mental",
  "Good Time Management": "Mental",
  "Direction Sense": "Mental",
  "Holistic Awareness": "Physical",
  "Investigative Aide": "Mental",
  "Indomitable": "Mental",
  "Investigative Prodigy": "Mental",
  "Interdisciplinary Specialty": "Mental",
  "Language": "Mental",
  "Library": "Mental",
  "Meditative Mind": "Mental",
  "Tolerance for Biology": "Mental",
  "Multilingual": "Mental",
  "Trained Observer": "Mental",
  "Patient": "Mental",
  "Professional Training": "Mental",
  "Vice-Ridden": "Social",
  "Virtuous": "Social",
  "Ambidextrous": "Physical",
  "Anonymity": "Social",
  "Brawling Dodge": "Physical",
  "Contacts": "Social",
  "Defender": "Social",
  "Disarm": "Physical",
  "Etiquette": "Social",
  "Fame": "Social",
  "Fixer": "Social",
  "Fleet of Foot": "Physical",
  "Freshet": "Social",
  "Giant": "Physical",
  "Hardy": "Physical",
  "Inspiring": "Social",
  "Iron Stamina": "Physical",
  "Iron Stomach": "Physical",
  "Mentor": "Social",
  "Resources": "Social",
  "Safehouse": "Social",
  "Status": "Social",
  "Striking Looks": "Social",
  "Stunt Driver": "Physical",
  "Toxin Resistance": "Physical",
  "Unseen Sense": "Supernatural",
  "Weaponry Dodge": "Physical",
  "Allies": "Social",
  "Barfly": "Social",
  "Bureaucratic Navigator": "Social",
  "Friends and Favors": "Social",
  "Fence": "Social",
  "Pusher": "Social",
  "Sworn Officer": "Social",
  "True Friend": "Social",
  "Firefighter": "Physical",
  "Greyhound": "Physical",
  "Quick Draw": "Physical",
  "Sleepwalker": "Supernatural",
  "Strong Back": "Physical",
  "Strong Lungs": "Physical",
  "Crack Driver": "Physical",
  "Breath Control": "Physical",
  "Parkour": "Physical",
  "Streetfighter": "Fighting Style",
  "Two Weapons": "Fighting Style",
  "Knife Fighting": "Fighting Style",
  "Spear and Shield": "Fighting Style",
  "Grappling": "Fighting Style",
  "Centering": "Fighting Style",
  "Kung Fu": "Fighting Style",
  "Boxing": "Fighting Style",
  "Shield Bearer": "Fighting Style",
  "Bow and Arrow": "Fighting Style",
  "Krav Maga": "Fighting Style",
  "Aggressive Driving": "Fighting Style",
  "K-9": "Fighting Style",
  "Mounted Combat": "Fighting Style",
  "Pistol-Whip": "Fighting Style",
  "Police Tactics": "Fighting Style",
  "Marksmanship": "Fighting Style",
  "Tactical Reload": "Fighting Style",
  "Close Quarters Combat": "Fighting Style",
  "Firefight": "Fighting Style",
};

/** Parse dot strings like "•", "•• to ••••", "•, ••, or ••••" into int arrays */
function parseDots(dotsStr: string): number[] {
  const counts = [...dotsStr.matchAll(/•+/g)].map((m) => m[0].length);
  if (counts.length === 2 && dotsStr.includes("to")) {
    // range: e.g. "• to •••"
    const [min, max] = counts;
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  }
  return [...new Set(counts)].sort((a, b) => a - b);
}

/** Convert merit name to a lookup key */
function toKey(name: string) {
  return name.toLowerCase().trim();
}

// Match: Name (dots) — must start with capital, no newline in name
const meritRegex =
  /^([A-Z][A-Za-z '-]{2,48}?)\s*\(((?:[•\s,]+|to|or)+?)(?:,\s*Style)?\)/gm;

const seen = new Map<string, { name: string; dotsStr: string }>();

let m;
while ((m = meritRegex.exec(text)) !== null) {
  const name = m[1].trim();
  const dotsStr = m[2].trim();

  // must contain at least one bullet
  if (!dotsStr.includes("•")) continue;
  // skip false positives
  if (SKIP.has(name)) continue;
  // skip if we already have this key (keep first occurrence)
  const key = toKey(name);
  if (!seen.has(key)) {
    seen.set(key, { name, dotsStr });
  }
}

const merits = [];
for (const [key, { name, dotsStr }] of seen) {
  const allowedDots = parseDots(dotsStr);
  const category = KNOWN_CATEGORIES[name] ?? "Mental";
  merits.push({
    key,
    name,
    category,
    allowedDots,
    prereqs: [] as string[],
  });
}

// Sort by category then name
merits.sort((a, b) =>
  a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
);

console.log(JSON.stringify(merits, null, 2));
console.error(`\nExtracted ${merits.length} unique merits.`);
