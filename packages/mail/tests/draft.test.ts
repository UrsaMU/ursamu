import {
  assertEquals,
  assertExists,
} from "jsr:@std/assert@1";
import {
  getDraft,
  getMailState,
  setDraft,
} from "../src/draft.ts";
import type { IUrsamuSDK, IDBObj } from "@ursamu/mush";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mockPlayer(
  overrides: Partial<IDBObj> = {},
): IDBObj {
  return {
    id: "mail_p1",
    name: "Mailer",
    flags: new Set(["player", "connected"]),
    state: {},
    location: "room1",
    contents: [],
    ...overrides,
  } as IDBObj;
}

function mockU(me: IDBObj) {
  const dbCalls: unknown[][] = [];
  const u = {
    me,
    db: {
      modify: (...a: unknown[]) => {
        dbCalls.push(a);
        const op = a[1] as string;
        const data = a[2] as Record<string, unknown>;
        if (op === "$set" && data["state.mail"] !== undefined) {
          me.state = {
            ...me.state,
            mail: data["state.mail"],
          };
        }
        if (op === "$unset" && "state.mail" in data) {
          const { mail: _m, ...rest } = me.state as Record<
            string,
            unknown
          >;
          me.state = rest;
        }
        return Promise.resolve();
      },
    },
  } as unknown as IUrsamuSDK;
  return Object.assign(u, { _dbCalls: dbCalls });
}

Deno.test("getDraft returns undefined when empty", OPTS, () => {
  assertEquals(getDraft(mockPlayer()), undefined);
});

Deno.test(
  "setDraft writes state.mail.draft via $set",
  OPTS,
  async () => {
    const me = mockPlayer();
    const u = mockU(me);
    await setDraft(u, {
      subject: "Hi",
      message: "body",
      to: ["#2"],
    });
    assertEquals(u._dbCalls.length, 1);
    assertEquals(u._dbCalls[0][1], "$set");
    const draft = getDraft(me);
    assertExists(draft);
    assertEquals(draft!.subject, "Hi");
    assertEquals(getMailState(me).draft?.message, "body");
  },
);

Deno.test(
  "setDraft(undefined) unsets state.mail",
  OPTS,
  async () => {
    const me = mockPlayer({
      state: {
        mail: { draft: { subject: "x", message: "y" } },
      },
    });
    const u = mockU(me);
    await setDraft(u, undefined);
    assertEquals(u._dbCalls[0][1], "$unset");
    assertEquals(getDraft(me), undefined);
  },
);
