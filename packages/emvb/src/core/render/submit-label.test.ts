import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { renderPage } from "./index.ts";

const html = (label: string) =>
  renderPage(
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
            children: [{ id: "subm0001", type: "submit", props: { label } }],
          },
        ],
      },
    } as unknown as Layout,
    emptyDesign(),
  ).html;

describe("a blank Submit label (W-447)", () => {
  test("falls back to Submit on the button and for the forms client", () => {
    const out = html("  ");
    expect(out).toContain('type="submit">Submit</button>');
    expect(out).toContain('data-submit-label="Submit"');
  });
  test("a set label is kept, trimmed", () => {
    expect(html(" Send ")).toContain('type="submit">Send</button>');
  });
});
