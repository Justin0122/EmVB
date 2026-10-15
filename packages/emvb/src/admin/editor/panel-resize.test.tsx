import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import { cleanup, mount } from "../../../test/dom/mount.ts";
import { PANEL_SIZES, PanelResizer, usePanelWidths } from "./panel-resize.tsx";

afterEach(cleanup);
beforeEach(() => localStorage.clear());

function Frame() {
  const panels = usePanelWidths();
  const frame = React.useRef<HTMLDivElement>(null);
  return (
    <div ref={frame} data-widths={`${panels.widths.left},${panels.widths.right}`}>
      <PanelResizer side="left" widths={panels.widths} frame={frame} onResize={panels.set} />
      <PanelResizer side="right" widths={panels.widths} frame={frame} onResize={panels.set} />
    </div>
  );
}

const key = async (host: HTMLElement, side: string, k: string, shiftKey = false) => {
  await act(async () => {
    host
      .querySelector(`[data-emvb-panel-resizer="${side}"]`)
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: k, shiftKey, bubbles: true }));
  });
};
const widths = (host: HTMLElement) =>
  host.querySelector("[data-widths]")?.getAttribute("data-widths");

describe("resizable side panels", () => {
  test("arrow keys widen toward the canvas and narrow away from it, within the limits", async () => {
    const host = await mount(<Frame />);
    expect(widths(host)).toBe("256,288");
    await key(host, "left", "ArrowRight");
    await key(host, "right", "ArrowLeft", true);
    expect(widths(host)).toBe("272,352");
    await key(host, "left", "Home");
    await key(host, "right", "End");
    expect(widths(host)).toBe(`${PANEL_SIZES.left.min},${PANEL_SIZES.right.max}`);
  });

  test("double-click resets a panel; widths are remembered", async () => {
    const host = await mount(<Frame />);
    await key(host, "left", "End");
    expect(JSON.parse(localStorage.getItem("emvb-panel-widths") ?? "{}").left).toBe(480);
    await cleanup();
    const again = await mount(<Frame />);
    expect(widths(again)).toBe("480,288");
    await act(async () => {
      again
        .querySelector('[data-emvb-panel-resizer="left"]')
        ?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(widths(again)).toBe("256,288");
  });

  test("a stored width out of range is brought back inside it", async () => {
    localStorage.setItem("emvb-panel-widths", JSON.stringify({ left: 5, right: 9999 }));
    const host = await mount(<Frame />);
    expect(widths(host)).toBe(`${PANEL_SIZES.left.min},${PANEL_SIZES.right.max}`);
  });
});
