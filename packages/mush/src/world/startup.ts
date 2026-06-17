/**
 * @module startup
 * @description Scans all database objects for a STARTUP attribute and executes
 * each one in the context of the owning object on server boot.
 */
import { dbojs } from "./dbobjs.ts";
import type { IAttribute } from "./types.ts";

// deno-lint-ignore no-explicit-any
type ForceFn = (ctx: any, cmd: string) => Promise<void>;

function isSoftcodeAttr(attr: { value: string; type?: string }): boolean {
  return attr.type === "softcode" || attr.value.trimStart().startsWith("[") || attr.value.trimStart().startsWith("@");
}

/**
 * Scan all DB objects for a STARTUP attribute and execute each one.
 *
 * @param force - the command pipeline dispatcher (injected to avoid circular deps)
 * @param runSoftcode - the softcode evaluator (injected to avoid circular deps)
 */
export async function runStartupAttrs(
  force: ForceFn,
  runSoftcode: (code: string, opts: { actorId: string }) => Promise<string>,
): Promise<void> {
  const objs = await dbojs.query({});
  let fired = 0;

  for (const obj of objs) {
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

      if (attrRecord && isSoftcodeAttr(attrRecord)) {
        cmd = await runSoftcode(cmd, { actorId: obj.id });
      }

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
