/**
 * @module startup
 * @description Scans all database objects for a STARTUP attribute and executes
 * each one in the context of the owning object on server boot.
 */
import { dbojs } from "../Database/index.ts";
import { force } from "../commands/index.ts";

/**
 * Scan all DB objects for a STARTUP attribute and execute each one.
 *
 * Execution uses a detached context (no live socket), with `socket.cid`
 * set to the object's own id — mirroring the Queue service pattern.
 */
export async function runStartupAttrs(): Promise<void> {
  const objs = await dbojs.query({});
  let fired = 0;

  for (const obj of objs) {
    const startup = obj.data?.STARTUP;
    if (typeof startup !== "string" || startup.trim() === "") continue;

    try {
      await force(
        {
          // deno-lint-ignore no-explicit-any
          socket: { cid: obj.id, id: `startup-${obj.id}`, join: () => {}, leave: () => {}, send: () => {}, disconnect: () => {} } as any,
        },
        startup.trim(),
      );
      fired++;
    } catch (err) {
      console.error(`[startup] Error executing STARTUP for #${obj.id}:`, err);
    }
  }

  console.log(`[startup] Executed STARTUP attribute on ${fired} object(s).`);
}
