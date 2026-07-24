/**
 * [LOW] Public online list leaked player location.
 *
 * RED:   response includes location field.
 * GREEN: location omitted from public listing.
 */
import { assertEquals } from "@std/assert";
import { onlinePlayersHandler, dbojs } from "@ursamu/mush";
import { DBO } from "@ursamu/core";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const PID = "sec_on_p1";

Deno.test(
  "[L1] online players listing omits location",
  OPTS,
  async () => {
    await dbojs.delete({ id: PID }).catch(() => {});
    await dbojs.create({
      id: PID,
      flags: "player connected",
      data: { name: "OnlineLeak" },
      location: "secret_room_99",
    });

    const res = await onlinePlayersHandler(
      new Request("http://localhost/api/v1/players/online"),
    );
    assertEquals(res.status, 200);
    const body = await res.json() as Array<Record<string, unknown>>;
    const me = body.find((p) => p.id === PID || p.name === "OnlineLeak");
    if (me) {
      assertEquals(
        "location" in me,
        false,
        "public online list must not include location",
      );
    }

    await dbojs.delete({ id: PID }).catch(() => {});
    await DBO.close();
  },
);
