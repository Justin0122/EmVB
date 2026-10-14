import { describe, expect, test } from "bun:test";
import { hasWebGL2, planRendering, probeWorker } from "./worker.ts";

const env = { hasWorker: true, hasOffscreenCanvas: true, canTransfer: true };

class FakeWorker extends EventTarget {
  terminated = false;
  constructor(private reply: "ok" | "error" | "silent") {
    super();
  }
  postMessage(msg: { reqId: number }) {
    queueMicrotask(() => {
      if (this.reply === "ok")
        this.dispatchEvent(new MessageEvent("message", { data: { type: "ok", reqId: msg.reqId } }));
      if (this.reply === "error") this.dispatchEvent(new Event("error"));
    });
  }
  terminate() {
    this.terminated = true;
  }
}

const spawner = (reply: "ok" | "error" | "silent") => () =>
  new FakeWorker(reply) as unknown as Worker;

describe("probeWorker", () => {
  test("resolves true when the worker answers", async () => {
    expect(await probeWorker(spawner("ok"))).toBe(true);
  });
  test("reports a load error", async () => {
    expect(await probeWorker(spawner("error"))).toBe("Worker failed to load");
  });
  test("reports a throwing constructor (CSP block)", async () => {
    const r = await probeWorker(() => {
      throw new Error("blocked by CSP");
    });
    expect(r).toBe("Worker blocked: blocked by CSP");
  });
  test("times out", async () => {
    expect(await probeWorker(spawner("silent"), 10)).toBe("Worker did not start in time");
  });
});

describe("planRendering", () => {
  test("uses the worker when it starts", async () => {
    const spawn = spawner("ok");
    expect(await planRendering({ env, spawn })).toEqual({
      renderMode: "worker",
      spawnWorker: spawn,
    });
  });
  test("falls back to the main thread when the worker fails", async () => {
    expect(await planRendering({ env, spawn: spawner("error") })).toEqual({
      renderMode: "main",
      reason: "Worker failed to load",
    });
  });
  test("falls back without OffscreenCanvas", async () => {
    const plan = await planRendering({
      env: { ...env, hasOffscreenCanvas: false },
      spawn: spawner("ok"),
    });
    expect(plan.renderMode).toBe("main");
  });
  test("can be forced to the main thread", async () => {
    expect((await planRendering({ force: "main" })).renderMode).toBe("main");
  });
});

describe("hasWebGL2", () => {
  test("is false when the canvas has no webgl2 context", () => {
    const doc = { createElement: () => ({ getContext: () => null }) } as unknown as Document;
    expect(hasWebGL2(doc)).toBe(false);
  });
  test("is false when getContext throws", () => {
    const doc = {
      createElement: () => ({
        getContext: () => {
          throw new Error("no");
        },
      }),
    } as unknown as Document;
    expect(hasWebGL2(doc)).toBe(false);
  });
  test("is true with a context", () => {
    const doc = { createElement: () => ({ getContext: () => ({}) }) } as unknown as Document;
    expect(hasWebGL2(doc)).toBe(true);
  });
});
