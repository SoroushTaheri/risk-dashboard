const INTERNAL_API = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8000";

type Context = { params: Promise<{ path: string[] }> };

async function forward(request: Request, context: Context) {
  const { path } = await context.params;
  const incoming = new URL(request.url);
  const target = new URL(`/api/${path.join("/")}${incoming.search}`, INTERNAL_API);
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const response = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
    signal: request.signal,
  });
  const outgoing = new Headers();
  const responseType = response.headers.get("content-type");
  if (responseType) outgoing.set("content-type", responseType);
  outgoing.set("cache-control", response.headers.get("cache-control") ?? "no-store");
  return new Response(response.body, { status: response.status, headers: outgoing });
}

export const GET = forward;
export const POST = forward;

