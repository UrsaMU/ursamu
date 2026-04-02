/**
 * @module startup
 * @description Scans all database objects for a STARTUP attribute and executes
 * each one in the context of the owning object on server boot.
 */
import { dbojs } from "../Database/index.ts";
import { force } from "../commands/index.ts";
import { isSoftcode } from "../../utils/isSoftcode.ts";
import type { IAttribute } from "../../@types/IAttribute.ts";

/**
 * Scan all DB objects for a STARTUP attribute and execute each one.
 *
 * Lookup order:
 *   1. data.attributes[] (modern — set via `&STARTUP obj=<value>`)
 *   2. data.STARTUP (legacy — stored as a plain command string)
 *
 * If the value is softcode it is evaluated first; the result is dispatched
 * through the command pipeline via force(). If it is a plain command string
 * it is dispatched directly.
 *
 * Only fires on wizard/admin/superuser-flagged objects.
 */
export async function runStartupAttrs(): Promise<void> {
  const objs = await dbojs.query({});
  let fired = 0;

  for (const obj of objs) {
    // Find STARTUP value — prefer attributes[] over legacy data.STARTUP
    const attrRecord = (obj.data?.attributes as IAttribute[] | undefined)
      ?.find(a => a.name.toUpperCase() === "STARTUP");

    const startupValue = attrRecord?.value
      ?? (typeof obj.data?.STARTUP === "string" ? obj.data.STARTUP as string : undefined);

    if (!startupValue?.trim()) continue;

    const f = (obj.flags || "").toLowerCase();
    const hasElevated = f.includes("wizard") || f.includes("admin") || f.includes("superuser");
    if (!hasElevated) continue;

    try {
      let cmd = startupValue.trim();

      // If the value is softcode, evaluate it to obtain the command string
      if (attrRecord && isSoftcode(attrRecord)) {
        const { softcodeService } = await import("../Softcode/index.ts");
        cmd = await softcodeService.runSoftcode(cmd, { actorId: obj.id });
      }

      // Dispatch through the normal command pipeline as the object itself
      await force(
        {
          // deno-lint-ignore no-explicit-any
          socket: { cid: obj.id, id: `startup-${obj.id}`, join: () => {}, leave: () => {}, send: () => {}, disconnect: () => {} } as any,
        },
        cmd,
      );
      fired++;
    } catch (err) {
      console.error(`[startup] Error executing STARTUP for #${obj.id}:`, err);
    }
  }

  console.log(`[startup] Executed STARTUP attribute on ${fired} object(s).`);
}
