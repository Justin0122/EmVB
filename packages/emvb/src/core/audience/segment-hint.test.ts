import { describe, expect, test } from "bun:test";
import type { Layout } from "../schema/layout.ts";
import { validateLayout } from "../validate.ts";

const withSegments = (segments: string[]) =>
  ({
    schemaVersion: 15,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [{ id: "txt00001", type: "text", props: { text: "x" }, audience: { segments } }],
    },
  }) as unknown as Layout;

describe("segment name message (W-393)", () => {
  test("a colon is valid and the refusal message says so", () => {
    expect(validateLayout(withSegments(["plan:pro"])).ok).toBe(true);
    const refused = validateLayout(withSegments(["Plan Pro"]));
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.issues[0]?.message).toContain(":, - or _");
  });
});
