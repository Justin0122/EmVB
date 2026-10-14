/**
 * photocn render-worker strategy for the EmDash admin (D-059).
 *
 * photocn's default worker is a `blob:` URL, which the `/_emdash` CSP blocks
 * (no `worker-src`, so `script-src 'self'` applies). We hand photocn a
 * same-origin module worker that the host's Vite bundles from
 * `photocn/worker/entry`, probe it once, and fall back to main-thread
 * rendering when it can't start. Never a `blob:` worker.
 *
 * Only the lazily imported image editor chunk may import this file.
 */

import type { CreatePhotoOptions } from "photocn/photo";

export type RenderMode = NonNullable<CreatePhotoOptions["renderMode"]>;

export interface RenderPlan {
  renderMode: RenderMode;
  spawnWorker?: CreatePhotoOptions["spawnWorker"];
  /** Why the main thread was chosen, for the status bar. */
  reason?: string;
}

/** A same-origin module worker; Vite emits it as a `/_astro/…` (or dev) asset. */
function spawnPhotoWorker(): Worker {
  return new Worker(new URL("photocn/worker/entry", import.meta.url), { type: "module" });
}

interface WorkerEnv {
  hasWorker: boolean;
  hasOffscreenCanvas: boolean;
  canTransfer: boolean;
}

function readWorkerEnv(g: typeof globalThis = globalThis): WorkerEnv {
  const canvasProto = (g as { HTMLCanvasElement?: { prototype: object } }).HTMLCanvasElement
    ?.prototype;
  return {
    hasWorker: typeof (g as { Worker?: unknown }).Worker === "function",
    hasOffscreenCanvas: typeof (g as { OffscreenCanvas?: unknown }).OffscreenCanvas === "function",
    canTransfer: !!canvasProto && "transferControlToOffscreen" in canvasProto,
  };
}

/**
 * Start a worker and wait for proof it runs: photocn's worker answers a
 * stateless `dispose` request with `{ type: "ok" }`. A CSP block, a 404 or
 * a syntax error shows up as a throw, an `error` event or a timeout.
 */
export function probeWorker(spawn: () => Worker, timeoutMs = 4000): Promise<true | string> {
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = spawn();
    } catch (err) {
      resolve(`Worker blocked: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    const done = (result: true | string) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(result);
    };
    const timer = setTimeout(() => done("Worker did not start in time"), timeoutMs);
    worker.addEventListener("message", (event: MessageEvent) => {
      const data = event.data as { type?: string; reqId?: number } | null;
      if (data?.reqId === -480 && data.type === "ok") done(true);
    });
    worker.addEventListener("error", (event) => {
      event.preventDefault?.();
      done("Worker failed to load");
    });
    // A Worker's postMessage has no targetOrigin.
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    worker.postMessage({ type: "dispose", reqId: -480 });
  });
}

/** Decide where photocn renders. Cached per page load. */
let cached: Promise<RenderPlan> | undefined;

export function planRendering(
  options: { force?: RenderMode; spawn?: () => Worker; env?: WorkerEnv } = {},
): Promise<RenderPlan> {
  if (options.force === "main") return Promise.resolve({ renderMode: "main", reason: "Forced" });
  if (!options.spawn && !options.env && !options.force && cached) return cached;
  const env = options.env ?? readWorkerEnv();
  const spawn = options.spawn ?? spawnPhotoWorker;
  const plan: Promise<RenderPlan> =
    !env.hasWorker || !env.hasOffscreenCanvas || !env.canTransfer
      ? Promise.resolve({
          renderMode: "main",
          reason: "This browser can't render off the main thread",
        })
      : probeWorker(spawn).then((ok) =>
          ok === true
            ? { renderMode: "worker", spawnWorker: spawn }
            : { renderMode: "main", reason: ok },
        );
  if (!options.spawn && !options.env && !options.force) cached = plan;
  return plan;
}

/** WebGL2 is required either way; without it the editor shows "Can't edit here". */
export function hasWebGL2(doc: Document = document): boolean {
  try {
    return !!doc.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}
