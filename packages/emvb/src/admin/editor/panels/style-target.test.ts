import { describe, expect, test } from "bun:test";
import { emptyDesign, type LayoutNode } from "../../../core/index.ts";
import { applyStylePatch, styleTarget, type StyleSlot } from "./style-target.ts";

const node = { id: "head0001", type: "heading", props: { text: "Hi", level: 2 } } as LayoutNode;

const cases: Array<{
  classId: string | null;
  device: "desktop" | "tablet" | "mobile";
  state: "normal" | "hover";
  slot: StyleSlot["slot"];
}> = [
  { classId: null, device: "desktop", state: "normal", slot: "style" },
  { classId: null, device: "desktop", state: "hover", slot: "state" },
  { classId: null, device: "tablet", state: "normal", slot: "device" },
  { classId: null, device: "mobile", state: "hover", slot: "device" },
  { classId: "card", device: "desktop", state: "normal", slot: "style" },
  { classId: "card", device: "desktop", state: "hover", slot: "state" },
  { classId: "card", device: "tablet", state: "hover", slot: "device" },
];

describe("style patch target (W-364)", () => {
  test("device, class and state pick one slot", () => {
    for (const row of cases) {
      const target = styleTarget(row);
      expect(`${row.classId ?? "element"} ${row.device} ${row.state} -> ${target.slot}`).toBe(
        `${row.classId ?? "element"} ${row.device} ${row.state} -> ${row.slot}`,
      );
      expect(target.owner).toBe(row.classId ? "class" : "element");
    }
  });

  test("a tablet patch stays on the tablet slot", () => {
    const written = applyStylePatch({
      node,
      design: emptyDesign(),
      classId: null,
      device: "tablet",
      state: "normal",
      patch: { color: "#112233" },
    });
    expect(written.kind).toBe("node");
    const styled = written.kind === "node" ? written.node : null;
    expect(styled?.devices?.tablet?.color).toBe("#112233");
    expect(styled?.style?.color).toBeUndefined();
  });
});
