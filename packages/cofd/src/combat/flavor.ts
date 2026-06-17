// Ambient flavor broadcasts for zone rooms.
//
// The zone wander tick periodically picks a populated room (with no active
// encounter) and emits a single atmospheric one-liner. Themes match the
// ThemeKey union in ./themes.ts, with a "default" fallback for v1 zones
// that have no theme set.

import type { ThemeKey } from "./themes.ts";
// ThemeKey is imported for documentation/type alignment; the flavor map is
// keyed by plain string so "default" and unknown themes fall through cleanly.
export type _FlavorThemeAlignment = ThemeKey;

export interface FlavorLine {
  /** Raw broadcast text. No color codes — caller styles. */
  text: string;
}

/**
 * Theme-keyed flavor pool. "default" theme is used when zone.theme is null
 * or doesn't match a known key.
 */
export const FLAVOR_LINES: Record<string, FlavorLine[]> = {
  default: [
    { text: "The air shifts." },
    { text: "A sound, gone before you can place it." },
    { text: "Something stirs, just out of sight." },
    { text: "A chill threads through the room." },
    { text: "The light flickers, settles." },
    { text: "Distant noise rises and fades." },
  ],
  forest: [
    { text: "A twig snaps somewhere to the north." },
    { text: "Wind moves through the pines." },
    { text: "Eyes flicker between the trees." },
    { text: "Leaves rustle without a breeze." },
    { text: "An owl calls, twice, then silence." },
    { text: "Something heavy shifts in the underbrush." },
    { text: "Branches creak overhead." },
  ],
  city: [
    { text: "Distant sirens fade." },
    { text: "A door slams two blocks over." },
    { text: "Steam vents from a manhole." },
    { text: "Tires screech somewhere far off." },
    { text: "A bottle rolls down a gutter." },
    { text: "Neon hums against the dark." },
    { text: "Footsteps pass, never arriving." },
  ],
  "urban-decay": [
    { text: "Glass crunches underfoot." },
    { text: "Something skitters into a shadow." },
    { text: "A board sags, splinters, holds." },
    { text: "Rust flakes drift down from above." },
    { text: "A torn poster slaps against brick." },
    { text: "The smell of old fire rises briefly." },
  ],
  sewer: [
    { text: "Water drips, echoes." },
    { text: "Something large shifts in the dark." },
    { text: "A slow current sucks at the walls." },
    { text: "Pipes groan somewhere overhead." },
    { text: "A wet slap, then nothing." },
    { text: "The stench thickens for a moment." },
  ],
  ruins: [
    { text: "A stone settles." },
    { text: "Wind whistles through broken windows." },
    { text: "Dust sifts down from a cracked beam." },
    { text: "Something rattles deeper inside." },
    { text: "A shutter bangs, then falls still." },
    { text: "Old wood groans under nothing." },
  ],
};

/** Pick a random flavor line for the theme; falls back to "default". */
export function pickFlavor(theme: string | undefined | null): string | null {
  const key = theme && FLAVOR_LINES[theme] ? theme : "default";
  const pool = FLAVOR_LINES[key];
  if (!pool || pool.length === 0) return null;
  const line = pool[Math.floor(Math.random() * pool.length)];
  return line?.text ?? null;
}
