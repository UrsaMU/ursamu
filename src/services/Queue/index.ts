import { force } from "../commands/index.ts";
import { getNextId } from "../../utils/getNextId.ts";
import { dpath } from "../../../deps.ts";

// Use the same KV store as the rest of the engine
const dbPath = Deno.env.get("URSAMU_DB") || dpath.join(Deno.cwd(), "data", "ursamu.db");
const kv = await Deno.openKv(dbPath);

interface QueueEntry {
  pid: number;
  command: string;
  executor: string; // dbref
  enactor: string; // dbref
  data?: Record<string, unknown>;
}

export const queue = {
  enqueue: async (
    entry: Omit<QueueEntry, "pid">,
    delay: number = 0 // delay in milliseconds before the task executes
  ): Promise<number> => {
    const pid = parseInt(await getNextId("queueId"), 10);
    const fullEntry: QueueEntry = { ...entry, pid };
    
    // Store the task data
    await kv.set(["queue", pid], fullEntry);
    
    // Schedule the execution trigger
    await kv.enqueue({ pid }, { delay });
    
    return pid;
  },

  cancel: async (pid: number): Promise<boolean> => {
    const res = await kv.get(["queue", pid]);
    if (!res.value) return false;
    await kv.delete(["queue", pid]);
    return true;
  },

  init: () => {
    kv.listenQueue(async (msg: unknown) => {
      const { pid } = msg as { pid: number };
      const res = await kv.get<QueueEntry>(["queue", pid]);
      
      if (!res.value) {
        // Task was cancelled or already processed
        return;
      }

      const entry = res.value;
      
      // Execute
      try {
        // Delete first for at-least-once delivery (safe: KV listenQueue retries on uncaught throw)
        await kv.delete(["queue", pid]);

        // Execute via force() with a detached context (no live socket)
        await force(
          {
            // deno-lint-ignore no-explicit-any
            socket: { cid: entry.executor, id: "queue", join: () => {}, leave: () => {}, send: () => {}, disconnect: () => {} } as any,
            msg: entry.command,
            data: entry.data || {},
          },
          entry.command
        );

      } catch (error) {
        console.error(`Queue execution failed for PID ${pid}:`, error);
      }
    });
    console.log("[Queue] Service initialized.");
  }
};
