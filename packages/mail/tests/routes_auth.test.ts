import { assertEquals } from "jsr:@std/assert@1";
import { mailRouteHandler } from "../src/routes.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test(
  "mailRouteHandler returns 401 when userId is null",
  OPTS,
  async () => {
    const res = await mailRouteHandler(
      new Request("http://localhost/api/v1/mail"),
      null,
    );
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error, "Unauthorized");
  },
);
