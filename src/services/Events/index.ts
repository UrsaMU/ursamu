import { DBO } from "@ursamu/core";
import { sandboxService, SDKService } from "@ursamu/mush";
import { dbojs } from "@ursamu/mush";

const events = new DBO<{ id: string } & Record<string, unknown>>("server.events");

export class EventsService {
  private static instance: EventsService;

  private constructor() {}

  static getInstance(): EventsService {
    if (!EventsService.instance) {
      EventsService.instance = new EventsService();
    }
    return EventsService.instance;
  }

  async emit(event: string, data: unknown, context?: Record<string, unknown>) {
    const subs = await events.query({ name: event });

    for (const sub of subs) {
      try {
        const subscriber = await dbojs.queryOne({ id: (sub as Record<string, unknown>).subscriber as string });
        if (!subscriber) continue;

        const code = `
          const data = ${JSON.stringify(data)};
          ${(sub as Record<string, unknown>).handler}
        `;

        await sandboxService.runScript(code, {
          id: subscriber.id,
          me: await SDKService.hydrate(subscriber as never),
          state: (subscriber.data?.state as Record<string, unknown>) || {},
          ...context,
        });
      } catch (e: unknown) {
        console.error(`[Events] Error executing handler for ${event} (sub: ${(sub as Record<string, unknown>).id}):`, e);
      }
    }
  }

  async subscribe(event: string, handler: string, subscriber: string): Promise<string> {
    const id = crypto.randomUUID();
    await events.create({ id, name: event, subscriber, handler } as Record<string, unknown> & { id: string });
    return id;
  }

  async unsubscribe(id: string): Promise<void> {
    await events.delete({ id });
  }
}

export const eventsService = EventsService.getInstance();
