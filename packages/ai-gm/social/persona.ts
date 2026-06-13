// ─── Multi-Persona Support ────────────────────────────────────────────────────
//
// Allows players to register alternate character names / voices that the GM
// will use when addressing them. Useful for multi-character players or
// storytellers who run NPCs as well as their own PC.
//
// Personas are lightweight: just a display name + optional description.
// The GM uses the active persona name when generating responses.

import { DBO } from "ursamu";
import { nanoid } from "../ingestion/util.ts";

// ─── Schema ───────────────────────────────────────────────────────────────────

export interface IPersona {
  id: string;
  playerId: string;
  name: string; // display name shown to GM and other players
  description?: string; // optional IC description / voice notes
  isActive: boolean; // only one persona can be active at a time
  createdAt: number;
}

export const gmPersonas = new DBO<IPersona>("server.gm.personas");

// ─── API ──────────────────────────────────────────────────────────────────────

export async function createPersona(
  playerId: string,
  name: string,
  description?: string,
): Promise<IPersona> {
  // Sanitise name: strip ANSI CSI escape sequences then non-printable chars, max 40 chars
  const safeName = name
    // deno-lint-ignore no-control-regex
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "") // strip ANSI CSI sequences (ESC[...m etc.)
    .replace(/[^\x20-\x7E]/g, "") // strip remaining non-printable ASCII
    .slice(0, 40)
    .trim();
  if (!safeName) {
    throw new Error("Persona name must contain printable ASCII characters.");
  }

  const persona: IPersona = {
    id: nanoid(),
    playerId,
    name: safeName,
    description: description?.slice(0, 200),
    isActive: false,
    createdAt: Date.now(),
  };
  await gmPersonas.create(persona as Parameters<typeof gmPersonas.create>[0]);
  return persona;
}

export async function activatePersona(
  playerId: string,
  personaId: string,
): Promise<IPersona | null> {
  const all = await getPersonasForPlayer(playerId);
  const target = all.find((p) => p.id === personaId);
  if (!target) return null;

  // Deactivate all others
  for (const p of all) {
    if (p.isActive) {
      await gmPersonas.modify(
        { id: p.id } as Parameters<typeof gmPersonas.modify>[0],
        "$set",
        { isActive: false } as unknown as Parameters<
          typeof gmPersonas.modify
        >[2],
      );
    }
  }

  await gmPersonas.modify(
    { id: personaId } as Parameters<typeof gmPersonas.modify>[0],
    "$set",
    { isActive: true } as unknown as Parameters<typeof gmPersonas.modify>[2],
  );
  target.isActive = true;
  return target;
}

export async function deactivatePersona(playerId: string): Promise<void> {
  const all = await getPersonasForPlayer(playerId);
  for (const p of all.filter((x) => x.isActive)) {
    await gmPersonas.modify(
      { id: p.id } as Parameters<typeof gmPersonas.modify>[0],
      "$set",
      { isActive: false } as unknown as Parameters<typeof gmPersonas.modify>[2],
    );
  }
}

export async function deletePersona(
  playerId: string,
  personaId: string,
): Promise<boolean> {
  const all = await getPersonasForPlayer(playerId);
  const found = all.find((p) => p.id === personaId);
  if (!found) return false;
  await gmPersonas.delete(
    { id: personaId } as Parameters<typeof gmPersonas.delete>[0],
  );
  return true;
}

export async function getPersonasForPlayer(
  playerId: string,
): Promise<IPersona[]> {
  const all = await gmPersonas.query(
    { playerId } as Parameters<typeof gmPersonas.query>[0],
  ) as IPersona[];
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getActivePersona(
  playerId: string,
): Promise<IPersona | null> {
  const all = await getPersonasForPlayer(playerId);
  return all.find((p) => p.isActive) ?? null;
}

/** Return the display name to use for a player in GM output. */
export async function resolveDisplayName(
  playerId: string,
  fallback: string,
): Promise<string> {
  const active = await getActivePersona(playerId);
  return active?.name ?? fallback;
}

/** Format persona list for in-game ASCII display. */
export function formatPersonas(personas: IPersona[]): string {
  if (!personas.length) return "No personas registered.";
  return personas.map((p) => {
    const status = p.isActive ? "[active]" : "";
    const desc = p.description ? ` - ${p.description}` : "";
    return `  ${p.id}  ${p.name}${desc}  ${status}`;
  }).join("\n");
}
