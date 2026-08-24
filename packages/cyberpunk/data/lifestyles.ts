/**
 * Cyberpunk RED — Lifestyle Tiers and Monthly Costs
 */
export interface ILifestyleDef {
  name: string;
  displayName: string;
  monthlyCostEb: number;
  description: string;
  housing: string;
  food: string;
  freeFirstMonth: boolean;
}

export const LIFESTYLES: ILifestyleDef[] = [
  {
    name: "kibble",
    displayName: "Kibble",
    monthlyCostEb: 100,
    description: "Rock bottom. Eating from vending machines and sleeping in doorways.",
    housing: "Squatting in Combat Zone ruins or flophouses.",
    food: "Kibble Product #19 and recycled protein paste.",
    freeFirstMonth: true,
  },
  {
    name: "generic_prepak",
    displayName: "Generic Prepak",
    monthlyCostEb: 300,
    description: "Bare necessities. Generic prepak meals and a coffin hotel bunk.",
    housing: "Coffin hotel or shared flophouse room.",
    food: "Generic prepak rations.",
    freeFirstMonth: false,
  },
  {
    name: "streetrat",
    displayName: "Streetrat",
    monthlyCostEb: 500,
    description: "Life on the edge. Crowded Overcrowded Suburbs, minimal comfort.",
    housing: "Crammed apartment in Overcrowded Suburbs or Combat Zone fringe.",
    food: "Cheap prepak meals; occasional real food.",
    freeFirstMonth: false,
  },
  {
    name: "good_prepak",
    displayName: "Good Prepak",
    monthlyCostEb: 600,
    description: "Comfortable working-class life. First month free for some roles.",
    housing: "Decent apartment in the middle rings of Night City.",
    food: "Good prepak meals with occasional restaurant dining.",
    freeFirstMonth: true,
  },
  {
    name: "fresh_food",
    displayName: "Fresh Food",
    monthlyCostEb: 1500,
    description: "Real food and a real apartment. Living like a human being.",
    housing: "Comfortable apartment in a secure district.",
    food: "Fresh food, real meat, restaurant dining.",
    freeFirstMonth: false,
  },
  {
    name: "moderate",
    displayName: "Moderate",
    monthlyCostEb: 1200,
    description: "Middle-class comfort. A real home, decent food, entertainment.",
    housing: "Conapt in a safe-ish neighborhood.",
    food: "Regular restaurant meals and delivery.",
    freeFirstMonth: false,
  },
  {
    name: "corporate",
    displayName: "Corporate",
    monthlyCostEb: 3000,
    description: "Corporate professional lifestyle. Luxury apartments, nice clothes.",
    housing: "Corporate housing block or high-security apartment.",
    food: "Restaurants, delivery services, personal chef occasionally.",
    freeFirstMonth: false,
  },
  {
    name: "luxury",
    displayName: "Luxury",
    monthlyCostEb: 10000,
    description: "The high life. Private residence, staff, the best of everything.",
    housing: "Private house, penthouse, or corporate tower suite.",
    food: "Personal chef, exotic imports, whatever you want.",
    freeFirstMonth: false,
  },
];

export const getLifestyle = (name: string): ILifestyleDef | undefined =>
  LIFESTYLES.find((l) => l.name === name.toLowerCase().replace(/[\s\-]/g, "_"));

/** Lifestyle tier index (lower = poorer). */
export const lifestyleTierIndex = (name: string): number =>
  LIFESTYLES.findIndex((l) => l.name === name.toLowerCase().replace(/[\s\-]/g, "_"));

/** One month in milliseconds for lifestyle due date calculation. */
export const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/** Role-specific free first month tiers. */
export const FREE_FIRST_MONTH_ROLES: Record<string, string[]> = {
  exec: ["corporate"],            // Corp pays for exec housing
  lawman: ["moderate"],           // Department housing
  rockerboy: ["good_prepak"],
  solo: ["good_prepak"],
  netrunner: ["good_prepak"],
  medtech: ["good_prepak"],
  tech: ["good_prepak"],
  media: ["good_prepak"],
  fixer: ["good_prepak"],
  nomad: ["kibble"],
};
