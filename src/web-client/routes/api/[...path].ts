import { HandlerContext } from "$fresh/server.ts";

export const handler = async (
  _req: Request,
  ctx: HandlerContext,
): Promise<Response> => {
  const path = ctx.params.path;
  const targetUrl = `http://localhost:4203/api/${path}`;

  /* Proxying request */

  try {
    // Forward the request to the backend
    const response = await fetch(targetUrl, {
      method: _req.method,
      headers: _req.headers,
      body: _req.body,
    });

    // Return the response as-is (streaming)
    // We might need to adjust headers for CORS if strictly necessary, but proxy usually bypasses CORS issues for the browser.
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  } catch (e) {
    console.error("Proxy Error:", e);
    return new Response("Proxy Error", { status: 502 });
  }
};
