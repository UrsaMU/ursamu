// Chronicles of Darkness (CoFD) Supernatural Template Definitions
// Dynamically loads all template definitions from JSON files within the templates/ subdirectory.

export interface CofdTemplate {
  key: string;                 // e.g. "vampire"
  name: string;                // e.g. "Vampire: The Requiem"
  moralityName: string;        // e.g. "Humanity"
  powerStatName: string;       // e.g. "Blood Potency"
  energyName: string;          // e.g. "Vitae"
  customFields: string[];      // e.g. ["clan", "covenant"]
  validPowers: string[];       // list of lowercase power ratings
  energyMaxFormula: (powerStatValue: number) => number;
}

/**
 * Standard Chronicles of Darkness 2nd Edition Max Energy Pool lookup.
 * Applies to Vampire (Vitae), Werewolf (Essence), Mage (Mana), Changeling (Glamour), etc.
 */
export function getStandardMaxEnergy(powerStat: number): number {
  const ps = Math.max(0, Math.min(10, Math.floor(powerStat)));
  const table: Record<number, number> = {
    0: 0,
    1: 10,
    2: 11,
    3: 12,
    4: 13,
    5: 14,
    6: 15,
    7: 20,
    8: 30,
    9: 50,
    10: 100,
  };
  return table[ps] ?? 10;
}

export const COFD_TEMPLATES: Record<string, CofdTemplate> = {};

// Resolve the templates directory URL dynamically (walk up two levels to project root)
const templatesDirUrl = new URL("../../templates", import.meta.url);

// Synchronously scan the templates/ folder and load all JSON template definitions
for (const entry of Deno.readDirSync(templatesDirUrl)) {
  if (entry.isFile && entry.name.endsWith(".json")) {
    const fileUrl = new URL(`../../templates/${entry.name}`, import.meta.url);
    const fileContent = Deno.readTextFileSync(fileUrl);
    const data = JSON.parse(fileContent);

    COFD_TEMPLATES[data.key] = {
      key: data.key,
      name: data.name,
      moralityName: data.moralityName,
      powerStatName: data.powerStatName,
      energyName: data.energyName,
      customFields: data.customFields,
      validPowers: data.validPowers,
      energyMaxFormula: data.energyMaxFormulaType === "standard"
        ? getStandardMaxEnergy
        : () => 0,
    };
  }
}
