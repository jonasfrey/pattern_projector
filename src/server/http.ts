/** Small HTTP helpers shared by API handlers. */

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function ok(data: unknown = { ok: true }): Response {
  return json(data, 200);
}

export function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export async function readJson<T>(req: Request): Promise<T> {
  return (await req.json()) as T;
}

/** Binary response that sidesteps the Uint8Array<ArrayBufferLike> / BodyInit
 * type friction in Deno + strict mode. */
export function binary(
  bytes: Uint8Array,
  headers: Record<string, string>,
): Response {
  return new Response(bytes as unknown as BodyInit, { headers });
}
