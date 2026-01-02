import { force } from "../commands/index.ts";
import { getNextId } from "../../utils/getNextId.ts";

const kv = await Deno.openKv();

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
    delay: number = 0
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
        // Construct a partial ctx for force. 
        // We need to fetch the socket or mock it? 
        // `force` uses `ctx` which expects `socket`, `msg`, `data`.
        // If the player is offline, `force` might fail if it tries to send output to a socket.
        // But for softcode queues, we often execute in a "detached" state or need to revive the context.
        // For now, let's look at `force`.
        
        // We delete first to ensure exactly-once (mostly) execution 
        // or delete after? If we crash during execution, it might retry if we don't delete?
        // KV listenQueue retries on failure? Deno docs say "At least once delivery".
        // Safe to delete first.
        await kv.delete(["queue", pid]);
        
        // We need to reasonably mock the context for `force`
        // or refactor `force` to not strictly require a live socket.
        // This is a common issue in MUSHes (background tasks).
        
        // Let's import the necessary types to mock.
        // For now, we'll try to execute.
         await force(
            {
               // deno-lint-ignore no-explicit-any
               socket: { cid: entry.executor, id: "queue" } as any, 
               msg: entry.command,
               data: entry.data || {}
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
