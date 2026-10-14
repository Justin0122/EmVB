import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, mount, rerender, settle } from "../../../test/dom/mount.ts";
import { BlurFocus } from "./BlurFocus.tsx";

afterEach(cleanup);

describe("the blur tool's sharp spot (W-484)", () => {
  test("is a labelled slider the arrow keys move, one undo step per key", async () => {
    const log: [string, { centerX: number; centerY: number }][] = [];
    let center = { centerX: 0.5, centerY: 0.5 };
    const render = () => (
      <BlurFocus
        {...center}
        onChange={(next) => {
          center = next;
          log.push(["change", next]);
        }}
        onCommit={(next) => log.push(["commit", next])}
      />
    );
    await mount(render());
    const handle = document.querySelector<HTMLElement>("[data-emvb-image-blur-focus]");
    expect(handle?.getAttribute("role")).toBe("slider");
    expect(handle?.getAttribute("aria-label")).toBe("Sharp spot (blur center)");
    expect(handle?.getAttribute("aria-valuetext")).toBe("50% across, 50% down");
    expect(handle?.tabIndex).toBe(0);
    handle?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    handle?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", shiftKey: true, bubbles: true }),
    );
    expect(log).toEqual([
      ["change", { centerX: 0.51, centerY: 0.5 }],
      ["change", { centerX: 0.5, centerY: 0.4 }],
    ]);
    await rerender(render());
    await settle();
    handle?.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowUp", bubbles: true }));
    expect(log.at(-1)?.[0]).toBe("commit");
    handle?.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(log.at(-1)).toEqual(["commit", { centerX: 0.5, centerY: 0.5 }]);
  });
});
