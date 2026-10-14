import { describe, expect, test } from "bun:test";
import { decodeDataUrl, withDataUrlFetch } from "./data-url-fetch.ts";

describe("decodeDataUrl", () => {
  test("decodes base64 and plain data URLs", async () => {
    const b64 = decodeDataUrl("data:image/png;base64,iVBORw==");
    expect(b64?.headers.get("content-type")).toBe("image/png");
    expect([...new Uint8Array((await b64?.arrayBuffer()) ?? new ArrayBuffer(0))]).toEqual([
      0x89, 0x50, 0x4e, 0x47,
    ]);
    expect(await decodeDataUrl("data:,a%20b")?.text()).toBe("a b");
    expect(decodeDataUrl("https://x")).toBeNull();
  });
});

describe("withDataUrlFetch", () => {
  test("serves data: locally, passes others through, and restores fetch", async () => {
    const calls: string[] = [];
    const g = {
      fetch: (async (i: string) => (
        calls.push(String(i)),
        new Response("net")
      )) as unknown as typeof fetch,
    } as typeof globalThis;
    const original = g.fetch;
    const out = await withDataUrlFetch(async () => {
      const a = await (await g.fetch("data:text/plain;base64,aGk=")).text();
      const b = await (await g.fetch("/x")).text();
      return [a, b];
    }, g);
    expect(out).toEqual(["hi", "net"]);
    expect(calls).toEqual(["/x"]);
    expect(g.fetch).toBe(original);
  });
  test("restores fetch when the task throws", async () => {
    const g = {
      fetch: (async () => new Response()) as unknown as typeof fetch,
    } as typeof globalThis;
    const original = g.fetch;
    await expect(withDataUrlFetch(async () => Promise.reject(new Error("x")), g)).rejects.toThrow(
      "x",
    );
    expect(g.fetch).toBe(original);
  });
});
