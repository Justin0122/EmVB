import { afterEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { emptyDesign, type DesignSystem } from "../../core/index.ts";
import { cleanup, mount } from "../../../test/dom/mount.ts";
import type { Fetcher } from "../api.ts";
import type { EditorAction, EditorState } from "./store.ts";
import { useEditorCommands } from "./useEditorCommands.ts";
import type { useSave } from "./useSave.ts";

afterEach(cleanup);

describe("site styles saves are queued (W-325)", () => {
  test("quick successive changes save one at a time, each on the revision the last one made", async () => {
    const sent: (string | null)[] = [];
    let active = 0;
    let overlap = false;
    let next = 1;
    const fetcher: Fetcher = async (input, init) => {
      if (!String(input).endsWith("/design/save")) return new Response("{}", { status: 404 });
      active += 1;
      if (active > 1) overlap = true;
      const body = JSON.parse(String(init?.body)) as { revision: string | null };
      sent.push(body.revision);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      const current = `r${next}`;
      if (body.revision !== current) {
        return Response.json({ error: { code: "CONFLICT", message: "x" } }, { status: 409 });
      }
      next += 1;
      return Response.json({ data: { revision: `r${next}` } });
    };
    const actions: EditorAction[] = [];
    let run: ((design: DesignSystem) => Promise<void>) | undefined;
    function Probe() {
      // The store never re-renders here, as when edits land faster than React updates the ref.
      const latest = React.useRef({ designRevision: "r1" } as unknown as EditorState);
      const commands = useEditorCommands({
        fetcher,
        collection: "emvb_pages",
        latest,
        dispatch: (action) => actions.push(action),
        saver: {} as ReturnType<typeof useSave>,
        toasts: { add: () => "" } as never,
      });
      run = commands.changeDesign;
      return null;
    }
    await mount(<Probe />);
    const results = await Promise.allSettled([
      run?.(emptyDesign()),
      run?.(emptyDesign()),
      run?.(emptyDesign()),
    ]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled", "fulfilled"]);
    expect(overlap).toBe(false);
    expect(sent).toEqual(["r1", "r2", "r3"]);
    const revisions = actions.flatMap((a) => (a.type === "set-design" ? [a.revision] : []));
    expect(revisions).toEqual(["r2", "r3", "r4"]);
  });
});

describe("a site styles edit shows before its save lands (W-536)", () => {
  function setup(respond: () => Promise<Response>) {
    const actions: EditorAction[] = [];
    const base = emptyDesign();
    let run: ((design: DesignSystem) => Promise<void>) | undefined;
    function Probe() {
      const latest = React.useRef({ designRevision: "r1", design: base } as unknown as EditorState);
      const commands = useEditorCommands({
        fetcher: () => respond(),
        collection: "emvb_pages",
        latest,
        dispatch: (action) => actions.push(action),
        saver: {} as ReturnType<typeof useSave>,
        toasts: { add: () => "" } as never,
      });
      run = commands.changeDesign;
      return null;
    }
    return {
      actions,
      base,
      mount: () => mount(<Probe />),
      run: (d: DesignSystem) => run?.(d) ?? Promise.reject(new Error("not mounted")),
    };
  }

  test("the edit is on screen at once, so the next edit builds on it (W-536)", async () => {
    let release: (() => void) | undefined;
    const t = setup(
      () =>
        new Promise((resolve) => {
          release = () => resolve(Response.json({ data: { revision: "r2" } }));
        }),
    );
    await t.mount();
    const first = { ...emptyDesign() } as DesignSystem;
    const saving = t.run(first);
    expect(t.actions[0]).toEqual({ type: "preview-design", design: first });
    await new Promise((resolve) => setTimeout(resolve, 0));
    release?.();
    await saving;
    expect(t.actions.at(-1)).toEqual({ type: "set-design", design: first, revision: "r2" });
  });

  test("an edit that fails to save is taken back (W-536)", async () => {
    const t = setup(async () => new Response("down", { status: 500 }));
    await t.mount();
    const first = { ...emptyDesign() } as DesignSystem;
    await expect(t.run(first)).rejects.toThrow("Couldn't save site styles");
    expect(t.actions).toEqual([
      { type: "preview-design", design: first },
      { type: "preview-design", design: t.base },
    ]);
  });
});

test("a refused save replayed while a newer edit waits keeps the newer edit on screen (W-536)", async () => {
  const base = emptyDesign();
  const card = (style: Record<string, unknown>) =>
    ({ ...emptyDesign(), classes: [{ id: "card", name: "Card", style }] }) as DesignSystem;
  const other = { ...emptyDesign(), classes: [{ id: "note", name: "Note", style: {} }] };
  let saves = 0;
  const fetcher: Fetcher = async (input) => {
    const url = String(input);
    if (url.endsWith("/design/draft")) {
      return Response.json({ data: { design: other, revision: "r5", unpublished: true } });
    }
    saves += 1;
    if (saves === 1) {
      return Response.json({ error: { code: "CONFLICT", message: "x" } }, { status: 409 });
    }
    return Response.json({ data: { revision: `r${5 + saves}` } });
  };
  const actions: EditorAction[] = [];
  let run: ((design: DesignSystem) => Promise<void>) | undefined;
  function Probe() {
    const latest = React.useRef({ designRevision: "r1", design: base } as unknown as EditorState);
    run = useEditorCommands({
      fetcher,
      collection: "emvb_pages",
      latest,
      dispatch: (action) => actions.push(action),
      saver: {} as ReturnType<typeof useSave>,
      toasts: { add: () => "" } as never,
    }).changeDesign;
    return null;
  }
  await mount(<Probe />);
  const first = card({ opacity: 0.5 });
  const second = card({ opacity: 0.5, cursor: "pointer" });
  await Promise.all([run?.(first), run?.(second)]);
  const shown = actions.filter((a) => a.type === "set-design" || a.type === "load-design");
  // The replay of `first` must not put a design without `second` back on screen.
  expect(shown.map((a) => (a.type === "set-design" ? a.design : null))).toEqual([second, second]);
});

test("a save sends the newest revision while the store shows an older one of this run (W-536)", async () => {
  let current = "r1";
  let next = 1;
  const sent: (string | null)[] = [];
  const fetcher: Fetcher = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { revision: string | null };
    sent.push(body.revision);
    if (body.revision !== current) {
      return Response.json({ error: { code: "CONFLICT", message: "x" } }, { status: 409 });
    }
    next += 1;
    current = `r${next}`;
    return Response.json({ data: { revision: current } });
  };
  const state = { designRevision: "r1", design: emptyDesign() } as unknown as EditorState;
  // The store renders each saved revision one save late, as when React lags behind the queue.
  let lagging: string | null = null;
  let run: ((design: DesignSystem) => Promise<void>) | undefined;
  function Probe() {
    const latest = React.useRef(state);
    run = useEditorCommands({
      fetcher,
      collection: "emvb_pages",
      latest,
      dispatch: (action) => {
        if (action.type !== "set-design") return;
        if (lagging) latest.current = { ...latest.current, designRevision: lagging };
        lagging = action.revision;
      },
      saver: {} as ReturnType<typeof useSave>,
      toasts: { add: () => "" } as never,
    }).changeDesign;
    return null;
  }
  await mount(<Probe />);
  await Promise.all([run?.(emptyDesign()), run?.(emptyDesign()), run?.(emptyDesign())]);
  expect(sent).toEqual(["r1", "r2", "r3"]);
});
