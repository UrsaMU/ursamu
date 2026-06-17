import type { IPlugin } from "@ursamu/mush";
import { registerPluginRoute } from "@ursamu/mush";
import { eventsRouteHandler } from "./router.ts";
import "./commands.ts";

const eventsPlugin: IPlugin = {
  name: "events",
  version: "0.1.0",
  description: "In-game event calendar with RSVP tracking and REST API",

  init: () => {
    registerPluginRoute("/api/v1/events", eventsRouteHandler);
    console.log("[events] Plugin initialized — +event commands active, /api/v1/events routes registered");
    return true;
  },

  remove: () => {
    console.log("[events] Plugin removed");
  },
};

export default eventsPlugin;
