/**
 * Interval registry for zone wander / ambient ticks.
 * Host owns the tick body (spawn, move, flavor); engine owns timers.
 */

const intervals = new Map<string, number>();

/**
 * Arm a repeating tick for zoneId. Replaces any existing loop.
 * Uses Deno.unrefTimer when available so tests/process can exit.
 */
export function startZoneLoop(
  zoneId: string,
  intervalMs: number,
  tick: () => void | Promise<void>,
): void {
  stopZoneLoop(zoneId);
  const ms = Math.max(250, Math.floor(intervalMs) || 30_000);
  const handle = setInterval(() => {
    Promise.resolve(tick()).catch(() => { /* swallow */ });
  }, ms);
  try {
    // deno-lint-ignore no-explicit-any
    (Deno as any).unrefTimer?.(handle);
  } catch { /* not Deno or unsupported */ }
  intervals.set(zoneId, handle as unknown as number);
}

export function stopZoneLoop(zoneId: string): void {
  const handle = intervals.get(zoneId);
  if (handle !== undefined) {
    clearInterval(handle);
    intervals.delete(zoneId);
  }
}

export function stopAllZoneLoops(): void {
  for (const h of intervals.values()) clearInterval(h);
  intervals.clear();
}

/** Active zone ids with armed loops (tests / diagnostics). */
export function listZoneLoops(): string[] {
  return [...intervals.keys()];
}
