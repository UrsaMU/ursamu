// Typed re-exports of skill names from resources/skills.json.
import skillsData from "../../resources/skills.json" with { type: "json" };

export const COFD_MENTAL_SKILLS = [...skillsData.mental] as readonly string[];
export const COFD_PHYSICAL_SKILLS = [...skillsData.physical] as readonly string[];
export const COFD_SOCIAL_SKILLS = [...skillsData.social] as readonly string[];

export const COFD_SKILLS = [
  ...COFD_MENTAL_SKILLS,
  ...COFD_PHYSICAL_SKILLS,
  ...COFD_SOCIAL_SKILLS,
] as readonly string[];

export type CofdSkill = string;
