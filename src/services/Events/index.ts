import { events } from "../Database/index.ts";
import { sandboxService } from "../Sandbox/SandboxService.ts";
import { SDKService } from "../Sandbox/SDKService.ts";
import { Obj } from "../DBObjs/DBObjs.ts";

export class EventsService {
  private static instance: EventsService;
  
  private constructor() {}

  static getInstance(): EventsService {
    if (!EventsService.instance) {
      EventsService.instance = new EventsService();
    }
    return EventsService.instance;
  }

  /**
   * Emit an event to all subscribers.
   * @param event The name of the event.
   * @param data Data associated with the event.
   * @param context Additional context (e.g., actor, room).
   */
  async emit(event: string, data: unknown, context?: Record<string, unknown>) {
    const subs = await events.query({ name: event });
    
    for (const sub of subs) {
      try {
        const subscriber = await Obj.get(sub.subscriber);
        if (!subscriber) continue;

        // Run the handler in the sandbox
        // We wrap the handler code to make 'data' available
        const code = `
          const data = ${JSON.stringify(data)};
          ${sub.handler}
        `;

        await sandboxService.runScript(code, {
            id: subscriber.id,
            me: await SDKService.hydrate(subscriber),
            state: subscriber.data?.state as Record<string, unknown> || {},
            ...context
        });

      } catch (e) {
        console.error(`[Events] Error executing handler for ${event} (sub: ${sub.id}):`, e);
      }
    }
  }

  /**
   * Subscribe to an event.
   * @param event Event name.
   * @param handler Script code to execute.
   * @param subscriber DBRef of the object subscribing.
   * @returns The subscription ID.
   */
  async subscribe(event: string, handler: string, subscriber: string): Promise<string> {
    const id = crypto.randomUUID();
    await events.create({
      id,
      name: event,
      subscriber,
      handler
    });
    return id;
  }

  /**
   * Unsubscribe from an event.
   * @param id Subscription ID.
   */
  async unsubscribe(id: string): Promise<void> {
    await events.delete({ id });
  }
}

export const eventsService = EventsService.getInstance();
