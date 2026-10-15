import { expect, test } from "bun:test";
import { uniqueId } from "./site-list.tsx";

test("a long name's id doesn't end in a hyphen (W-548)", () => {
  const id = uniqueId("Primary brand colour for headings x", "color", []);
  expect(id).toBe("primary-brand-colour-for-headings");
  expect(uniqueId("Primary brand colour for headings x", "color", [id])).toBe(`${id}-2`);
});
