import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { ELEMENT_DESCRIPTORS, type LayoutNode } from "../../../../core/index.ts";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { DraftTextField } from "./DraftTextField.tsx";

afterEach(cleanup);

const tracks = ELEMENT_DESCRIPTORS.find((d) => d.type === "grid")?.fields.find(
  (f) => f.key === "columnTracks",
);

async function commit(text: string) {
  if (!tracks) throw new Error("no columnTracks field");
  const node = { id: "grid0001", type: "grid", props: { columns: 2 }, children: [] } as LayoutNode;
  const sent: unknown[] = [];
  const host = await mount(
    <DraftTextField
      field={tracks}
      node={node}
      onChange={(next) => sent.push((next.props as Record<string, unknown>)["columnTracks"])}
    />,
  );
  const area = host.querySelector("textarea") as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(area, text);
    area.dispatchEvent(new Event("input", { bubbles: true }));
    area.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  return { sent, error: host.querySelector("[data-emvb-field-error]")?.textContent ?? null, area };
}

describe("custom grid tracks are checked in the field (W-394)", () => {
  test("valid tracks are stored", async () => {
    expect((await commit("1fr\n200px\nauto")).sent).toEqual([["1fr", "200px", "auto"]]);
  });

  test("a track the schema refuses stays in the field with the hint", async () => {
    for (const bad of ["1fr\n4fr", "1FR", Array.from({ length: 13 }, () => "1fr").join("\n")]) {
      // oxlint-disable-next-line no-await-in-loop -- one mounted field at a time
      const result = await commit(bad);
      expect(result.sent).toEqual([]);
      expect(result.error).toContain("Up to 12 tracks, one per line");
      expect(result.area.getAttribute("aria-invalid")).toBe("true");
      // oxlint-disable-next-line no-await-in-loop
      await cleanup();
    }
  });
});
