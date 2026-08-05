/** Wiki path + form helpers */

export const PATH_RE = /^[a-z0-9]+(?:[/_-][a-z0-9]+)*$/;

export const SEED_BODY = `Write the page here.

## Overview

## Details

## See also

- [[related-page]]
`;

export const READ_LOCKS = [
  { value: "public", label: "public — anyone (web + game)" },
  { value: "connected", label: "connected — logged-in players" },
  { value: "staff", label: "staff — staff only" },
  { value: "admin", label: "admin — admin only" },
] as const;

export function normalizePath(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/+/g, "/");
}

export function isValidPath(path: string): boolean {
  return PATH_RE.test(path);
}

export function encodeWikiPath(path: string): string {
  return encodeURIComponent(path).replace(/%2F/gi, "/");
}

export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^\w-]+/g, "")
    .slice(0, 40);
}

export function addTag(list: string[], raw: string, max = 24): string[] {
  const t = normalizeTag(raw);
  if (!t || list.includes(t) || list.length >= max) return list;
  return [...list, t];
}

export type WikiPagePayload = {
  title: string;
  body: string;
  draft: boolean;
  featured: boolean;
  /** Public site: theme bg + home-height; default false = compact. */
  bgImage: boolean;
  readLock: string;
  tags: string[];
};

export function pageSnapshot(p: WikiPagePayload): string {
  return JSON.stringify({
    title: p.title,
    body: p.body,
    draft: p.draft,
    featured: p.featured === true,
    bgImage: p.bgImage === true,
    readLock: p.readLock,
    tags: [...p.tags].map((t) => t.toLowerCase()).sort(),
  });
}
