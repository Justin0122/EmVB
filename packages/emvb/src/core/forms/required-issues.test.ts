import { describe, expect, test } from "bun:test";
import type { LayoutNode } from "../schema/layout.ts";
import { requiredFieldIssues, requiredFieldIssueText } from "./binding.ts";

const input = (id: string, field: string, hiddenOn?: string[]) =>
  ({
    id,
    type: "text-input",
    props: { field, label: field },
    ...(hiddenOn ? { hiddenOn } : {}),
  }) as LayoutNode;

const form = (children: LayoutNode[], hiddenOn?: string[]) =>
  ({
    id: "form0001",
    type: "form",
    props: { formId: "contact" },
    children,
    ...(hiddenOn ? { hiddenOn } : {}),
  }) as LayoutNode;

const fields = [
  { name: "email", label: "Email", required: true },
  { name: "phone", label: "Phone", required: true },
  { name: "note", label: "Note", required: false },
];

describe("required fields visitors can't fill (W-511)", () => {
  test("a required field with no control is missing", () => {
    const issues = requiredFieldIssues(form([input("inp00001", "email")]), fields);
    expect(issues).toEqual([
      { kind: "missing", formNodeId: "form0001", field: "phone", label: "Phone" },
    ]);
    expect(requiredFieldIssueText(issues[0] as never)).toContain("“Phone” is required");
  });

  test("a required field hidden on mobile, itself or through a box, is reported for mobile", () => {
    const box = {
      id: "box00001",
      type: "container",
      props: {},
      hiddenOn: ["mobile"],
      children: [input("inp00002", "phone")],
    } as LayoutNode;
    const issues = requiredFieldIssues(
      form([input("inp00001", "email", ["tablet", "mobile"]), box]),
      fields,
    );
    expect(issues.map((i) => i.kind === "hidden" && [i.field, i.nodeId, i.devices])).toEqual([
      ["email", "inp00001", ["tablet", "mobile"]],
      ["phone", "inp00002", ["mobile"]],
    ]);
    expect(requiredFieldIssueText(issues[0] as never)).toContain("hidden on tablet and mobile");
  });

  test("a field shown by another control on that device, an optional field, or a hidden form is fine", () => {
    const issues = requiredFieldIssues(
      form(
        [
          input("inp00001", "email", ["mobile"]),
          input("inp00002", "email", ["desktop"]),
          input("inp00003", "phone"),
          input("inp00004", "note", ["mobile"]),
        ],
        ["mobile"],
      ),
      fields,
    );
    expect(issues).toEqual([]);
  });
});
