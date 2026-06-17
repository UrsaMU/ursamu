import type { IMektonChar, ILifepathSibling, ILifepathFriend, ILifepathEnemy, IRomance } from "./schema.ts";

function d10(): number { return Math.ceil(Math.random() * 10); }
function d6():  number { return Math.ceil(Math.random() * 6); }

// ── Chart A1: Social Status ────────────────────────────────────────────────────
const SOCIAL_STATUS: Record<number, { label: string; cash: number }> = {
  1:  { label: "Slave/Poor",                  cash: 200 },
  2:  { label: "Servant/Poor",                cash: 300 },
  3:  { label: "Laborer/Lower Middle Class",  cash: 400 },
  4:  { label: "Worker/Lower Middle Class",   cash: 500 },
  5:  { label: "Worker/Middle Class",         cash: 600 },
  6:  { label: "Worker/Middle Class",         cash: 600 },
  7:  { label: "Executive/Middle Class",      cash: 700 },
  8:  { label: "Vice Pres/Upper Middle Class",cash: 800 },
  9:  { label: "Noble/Wealthy",               cash: 900 },
  10: { label: "High Noble/Wealthy",          cash: 1000 },
};

const PARENT_FATE: Record<number, string> = {
  1: "Your parent(s) died in the war.",
  2: "Your parent(s) died in an accident.",
  3: "Your parent(s) were murdered.",
  4: "Your parent(s) have amnesia and don't remember you.",
  5: "You never knew your parents.",
  6: "Your parent(s) are missing.",
  7: "Your parents are in hiding to protect you.",
  8: "Your parent(s) defected to the other side.",
  9: "You were raised by other relatives.",
  10: "You grew up on the streets.",
};

const PARENTAL_MYSTERY: Record<number, string> = {
  1: "Both parents are really deep cover spies for the other side.",
  2: "Both parents are deep cover spies for the other side.",
  3: "Your parents were involved in a top secret military project and are on the run.",
  4: "Your parents were involved in a top secret military project and are on the run.",
  5: "Your parents will simply no longer have anything to do with you.",
  6: "Your parents will simply no longer have anything to do with you.",
  7: "Your parents both simply vanished. Their house was left empty.",
  8: "Your parents both simply vanished. Their house was left empty.",
  9: "Your parents are spies living in the enemy's country.",
  10: "Your parents are spies living in the enemy's country.",
};

const FAMILY_CRISIS: Record<number, string> = {
  1: "Family lost all titles and lands through betrayal of a family member.",
  2: "Family lost all titles and lands through bad management.",
  3: "Family was exiled from homeland; you have returned under an alias.",
  4: "Family was imprisoned, and you alone escaped.",
  5: "Family vanished, and you are the only remaining member.",
  6: "Family was murdered and you alone survived.",
  7: "Family lost everything when fortunes collapsed; they live homeless.",
  8: "Family has vanished.",
  9: "Family was lost in the war.",
  10: "Family was destroyed in an accident. Those not crippled were killed.",
};

const FAMILIAL_GOAL: Record<number, string> = {
  1: "Clear your name.", 2: "Clear your name.",
  3: "Live it down and forget it.", 4: "Live it down and forget it.",
  5: "Hunt them down and make them pay!", 6: "Hunt them down and make them pay!",
  7: "Get what's rightfully yours.", 8: "Get what's rightfully yours.",
  9: "Save, if possible, your remaining family.", 10: "Save, if possible, your remaining family.",
};

const FRIEND_TYPES: Record<number, string> = {
  1: "an old school pal",       2: "an old school pal",
  3: "someone who grew up with you", 4: "a teacher or mentor",
  5: "an ex-lover",             6: "like a younger brother/sister to you",
  7: "like a foster parent to you", 8: "like a big brother/sister to you",
  9: "a partner or co-worker",  10: "a partner or co-worker",
};

const ENEMY_TYPES: Record<number, string> = {
  1: "an old friend", 2: "an old friend", 3: "an old friend", 4: "an old friend",
  5: "a relative", 6: "an official in the government",
  7: "a stranger to you", 8: "an ex-lover",
  9: "someone on the other side", 10: "someone on the other side",
};

const ENEMY_CAUSE: Record<number, string> = {
  1: "they caused the death of your loved one",
  2: "you caused the death of their loved one",
  3: "one caused the other a major humiliation",
  4: "one caused the other a physical disability",
  5: "one deserted or betrayed the other",
  6: "one caused the other imprisonment or exile",
  7: "you were romantic rivals",
  8: "one foiled a plan of the other",
  9: "it's a mystery to you", 10: "it's a mystery to you",
};

const ENEMY_WHO: Record<number, "them" | "you" | "mutual"> = {
  1: "them", 2: "them", 3: "them", 4: "them",
  5: "you", 6: "you", 7: "you",
  8: "mutual", 9: "mutual", 10: "mutual",
};

const ENEMY_REACTION: Record<number, string> = {
  1: "go into a rage and try to kill", 2: "go into a rage and try to kill",
  3: "avoid the other person", 4: "avoid the other person",
  5: "cause injury in an indirect way", 6: "cause injury in an indirect way",
  7: "ignore the other person", 8: "ignore the other person",
  9: "verbally attack the other person", 10: "verbally attack the other person",
};

// Appearance charts
export const HAIR_COLORS = ["Red", "Blue", "Green", "Blonde", "Black", "Black", "Orange", "Purple", "Silver/White", "Brown"];
export const HAIR_STYLES = ["Neat", "Long, straight", "Short, w/ bangs", "Swept over one eye", "Short, straight", "Short, straight", "Long, curly", "Long w/ bangs", "Short, curly", "Wild"];
export const EYE_COLORS  = ["Blue", "Green", "Silver/Grey", "Ruby", "Brown/Black", "Brown/Black", "Amber", "Gold", "Violet", "Always changing"];
export const PERSONALITY_TRAITS = ["Shy & secretive", "Angst-ridden, antisocial, violent", "Arrogant, proud & aloof", "Moody, rash & headstrong", "Friendly, outgoing", "Picky, fussy, nervous", "Stable & serious", "Silly & fluffheaded", "Sneaky & deceptive", "Intellectual, detached"];
export const VALUES_MOST = ["Money", "Honor", "Your word", "Honesty", "Knowledge", "Vengeance", "Love", "Power", "Having a good time", "Friendship"];
export const VALUED_POSSESSIONS = ["A weapon", "A tool", "A piece of clothing", "A photograph", "A book or diary", "A recording", "A musical instrument", "A piece of jewelry", "A toy", "A letter"];
export const VALUED_PERSONS = ["A parent", "A brother or sister", "A lover", "A friend", "Yourself", "A pet", "A teacher or mentor", "A public figure", "A personal hero", "No one"];

// Professional lifepath events
export const WINDFALL_EVENTS: Record<number, string> = {
  1: "Favor: someone in power owes you a big favor.",
  2: "Favor: someone in power owes you a big favor.",
  3: "Extra cash: +¥100 equipment bonus.",
  4: "Extra cash: +¥100 equipment bonus.",
  5: "New contact in your current profession.",
  6: "New contact in your current profession.",
  7: "Black market access: hot equipment at half price.",
  8: "Black market access: hot equipment at half price.",
  9: "Vital clue discovered about your past.",
  10: "Vital clue discovered about your past.",
};

export const ACCIDENT_EVENTS: Record<number, { label: string; stat?: "att" | "ref"; delta?: number }> = {
  1: { label: "Lost your job. Only 3 skill points this term." },
  2: { label: "Blacklisted! -2 to all social dealings with this profession." },
  3: { label: "Financial ruin! All starting cash lost." },
  4: { label: "Lost a loved one. (Referee chooses who.)" },
  5: { label: "Implicated in company collapse. Cannot take this profession again." },
  6: { label: "Blamed for an accident that hurt/killed another." },
  7: { label: "Caused an accident that killed others. Pick up an enemy." },
  8: { label: "Disfiguring accident. Lose 1D6 ATT.", stat: "att", delta: -3 },
  9: { label: "Bad accident. Lose 1 REF.",            stat: "ref", delta: -1 },
  10: { label: "Horrible accident. Lose 2 REF; limb replaced with artificial parts.", stat: "ref", delta: -2 },
};

/** Auto-roll all basic lifepath charts (A1–I) and store on the character. */
export function rollBasicLifepath(): Partial<IMektonChar["lifepath"]> {
  const socialRoll = d10();
  const ss = SOCIAL_STATUS[socialRoll];

  // A2: parent fate
  const a2 = d10();
  let parentStatus: string;
  if (a2 <= 4) {
    parentStatus = PARENT_FATE[d10()];
  } else if (a2 <= 9) {
    parentStatus = "Both parents alive and well.";
  } else {
    parentStatus = PARENTAL_MYSTERY[d10()];
  }

  // B: family standing
  const bRoll = d10();
  const familyStanding: "good" | "bad" = bRoll <= 6 ? "good" : "bad";
  let familyCrisis: string | undefined;
  let familialGoal: string | undefined;
  if (familyStanding === "bad") {
    familyCrisis = FAMILY_CRISIS[d10()];
    familialGoal = FAMILIAL_GOAL[d10()];
  }

  // E: siblings (1D10, 8-10 = only child)
  const sibCount = d10();
  const siblings: ILifepathSibling[] = [];
  if (sibCount <= 7) {
    for (let i = 0; i < sibCount; i++) {
      const ageRoll = d10();
      siblings.push({
        gender: d10() % 2 === 0 ? "female" : "male",
        relativeAge: ageRoll <= 5 ? "older" : ageRoll <= 9 ? "younger" : "twin",
        feeling: (["dislikes", "dislikes", "likes", "likes", "neutral", "neutral", "hero-worships", "hero-worships", "hates", "hates"] as ILifepathSibling["feeling"][])[d10() - 1],
      });
    }
  }

  // F: friends (1D6)
  const friendCount = d6();
  const friends: ILifepathFriend[] = [];
  for (let i = 0; i < friendCount; i++) {
    friends.push({ gender: d10() % 2 === 0 ? "female" : "male", type: FRIEND_TYPES[d10()] });
  }

  // G: enemy (on 10)
  const enemies: ILifepathEnemy[] = [];
  if (d10() === 10) {
    enemies.push({
      type: ENEMY_TYPES[d10()],
      causeOfHatred: ENEMY_CAUSE[d10()],
      whoHates: ENEMY_WHO[d10()],
      reaction: ENEMY_REACTION[d10()],
    });
  }

  // H: romance
  const hRoll = d10();
  let romance: IRomance | null = null;
  if (hRoll <= 3) {
    romance = { status: "involved", detail: `Roll H1: ${["lover's family hates you", "your family hates lover", "romantic rival", "separated", "constant fights", "jealousy", "suspected infidelity", "going smoothly"][d10() <= 8 ? d10() - 1 : 7]}` };
  } else if (hRoll <= 7) {
    romance = { status: "uninvolved", detail: "" };
  } else {
    romance = { status: "recovering", detail: ["killed in military action", "killed in accident", "mysteriously vanished", "died in suspicious accident", "left with no explanation", "kidnapped or imprisoned", "committed suicide", "society kept you apart", "defected to other side", "rival cut you out"][d10() - 1] };
  }

  // I: appearance
  const appearance = {
    hairColor: HAIR_COLORS[d10() - 1],
    hairStyle: HAIR_STYLES[d10() - 1],
    eyeColor: EYE_COLORS[d10() - 1],
    personalityTrait: PERSONALITY_TRAITS[d10() - 1],
    valueMost: VALUES_MOST[d10() - 1],
    valuedPossession: VALUED_POSSESSIONS[d10() - 1],
    valuedPerson: VALUED_PERSONS[d10() - 1],
  };

  return {
    socialStatus: socialRoll,
    startingCash: ss.cash,
    parentStatus,
    familyStanding,
    familyCrisis,
    familialGoal,
    siblings,
    friends,
    enemies,
    romance,
    appearance,
  };
}

/** Roll a professional lifepath event for one career term. */
export function rollProfessionalEvent(dangerous: boolean): { event: string; detail: string; accidentEffect?: { stat: "att" | "ref"; delta: number } } {
  const roll = d10();
  if (dangerous) {
    if (roll === 1)       return { event: "short affair", detail: "Roll M: " + (d10() <= 4 ? "Enemy made" : "Friend made") };
    if (roll === 2)       return { event: "lasting affair", detail: "Pick up a lover" };
    if (roll === 3)       return { event: "new friend", detail: "Friend acquired" };
    if (roll === 4)       return { event: "new enemy", detail: "Enemy made" };
    if (roll === 5)       return { event: "windfall", detail: WINDFALL_EVENTS[d10()] };
    // else accident
  } else {
    if (roll <= 2)        return { event: "short affair", detail: "Roll M: " + (d10() <= 4 ? "Enemy made" : "Friend made") };
    if (roll === 3)       return { event: "lasting affair", detail: "Pick up a lover" };
    if (roll === 4)       return { event: "new friend", detail: "Friend acquired" };
    if (roll === 5)       return { event: "new enemy", detail: "Enemy made" };
    if (roll === 6)       return { event: "windfall", detail: WINDFALL_EVENTS[d10()] };
    // else accident
  }
  const acc = ACCIDENT_EVENTS[d10()];
  return { event: "accident", detail: acc.label, accidentEffect: acc.stat ? { stat: acc.stat, delta: acc.delta! } : undefined };
}
