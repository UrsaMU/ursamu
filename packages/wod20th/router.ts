// Side-effect: register +help (commands.ts is root-owned; load here).
import "./commands/help.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

export async function wod20thRouteHandler(
  req: Request,
  userId: string | null,
): Promise<Response> {
  if (!userId) return json({ error: "Unauthorized" }, 401);

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/v1\/wod20th/, "");

  return json({ error: "Not found" }, 404);
}
