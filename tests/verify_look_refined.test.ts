import { assert } from "@std/assert";
import type { IUrsamuSDK } from "@ursamu/mush";
import { execLook } from "@ursamu/mush";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function makeRoom(id: string, name: string) {
  return {
    id,
    flags: new Set(["room"]),
    state: { name, description: "You see nothing special." },
    location: "0",
    contents: [] as unknown[],
    broadcast: (_msg: string) => {},
  };
}

function makePlayer(id: string, name: string, location: string) {
  return {
    id,
    flags: new Set(["player", "connected"]),
    state: { name },
    location,
    contents: [] as unknown[],
  };
}

function makeMock(
  room: ReturnType<typeof makeRoom>,
  player: ReturnType<typeof makePlayer>,
  canEdit: boolean,
) {
  let sentMessage = "";
  return {
    mock: {
      me: player,
      here: room,
      cmd: { name: "look", args: [""], switches: [] },
      send: (msg: string) => { sentMessage = msg; },
      canEdit: () => Promise.resolve(canEdit),
      db: {
        search: (_q: unknown) => Promise.resolve([]),
      },
      attr: {
        get: (_id: string, _name: string) => Promise.resolve(""),
      },
      util: {
        // displayName(obj, actor) — second arg is optional
        displayName: (
          o: { state?: { name?: string }; name?: string },
          _actor?: unknown,
        ) => o.state?.name ?? o.name ?? "Unknown",
        parseDesc: undefined,
        target: async () => null,
      },
    },
    get sent() { return sentMessage; },
  };
}

Deno.test(
  "Look Command — dbref shown for admin/canEdit looker",
  OPTS,
  async () => {
    const room = makeRoom("9", "Child Room");
    const player = makePlayer("player1", "Player1", "0");
    const { mock, get: _get } = { mock: makeMock(room, player, true).mock, get: () => makeMock(room, player, true).sent };

    let sent = "";
    (mock as unknown as Record<string, unknown>).send = (m: string) => { sent = m; };

    await execLook(mock as unknown as IUrsamuSDK);

    // nameWithDbref produces "Child Room(#9r)" — "r" is the room
    // flag short-code added by dbrefWithFlags.
    assert(
      sent.includes("Child Room(#9"),
      `Expected "Child Room(#9..." in output, got: ${sent}`,
    );
  },
);

Deno.test(
  "Look Command — dbref hidden for non-editable looker",
  OPTS,
  async () => {
    const room = makeRoom("9", "Child Room");
    const player = makePlayer("player1", "Player1", "0");
    const { mock } = makeMock(room, player, false);

    let sent = "";
    (mock as unknown as Record<string, unknown>).send = (m: string) => { sent = m; };

    await execLook(mock as unknown as IUrsamuSDK);

    assert(
      !sent.includes("(#9)"),
      `Should NOT include (#9) for non-editable, got: ${sent}`,
    );
    assert(
      sent.includes("Child Room"),
      `Should still include the name, got: ${sent}`,
    );
  },
);
