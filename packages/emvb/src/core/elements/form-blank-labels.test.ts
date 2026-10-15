import { expect, test } from "bun:test";
import type { CheckboxNode, RadioNode, TextInputNode } from "../schema/layout.ts";
import { checkbox, radio, textInput } from "./form-elements.ts";

const text = (v: unknown): string => JSON.stringify(v);

// W-587: a blank or spaces-only label left a checkbox with no accessible name, and a text field
// or radio group with an empty <label>/<legend>. A blank label falls back like an unset one.
test("a blank checkbox label falls back to the field name (W-587)", () => {
  for (const label of ["", "   "]) {
    const node = {
      id: "cb000001",
      type: "checkbox",
      props: { field: "agree", label },
    } as CheckboxNode;
    expect(text(checkbox.build(node, {}, []))).toContain(" agree");
  }
});

test("a blank text or radio label renders no empty label (W-587)", () => {
  const input = {
    id: "ti000001",
    type: "text-input",
    props: { field: "name", label: "  " },
  } as TextInputNode;
  expect(text(textInput.build(input, {}, []))).not.toContain('"label"');
  const group = {
    id: "ra000001",
    type: "radio",
    props: { field: "opt", label: "  " },
  } as RadioNode;
  expect(text(radio.build(group, {}, []))).not.toContain('"legend"');
});
