// Typed re-exports of attribute names from resources/attributes.json.

const attributesUrl = new URL("../../resources/attributes.json", import.meta.url);
const attributesData = JSON.parse(Deno.readTextFileSync(attributesUrl));

export const MENTAL_ATTRIBUTES = [...attributesData.mental] as readonly string[];
export const PHYSICAL_ATTRIBUTES = [...attributesData.physical] as readonly string[];
export const SOCIAL_ATTRIBUTES = [...attributesData.social] as readonly string[];

export const COFD_ATTRIBUTES = [
  ...MENTAL_ATTRIBUTES,
  ...PHYSICAL_ATTRIBUTES,
  ...SOCIAL_ATTRIBUTES,
] as readonly string[];

export type CofdAttribute = string;
