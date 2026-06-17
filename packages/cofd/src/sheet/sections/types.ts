// Shared types for sheet section renderers.

import type { IUrsamuSDK } from "@ursamu/ursamu";
import type { CofdSheet } from "../../stats/sheet.ts";
import type { CofdTemplate } from "../../gamelines/templates.ts";

export interface SheetContext {
  playerName: string;
  /** Owner id (the rendered character). */
  actorId: string;
  sheet: CofdSheet;
  template: CofdTemplate;
  width: number;
  /**
   * SDK handle. Present when formatSheet is called from a command context.
   * Absent in tests and offline tools; sections that need it should degrade
   * gracefully when u is undefined.
   */
  u?: IUrsamuSDK;
}

export interface SheetSection {
  /** Unique key for ordering / overrides. */
  key: string;
  /** Lines this section contributes; return [] to suppress entirely. */
  render(ctx: SheetContext): Promise<string[]> | string[];
}
