import type { IGameSystem } from "./interface.ts";
import type { ICharSheet } from "../context/loader.ts";

export const genericSystem: IGameSystem = {
  id: "generic",
  name: "Generic Narrative",
  version: "1.0.0",
  source: "bundled",

  coreRulesPrompt:
    "This is a rules-light, system-agnostic narrative game (ideal for freeform RP, CYOA, and custom stories). " +
    "Adjudicate actions based on narrative logic, player choices, and character descriptions. " +
    "No specific dice mechanics or stats are enforced unless defined on the character sheet.",

  moveThresholds: {
    fullSuccess: 10,
    partialSuccess: 7,
  },

  stats: [],

  getCategories: () => [],
  getStats: () => [],
  getStat: (actor: Record<string, unknown>, stat: string) => {
    return actor[stat.toLowerCase()] ?? 0;
  },
  setStat: (actor: Record<string, unknown>, stat: string, value: unknown) => {
    actor[stat.toLowerCase()] = value;
    return Promise.resolve();
  },
  validate: (_stat: string, _value: unknown) => true,

  formatMoveResult(
    moveName: string,
    stat: string,
    total: number,
    roll: [number, number],
  ): string {
    const [d1, d2] = roll;
    if (d1 === 0 && d2 === 0) {
      return `Action: ${moveName} (Narrative Choice Adjudication)`;
    }
    const outcome = total >= 10
      ? "Success"
      : total >= 7
      ? "Partial Success"
      : "Miss";
    return `Action: ${moveName} (Roll: 2d6+${stat} [${d1}+${d2}] = ${total}) — ${outcome}`;
  },

  formatCharacterContext(sheet: ICharSheet): string {
    const name = sheet.name ?? "Unknown Character";
    const attributes = Object.entries(sheet)
      .filter(([k]) => !["id", "name", "type", "playerId"].includes(k))
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n");
    return `Character: ${name}\n${attributes}`;
  },

  adjudicationHint:
    "Prioritize narrative consistency and player choices. Let players describe their actions, then describe the realistic outcome or present them with meaningful paths/choices.",

  hardMoves: [
    "Introduce a new complication or threat",
    "Consume or damage their resources/equipment",
    "Turn their move back on them",
    "Put someone in a spot/jeopardy",
  ],

  softMoves: [
    "Reveal a new choice or path",
    "Offer an opportunity, with or without a cost",
    "Show signs of an approaching threat",
    "Ask what they want to do next",
  ],

  missConsequenceHint:
    "On a failure, describe how the situation escalates or how their choices lead to a setback, presenting new choices.",
};
