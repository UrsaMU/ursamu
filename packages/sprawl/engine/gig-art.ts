/**
 * Staff-configurable images for gig room types (by slug).
 * Stored in DBO sprawl.gig_room_art.
 */
import { DBO } from "@ursamu/ursamu";
import { GIG_ROOMS } from "./catalog.ts";

export type GigRoomArtDoc = {
  id: string;
  /** roomSlug → public image URL */
  bySlug: Record<string, string>;
  updatedAt?: number;
};

const COL = "sprawl.gig_room_art";
const DOC_ID = "default";

const store = new DBO<GigRoomArtDoc>(COL);

async function loadDoc(): Promise<GigRoomArtDoc> {
  const row = await store.queryOne({ id: DOC_ID });
  if (row && typeof row === "object") {
    const d = row as GigRoomArtDoc;
    return {
      id: DOC_ID,
      bySlug: { ...(d.bySlug ?? {}) },
      updatedAt: d.updatedAt,
    };
  }
  return { id: DOC_ID, bySlug: {} };
}

async function saveDoc(doc: GigRoomArtDoc): Promise<void> {
  const existing = await store.queryOne({ id: DOC_ID });
  const payload: GigRoomArtDoc = {
    id: DOC_ID,
    bySlug: doc.bySlug,
    updatedAt: Date.now(),
  };
  if (existing) {
    await store.modify({ id: DOC_ID }, "$set", payload);
  } else {
    await store.create(payload);
  }
}

export async function listGigRoomArt(): Promise<
  Record<string, string>
> {
  const d = await loadDoc();
  return { ...d.bySlug };
}

export async function getGigRoomArt(
  slug: string,
): Promise<string | null> {
  const d = await loadDoc();
  const u = d.bySlug[slug.toLowerCase().trim()];
  return u && String(u).trim() ? String(u).trim() : null;
}

export async function setGigRoomArt(
  slug: string,
  url: string,
): Promise<void> {
  const key = slug.toLowerCase().trim();
  if (!key) throw new Error("Missing room slug");
  const d = await loadDoc();
  const u = url.trim();
  if (!u || u.toLowerCase() === "clear") {
    delete d.bySlug[key];
  } else {
    if (!/^https?:\/\//i.test(u) && !u.startsWith("/")) {
      throw new Error("URL must be http(s) or /path");
    }
    d.bySlug[key] = u;
  }
  await saveDoc(d);
}

/** Catalog rooms + current art for staff UI. */
export async function gigRoomArtCatalog(): Promise<
  Array<{
    slug: string;
    name: string;
    blurb?: string;
    image: string | null;
  }>
> {
  const art = await listGigRoomArt();
  return GIG_ROOMS.map((r) => ({
    slug: String(r.slug),
    name: String(r.name ?? r.slug),
    blurb: r.blurb ? String(r.blurb) : undefined,
    image: art[String(r.slug)] ?? null,
  }));
}
