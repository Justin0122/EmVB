import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { ELEMENT_DESCRIPTORS, type LayoutNode } from "../../../../core/index.ts";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { DraftTextField } from "./DraftTextField.tsx";

afterEach(cleanup);

const fieldOf = (type: string, key: string) => {
  const field = ELEMENT_DESCRIPTORS.find((d) => d.type === type)?.fields.find((f) => f.key === key);
  if (!field) throw new Error(`no ${type}.${key}`);
  return field;
};

async function commit(type: string, key: string, value: string) {
  const field = fieldOf(type, key);
  const node = { id: "node0001", type, props: {} } as unknown as LayoutNode;
  const sent: unknown[] = [];
  const host = await mount(
    <DraftTextField
      field={field}
      node={node}
      onChange={(next) => sent.push((next.props as Record<string, unknown>)[key])}
    />,
  );
  const input = host.querySelector("input") as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  return { sent, text: host.textContent ?? "" };
}

describe("fields that start at 0 and stop at the schema maximum (W-388)", () => {
  test("a focal point of 0 % is stored; 101 % is refused before save", async () => {
    expect((await commit("image", "focalX", "0")).sent).toEqual([0]);
    const over = await commit("image", "focalY", "101");
    expect(over.sent).toEqual([]);
    expect(over.text).toContain("Enter a whole number from 0 to 100.");
  });

  test("a button icon gap of 0 is stored; 65 is refused", async () => {
    expect((await commit("button", "iconGap", "0")).sent).toEqual([0]);
    expect((await commit("button", "iconGap", "65")).sent).toEqual([]);
  });

  test("other whole-number fields still start at 1", async () => {
    expect((await commit("image", "width", "0")).sent).toEqual([]);
  });
});
