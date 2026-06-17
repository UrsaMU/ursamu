// Typed re-exports of skill names from resources/skills.json.

const skillsUrl = new URL("../../resources/skills.json", import.meta.url);
const skillsData = JSON.parse(Deno.readTextFileSync(skillsUrl));

export const COFD_MENTAL_SKILLS = [...skillsData.mental] as readonly string[];
export const COFD_PHYSICAL_SKILLS = [...skillsData.physical] as readonly string[];
export const COFD_SOCIAL_SKILLS = [...skillsData.social] as readonly string[];

export const COFD_SKILLS = [
  ...COFD_MENTAL_SKILLS,
  ...COFD_PHYSICAL_SKILLS,
  ...COFD_SOCIAL_SKILLS,
] as readonly string[];

export type CofdSkill = string;
