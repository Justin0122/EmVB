import { describe, expect, test } from "bun:test";
import { ELEMENT_DESCRIPTORS } from "../../core/index.ts";
import { ELEMENT_ICONS } from "./element-chrome.ts";

describe("element chrome (W-361)", () => {
  test("every element type has an icon", () => {
    const missing = ELEMENT_DESCRIPTORS.map((descriptor) => descriptor.type).filter(
      (type) => ELEMENT_ICONS[type] === undefined,
    );
    expect(missing).toEqual([]);
  });
});
