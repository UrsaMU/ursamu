// Runtime form / mask state on a CoFD sheet.
// Numeric form mods live in tempStats; identity lives here.

/** Which shift system is active for this character. */
export type FormSystem =
  | "none"
  | "mask" // CtL Mask / mien
  | "werewolf" // WtF five forms (later)
  | "animal"; // CtL Chrysalis animal body (later)

/** CtL Mask states. */
export type MaskForm = "mask" | "mien";

/** WtF form names (slug-style). */
export type WerewolfFormName =
  | "hishu"
  | "dalu"
  | "gauru"
  | "urshul"
  | "urhan";

/**
 * Persistent form identity. Does not store Attribute deltas — those go
 * in sheet.tempStats as absolute effective values.
 */
export interface FormState {
  /** Active system; "none" when no shift subsystem applies. */
  system: FormSystem;
  /**
   * Current form key within the system.
   * mask: "mask" | "mien"
   * werewolf: "hishu" | "dalu" | ...
   * animal: animal catalog slug
   */
  current: string;
  /** Unix ms when this form was entered (scene timers, Gauru later). */
  since?: number;
  /** Optional source tag, e.g. "chrysalis", "core-mask". */
  source?: string;
  /**
   * Stat keys this form last wrote into tempStats. Cleared on exit so
   * other buffs are not wiped blindly.
   */
  tempKeys?: string[];
  /**
   * While system is "animal", which Mask state to restore on exit.
   */
  priorMask?: MaskForm;
}

export function defaultFormState(): FormState {
  return { system: "none", current: "" };
}

export function isMaskForm(s: string): s is MaskForm {
  const k = s.toLowerCase().trim();
  return k === "mask" || k === "mien";
}
