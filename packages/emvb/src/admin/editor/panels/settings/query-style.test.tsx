import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { LayoutNode } from "../../../../core/index.ts";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { ContainerQueryFields } from "./AdvancedFields.tsx";
import { formatStyleValue, parseStyleValue } from "./query-style.ts";

afterEach(cleanup);

const box = (query?: LayoutNode["query"]) =>
  ({ id: "box00001", type: "container", props: {}, children: [], query }) as LayoutNode;

function type(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set?.call(el, value);
  el.dispatchEvent(
    new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
  );
}

async function panel(query: LayoutNode["query"]) {
  const sent: LayoutNode[] = [];
  const host = await mount(
    <ContainerQueryFields node={box(query)} onChange={(n) => sent.push(n)} />,
  );
  return { host, sent };
}

describe("container-query styles are edited field by field (W-398)", () => {
  test("values read and parse per property", () => {
    expect(formatStyleValue({ value: 16, unit: "px" })).toBe("16px");
    expect(formatStyleValue({ var: "space-4" })).toBe("var(--space-4)");
    expect(parseStyleValue("paddingTop", "24px")).toEqual({ value: { value: 24, unit: "px" } });
    expect(parseStyleValue("width", "auto")).toEqual({ value: "auto" });
    expect(parseStyleValue("gridColumnSpan", "3")).toEqual({ value: 3 });
    expect(parseStyleValue("flexDirection", "row")).toEqual({ value: "row" });
    expect("error" in parseStyleValue("flexDirection", "sideways")).toBe(true);
    expect("error" in parseStyleValue("notAKey", "1px")).toBe(true);
  });

  test("a row edits one property and keeps the others", async () => {
    const { host, sent } = await panel({
      min: 480,
      style: { flexDirection: "row", paddingTop: { value: 8, unit: "px" } },
    });
    const input = host.querySelector<HTMLInputElement>('[data-emvb-query-key="paddingTop"] input');
    expect(input?.value).toBe("8px");
    await act(async () => {
      type(input as HTMLInputElement, "24px");
      input?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(sent.at(-1)?.query).toEqual({
      min: 480,
      style: { flexDirection: "row", paddingTop: { value: 24, unit: "px" } },
    });
  });

  test("a bad value stays with a reason; Remove deletes one property", async () => {
    const { host, sent } = await panel({ min: 480, style: { flexDirection: "row" } });
    const input = host.querySelector<HTMLInputElement>(
      '[data-emvb-query-key="flexDirection"] input',
    );
    await act(async () => {
      type(input as HTMLInputElement, "sideways");
      input?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(sent).toEqual([]);
    expect(host.querySelector("[data-emvb-query-error]")?.textContent).toContain("sideways");
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[aria-label="Remove flexDirection"]')?.click();
    });
    expect(sent.at(-1)?.query).toEqual({ min: 480, style: {} });
  });

  test("Add style stores a new property", async () => {
    const { host, sent } = await panel({ min: 600, style: {} });
    const add = host.querySelector("[data-emvb-query-add]") as HTMLElement;
    await act(async () => {
      type(add.querySelector("select") as HTMLSelectElement, "gap");
    });
    await act(async () => {
      type(add.querySelector("input") as HTMLInputElement, "2rem");
    });
    await act(async () => {
      [...add.querySelectorAll("button")].find((b) => b.textContent === "Add style")?.click();
    });
    expect(sent.at(-1)?.query).toEqual({ min: 600, style: { gap: { value: 2, unit: "rem" } } });
  });

  test("a text element gets the query styles but not the container switch", async () => {
    const text = {
      id: "text0001",
      type: "text",
      props: { text: "q" },
      query: { min: 600, style: { color: "#ff0000" } },
    } as LayoutNode;
    const host = await mount(<ContainerQueryFields node={text} onChange={() => {}} />);
    expect(host.querySelector('[data-emvb-query-key="color"] input')).not.toBeNull();
    expect(host.querySelector('input[type="checkbox"]')).toBeNull();
  });
});

describe("the container width is a draft (W-401)", () => {
  test("clearing it to retype keeps the styles until blur", async () => {
    const { host, sent } = await panel({ min: 480, style: { flexDirection: "row" } });
    const input = host.querySelector<HTMLInputElement>("[data-emvb-query-min]") as HTMLInputElement;
    await act(async () => {
      type(input, "");
    });
    await act(async () => {
      type(input, "720");
    });
    expect(sent).toEqual([]);
    await act(async () => {
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(sent.at(-1)?.query).toEqual({ min: 720, style: { flexDirection: "row" } });
  });

  test("an out-of-range width stays with a hint", async () => {
    const { host, sent } = await panel({ min: 480, style: {} });
    const input = host.querySelector<HTMLInputElement>("[data-emvb-query-min]") as HTMLInputElement;
    await act(async () => {
      type(input, "5000");
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(sent).toEqual([]);
    expect(host.textContent).toContain("1 to 3840");
  });
});

describe("copying the style asks before replacing query styles (W-402)", () => {
  const click = async (host: HTMLElement, text: string) =>
    act(async () => {
      [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)?.click();
    });

  test("edited query styles need a confirm; Keep them leaves them", async () => {
    const { host, sent } = await panel({ min: 480, style: { flexDirection: "row" } });
    await click(host, "Use current style at that width");
    expect(sent).toEqual([]);
    expect(host.querySelector("[data-emvb-query-confirm]")).not.toBeNull();
    await click(host, "Keep them");
    expect(sent).toEqual([]);
    expect(host.querySelector("[data-emvb-query-confirm]")).toBeNull();
    await click(host, "Use current style at that width");
    await click(host, "Replace");
    expect(sent.at(-1)?.query).toEqual({ min: 480, style: {} });
  });

  test("empty query styles are copied straight away", async () => {
    const { host, sent } = await panel({ min: 480, style: {} });
    await click(host, "Use current style at that width");
    expect(sent.length).toBe(1);
  });
});

describe("query style values are read like the Style tab (W-404)", () => {
  test("a bare number on a length means px, and keywords ignore case", () => {
    expect(parseStyleValue("paddingTop", "16")).toEqual({ value: { value: 16, unit: "px" } });
    expect(parseStyleValue("paddingTop", "0")).toEqual({ value: { value: 0, unit: "px" } });
    expect(parseStyleValue("zIndex", "10")).toEqual({ value: 10 });
    expect(parseStyleValue("width", "AUTO")).toEqual({ value: "auto" });
  });
});
