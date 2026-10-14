/**
 * photocn's main-thread export encodes with `canvas.toDataURL()` and reads
 * it back with `fetch(dataUrl)`. The `/_emdash` CSP has `connect-src 'self'`,
 * which blocks `fetch("data:…")`, so main-thread exports fail in the admin.
 * While an export runs we answer `data:` fetches locally; every other
 * request goes to the real `fetch` untouched. (W-480 finding; upstream ask:
 * use `canvas.toBlob()`.)
 */

export function decodeDataUrl(url: string): Response | null {
  const match = /^data:([^,]*?),(.*)$/s.exec(url);
  if (!match) return null;
  const meta = match[1] ?? "";
  const body = match[2] ?? "";
  const base64 = /;base64$/i.test(meta);
  const type = (base64 ? meta.slice(0, -7) : meta) || "text/plain";
  let bytes: Uint8Array<ArrayBuffer>;
  if (base64) {
    const bin = atob(body);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(body)) as Uint8Array<ArrayBuffer>;
  }
  return new Response(new Blob([bytes], { type }), {
    status: 200,
    headers: { "content-type": type },
  });
}

let depth = 0;
let realFetch: typeof fetch | undefined;

/** Run `task` with `data:` fetches served locally. Nested calls share one shim. */
export async function withDataUrlFetch<T>(
  task: () => Promise<T>,
  g: typeof globalThis = globalThis,
): Promise<T> {
  if (depth++ === 0) {
    realFetch = g.fetch;
    const original = realFetch;
    g.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith("data:")) {
        const res = decodeDataUrl(url);
        if (res) return Promise.resolve(res);
      }
      return original.call(g, input, init);
    }) as typeof fetch;
  }
  try {
    return await task();
  } finally {
    if (--depth === 0 && realFetch) {
      g.fetch = realFetch;
      realFetch = undefined;
    }
  }
}
