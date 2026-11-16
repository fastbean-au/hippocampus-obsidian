// A fetch over Obsidian's requestUrl, for hippocampus-client's gateway transport.
//
// The plugin cannot use the renderer's own fetch: Obsidian's renderer enforces CORS, and a
// Hippocampus gateway sends no CORS headers, so every call would fail before reaching the service.
// requestUrl is made from outside the renderer and is not subject to that policy - which is why the
// plugin's old hand-written client used it, and why the shared client takes a `fetch` option at all.
//
// Kept free of any Obsidian import - requestUrl is passed in - so the adapter is unit-tested
// directly, like parse.ts beside it.

// RequestUrl is the slice of Obsidian's requestUrl this adapter calls.
export type RequestUrl = (request: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  throw?: boolean;
}) => Promise<{ status: number; headers: Record<string, string>; text: string }>;

// requestUrlFetch adapts requestUrl to the fetch signature. requestUrl has no cancellation, so an
// aborted signal is honoured before the call and after it, not during it: a timed-out call still
// rejects with the abort reason, it just cannot stop the request already in flight.
export function requestUrlFetch(requestUrl: RequestUrl): typeof globalThis.fetch {
  return async (input, init) => {
    const signal = init?.signal ?? undefined;

    signal?.throwIfAborted();

    const headers: Record<string, string> = {};

    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });

    const res = await requestUrl({
      url: typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
      throw: false,
    });

    signal?.throwIfAborted();

    // A null-body status must be built without one, or the Response constructor throws.
    const empty = res.status === 204 || res.status === 205 || res.status === 304;

    return new Response(empty ? null : res.text, { status: res.status, headers: res.headers });
  };
}
