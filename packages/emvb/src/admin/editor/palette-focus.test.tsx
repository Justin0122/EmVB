import { afterEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import { cleanup, mount } from "../../../test/dom/mount.ts";
import { CommandPalette } from "./CommandPalette.tsx";
import type { PaletteItem } from "./palette.ts";

afterEach(cleanup);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let setOpen: (open: boolean) => void = () => {};

function Harness({ items }: { items: PaletteItem[] }) {
  const [open, setState] = React.useState(false);
  setOpen = setState;
  return (
    <>
      <button type="button" data-start="">
        Start
      </button>
      <button type="button" className="emvb-layer-select" aria-current="true" data-layer="">
        Layer
      </button>
      <CommandPalette open={open} onOpenChange={setState} items={items} />
    </>
  );
}

async function openFrom(items: PaletteItem[]) {
  const host = await mount(<Harness items={items} />);
  const start = host.querySelector<HTMLElement>("[data-start]") as HTMLElement;
  start.focus();
  await act(async () => {
    setOpen(true);
    await wait(20);
  });
  return { host, start };
}

describe("focus after the command palette closes (W-399)", () => {
  test("Esc goes back to what had focus, not <body>", async () => {
    const { start } = await openFrom([]);
    const input = document.querySelector<HTMLInputElement>("[data-emvb-palette-input]");
    expect(document.activeElement).toBe(input);
    await act(async () => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await wait(120);
    });
    expect(document.activeElement).toBe(start);
  });

  test("a jump that leaves focus nowhere lands on the selected layer", async () => {
    const items: PaletteItem[] = [
      {
        id: "find:x",
        group: "Find text",
        label: "Jump",
        run: () => (document.activeElement as HTMLElement | null)?.blur(),
      },
    ];
    const { host } = await openFrom(items);
    const input = document.querySelector<HTMLInputElement>("[data-emvb-palette-input]");
    await act(async () => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await wait(120);
    });
    expect(document.activeElement).toBe(host.querySelector("[data-layer]"));
  });
});
