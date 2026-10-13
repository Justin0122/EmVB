import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { ELEMENT_DESCRIPTORS, type LayoutNode } from "../../../../core/index.ts";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { FieldControl } from "./FieldControl.tsx";
import { parseSources } from "./ImageSourcesField.tsx";

afterEach(cleanup);

const field = ELEMENT_DESCRIPTORS.find((d) => d.type === "image")?.fields.find(
  (f) => f.key === "sources",
);

async function commit(text: string, props: Record<string, unknown> = { src: "/a.jpg" }) {
  if (!field) throw new Error("no sources field");
  const node = { id: "img00001", type: "image", props } as LayoutNode;
  const sent: unknown[] = [];
  const host = await mount(
    <FieldControl
      field={field}
      node={node}
      onChange={(next) => sent.push((next.props as Record<string, unknown>)["sources"] ?? null)}
    />,
  );
  const area = host.querySelector("textarea") as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(area, text);
    area.dispatchEvent(new Event("input", { bubbles: true }));
    area.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  return { sent, area, host };
}

describe("image extra sources are editable (W-397)", () => {
  test("the image panel lists the field", () => {
    expect(field?.kind).toBe("image-sources");
  });

  test("lines become sources, with or without the w", async () => {
    const { sent } = await commit("/a-480.jpg 480\n\n https://cdn.example/a-1600.jpg 1600w ");
    expect(sent).toEqual([
      [
        { src: "/a-480.jpg", width: 480 },
        { src: "https://cdn.example/a-1600.jpg", width: 1600 },
      ],
    ]);
  });

  test("stored sources show one per line and clearing removes them", async () => {
    const { area, sent } = await commit("", {
      src: "/a.jpg",
      sources: [{ src: "/a-480.jpg", width: 480 }],
    });
    expect(sent).toEqual([null]);
    expect(area.value).toBe("");
  });

  test("bad lines stay in the field with a reason", async () => {
    for (const bad of [
      "/a.jpg",
      "/a.jpg 0",
      "/a.jpg 9000",
      "javascript:alert(1) 400",
      Array.from({ length: 7 }, (_, i) => `/a${i}.jpg ${i + 1}`).join("\n"),
    ]) {
      expect("error" in parseSources(bad)).toBe(true);
      // oxlint-disable-next-line no-await-in-loop -- one mounted field at a time
      const result = await commit(bad);
      expect(result.sent).toEqual([]);
      expect(result.area.getAttribute("aria-invalid")).toBe("true");
      expect(result.host.querySelector("[data-emvb-sources-error]")).not.toBeNull();
      // oxlint-disable-next-line no-await-in-loop
      await cleanup();
    }
  });
});
