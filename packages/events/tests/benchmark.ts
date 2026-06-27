import { eventRsvps, gameEvents } from "../src/db.ts";
import type { IGameEvent } from "../src/types.ts";

async function runBenchmark() {
  console.log("Setting up data...");
  await gameEvents.clear();
  await eventRsvps.clear();

  const numEvents = 100;
  const numRsvpsPerEvent = 10;

  const events: IGameEvent[] = [];

  for (let i = 0; i < numEvents; i++) {
    const ev: IGameEvent = {
        id: `ev-${i}`,
        number: i,
        title: `Test Event ${i}`,
        description: `This is a test event ${i}`,
        startTime: Date.now() + 1000 * 60 * 60 * 24 * i,
        createdBy: "player-1",
        createdByName: "Player 1",
        status: "upcoming",
        tags: [],
        maxAttendees: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
    await gameEvents.create(ev);
    events.push(ev);

    for (let j = 0; j < numRsvpsPerEvent; j++) {
        await eventRsvps.create({
            id: crypto.randomUUID(),
            eventId: ev.id,
            playerId: `player-${j}`,
            playerName: `Player ${j}`,
            status: "attending",
            createdAt: Date.now()
        });
    }
  }

  const visible = events;
  console.log(`Testing with ${numEvents} events and ${numRsvpsPerEvent} RSVPs each.`);

  // Baseline: N+1
  const startNPlus1 = performance.now();
  for (const e of visible) {
    const rsvps = await eventRsvps.find({ eventId: e.id, status: "attending" });
  }
  const endNPlus1 = performance.now();

  // Optimization: 1 Query + In-Memory Grouping
  const startOpt = performance.now();
  const visibleIds = visible.map(e => e.id);
  const allRsvps = await eventRsvps.find({ eventId: { $in: visibleIds }, status: "attending" });

  const rsvpsByEventId = new Map<string, typeof allRsvps>();
  for (const rsvp of allRsvps) {
    const arr = rsvpsByEventId.get(rsvp.eventId) || [];
    arr.push(rsvp);
    rsvpsByEventId.set(rsvp.eventId, arr);
  }

  for (const e of visible) {
    const rsvps = rsvpsByEventId.get(e.id) || [];
  }
  const endOpt = performance.now();

  console.log(`N+1 time taken: ${(endNPlus1 - startNPlus1).toFixed(2)}ms`);
  console.log(`Optimized time taken: ${(endOpt - startOpt).toFixed(2)}ms`);

  console.log("Cleaning up data...");
  await gameEvents.clear();
  await eventRsvps.clear();

}

runBenchmark().then(() => Deno.exit(0));
