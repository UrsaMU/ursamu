// Character notes: slug-keyed map of player-authored or staff-edited entries.

export type NoteVisibility = "public" | "private";

export interface CofdNote {
  name: string;
  text: string;
  visibility: NoteVisibility;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

export type CofdNotes = Record<string, CofdNote>;

export const NOTE_NAME_MAX = 40;
export const NOTE_TEXT_MAX = 8000;

/** Lowercased + non-alnum -> "_" for stable storage keys. */
export function noteSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export interface NoteValidation {
  ok: boolean;
  error?: string;
}

export function validateName(cleanName: string): NoteValidation {
  if (!cleanName) return { ok: false, error: "Note name is required." };
  if (cleanName.length > NOTE_NAME_MAX) {
    return { ok: false, error: `Note name must be <= ${NOTE_NAME_MAX} characters.` };
  }
  if (!/^[A-Za-z0-9 _-]+$/.test(cleanName)) {
    return { ok: false, error: "Note name may only contain letters, numbers, spaces, '_' and '-'." };
  }
  if (!noteSlug(cleanName)) {
    return { ok: false, error: "Note name must contain at least one alphanumeric character." };
  }
  return { ok: true };
}

export function validateText(cleanText: string): NoteValidation {
  if (!cleanText) return { ok: false, error: "Note text is required." };
  if (cleanText.length > NOTE_TEXT_MAX) {
    return { ok: false, error: `Note text must be <= ${NOTE_TEXT_MAX} characters (got ${cleanText.length}).` };
  }
  return { ok: true };
}
