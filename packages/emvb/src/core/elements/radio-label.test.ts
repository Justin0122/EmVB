import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { renderPage } from "../render/index.ts";

describe("radio group is named by its label (W-442)", () => {
  test("the fieldset points at the label, which points at nothing", () => {
    const html = renderPage(
      {
        schemaVersion: 15,
        root: {
          id: "root0001",
          type: "container",
          props: {},
          children: [
            {
              id: "form0001",
              type: "form",
              props: { formId: "f1" },
              children: [
                { id: "radi0001", type: "radio", props: { field: "plan", label: "Plan" } },
              ],
            },
          ],
        },
      } as unknown as Layout,
      emptyDesign(),
    ).html;
    expect(html).toContain(
      '<label class="emvb-form-label" id="emvb-field-radi0001-label">Plan</label>',
    );
    expect(html).toContain(
      '<fieldset class="emvb-radio-group" aria-labelledby="emvb-field-radi0001-label">',
    );
    expect(html).not.toContain('for="emvb-field-radi0001"');
  });
});
