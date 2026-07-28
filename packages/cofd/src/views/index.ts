// Room detail views: slug-keyed entries with optional locks.

export interface RoomView {
  name: string;
  text: string;
  /** Empty = open to anyone who can look. */
  lock: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

export type RoomViews = Record<string, RoomView>;

export const VIEW_NAME_MAX = 40;
export const VIEW_TEXT_MAX = 8000;
export const VIEW_LOCK_MAX = 4096;

/** Lowercased + non-alnum -> "_" for stable storage keys. */
export function viewSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export interface ViewValidation {
  ok: boolean;
  error?: string;
}

export function validateViewName(cleanName: string): ViewValidation {
  if (!cleanName) {
    return { ok: false, error: "View name is required." };
  }
  if (cleanName.length > VIEW_NAME_MAX) {
    return {
      ok: false,
      error: `View name must be <= ${VIEW_NAME_MAX} characters.`,
    };
  }
  if (!/^[A-Za-z0-9 _-]+$/.test(cleanName)) {
    return {
      ok: false,
      error:
        "View name may only contain letters, numbers, spaces, '_' and '-'.",
    };
  }
  if (!viewSlug(cleanName)) {
    return {
      ok: false,
      error: "View name needs at least one alphanumeric character.",
    };
  }
  return { ok: true };
}

export function validateViewText(cleanText: string): ViewValidation {
  if (!cleanText) {
    return { ok: false, error: "View text is required." };
  }
  if (cleanText.length > VIEW_TEXT_MAX) {
    return {
      ok: false,
      error:
        `View text must be <= ${VIEW_TEXT_MAX} characters ` +
        `(got ${cleanText.length}).`,
    };
  }
  return { ok: true };
}

export function validateViewLock(lock: string): ViewValidation {
  if (lock.length > VIEW_LOCK_MAX) {
    return {
      ok: false,
      error: `Lock must be <= ${VIEW_LOCK_MAX} characters.`,
    };
  }
  return { ok: true };
}

export function getRoomViews(o: {
  state?: { room_views?: RoomViews };
}): RoomViews {
  return (o.state?.room_views ?? {}) as RoomViews;
}
