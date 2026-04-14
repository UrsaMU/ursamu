/**
 * @module workerRunner
 *
 * Shared worker lifecycle for short-lived Deno Worker executions.
 * Handles: worker creation, settled-flag, optional timeout, onerror,
 * and the terminate-on-resolve/reject sequence.
 *
 * Usage:
 *   return runInWorker<T>(url, initMessage, async (msg, worker, resolve, reject) => {
 *     if (msg.type === "result") { resolve(msg.data as T); return; }
 *     if (msg.type === "error")  { reject(new Error(String(msg.data))); return; }
 *     // handle side-effect messages (db:*, send, etc.)
 *   }, timeoutMs);
 */

/**
 * Message dispatcher callback.
 * Receives every inbound worker message. Call `resolve` / `reject` to
 * settle the outer promise; the worker will be terminated automatically.
 */
export type WorkerDispatch<T> = (
  msg:     Record<string, unknown>,
  worker:  Worker,
  resolve: (value: T) => void,
  reject:  (err: Error) => void,
) => void | Promise<void>;

/**
 * Spawn a short-lived Worker, send `initMessage`, and resolve/reject when
 * the dispatch callback calls the provided settlement functions.
 *
 * @param url         Worker module URL.
 * @param initMessage First message posted to the worker after creation.
 * @param dispatch    Message handler — call resolve/reject to settle.
 * @param timeoutMs   Optional wall-clock timeout; rejects with TimeoutError.
 */
export function runInWorker<T>(
  url:         URL | string,
  initMessage: Record<string, unknown>,
  dispatch:    WorkerDispatch<T>,
  timeoutMs?:  number,
): Promise<T> {
  const worker = new Worker(url, { type: "module" });

  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      fn();
    };

    const safeResolve = (v: T):    void => settle(() => resolve(v));
    const safeReject  = (e: Error): void => settle(() => reject(e));

    const timer = timeoutMs
      ? setTimeout(() => safeReject(new Error(`Worker timed out after ${timeoutMs}ms`)), timeoutMs)
      : undefined;

    worker.onmessage = async (e: MessageEvent) => {
      if (!e.data || typeof e.data.type !== "string") return;
      try {
        await dispatch(e.data as Record<string, unknown>, worker, safeResolve, safeReject);
      } catch (err: unknown) {
        safeReject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    worker.onerror = (e: ErrorEvent) =>
      safeReject(new Error(e.message ?? "Worker error"));

    worker.postMessage(initMessage);
  });
}
