// Event lifecycle → Discord webhooks. Soft-loads @ursamu/events so the
// discord package still works when events is not installed.

import { getWebhookUrl } from "./config.ts";
import { postWebhook } from "./webhook.ts";
import { clean, COLORS } from "./helpers.ts";

interface IGameEvent {
  number: number;
  title: string;
  description: string;
  status: string;
  startTime: number;
  location?: string;
  createdByName: string;
}

interface IEventRSVP {
  playerName: string;
  status: string;
}

// deno-lint-ignore no-explicit-any
type EventHandler = (...args: any[]) => void | Promise<void>;

interface IEventHooksApi {
  on(event: string, handler: EventHandler): void;
  off(event: string, handler: EventHandler): void;
}

function when(ms: number): string {
  try {
    return new Date(ms).toUTCString();
  } catch {
    return String(ms);
  }
}

const onEventCreated = async (ev: IGameEvent): Promise<void> => {
  const url = await getWebhookUrl("events");
  if (!url) return;
  postWebhook(url, {
    username: "Events",
    embeds: [{
      color: COLORS.green,
      title: `Event #${ev.number}: ${clean(ev.title)}`,
      description: clean(ev.description).slice(0, 500),
      fields: [
        { name: "When", value: when(ev.startTime), inline: true },
        {
          name: "Host",
          value: clean(ev.createdByName),
          inline: true,
        },
        ...(ev.location
          ? [{ name: "Where", value: clean(ev.location), inline: true }]
          : []),
      ],
    }],
  });
};

const onEventCancelled = async (ev: IGameEvent): Promise<void> => {
  const url = await getWebhookUrl("events");
  if (!url) return;
  postWebhook(url, {
    username: "Events",
    embeds: [{
      color: COLORS.red,
      title: `Cancelled — #${ev.number}: ${clean(ev.title)}`,
      description: "This event has been cancelled.",
    }],
  });
};

const onEventCompleted = async (ev: IGameEvent): Promise<void> => {
  const url = await getWebhookUrl("events");
  if (!url) return;
  postWebhook(url, {
    username: "Events",
    embeds: [{
      color: COLORS.gray,
      title: `Completed — #${ev.number}: ${clean(ev.title)}`,
    }],
  });
};

const onEventRsvp = async (
  ev: IGameEvent,
  rsvp: IEventRSVP,
): Promise<void> => {
  const url = await getWebhookUrl("events");
  if (!url) return;
  postWebhook(url, {
    username: "Events",
    embeds: [{
      color: COLORS.blue,
      title: `RSVP — #${ev.number}: ${clean(ev.title)}`,
      description: `**${clean(rsvp.playerName)}** → \`${rsvp.status}\``,
    }],
  });
};

const BINDINGS: Array<[string, EventHandler]> = [
  ["event:created", onEventCreated],
  ["event:cancelled", onEventCancelled],
  ["event:completed", onEventCompleted],
  ["event:rsvp", onEventRsvp],
];

let _hooks: IEventHooksApi | null = null;

export function subscribeEventHooks(): void {
  void (async () => {
    try {
      let mod: { eventHooks?: IEventHooksApi } | null = null;
      try {
        mod = await import("@ursamu/events");
      } catch {
        console.log(
          "[discord] Events package not found — event webhooks skipped.",
        );
        return;
      }
      if (!mod?.eventHooks) return;
      _hooks = mod.eventHooks;
      for (const [ev, h] of BINDINGS) _hooks.on(ev, h);
      console.log("[discord] Event webhooks subscribed.");
    } catch (e: unknown) {
      console.error("[discord] Event hooks wire failed:", e);
    }
  })();
}

export function unsubscribeEventHooks(): void {
  if (!_hooks) return;
  for (const [ev, h] of BINDINGS) _hooks.off(ev, h);
  _hooks = null;
}
