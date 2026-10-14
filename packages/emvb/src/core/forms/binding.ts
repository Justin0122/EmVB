import { isFormNode, type Layout, type LayoutNode } from "../schema/layout.ts";
import { forEachNode, nodeChildren, someNode } from "../tree-ops.ts";
import { fieldsOf, type FormDefinitions } from "./definition.ts";

export type MissingRequiredField = {
  formNodeId: string;
  formId: string;
  field: string;
};

function boundFields(form: LayoutNode): Set<string> {
  const names = new Set<string>();
  forEachNode(form, (node) => {
    if (
      node.type === "text-input" ||
      node.type === "textarea" ||
      node.type === "select" ||
      node.type === "checkbox" ||
      node.type === "radio"
    ) {
      const field = (node.props as { field?: string }).field;
      if (field) names.add(field);
    }
  });
  return names;
}

/**
 * Required fields on the forms-plugin definition that have no EmVB input bound (R-040).
 */
export function findMissingRequiredFields(
  layout: Layout,
  definitions: FormDefinitions,
): MissingRequiredField[] {
  const missing: MissingRequiredField[] = [];
  forEachNode(layout.root, (node) => {
    if (!isFormNode(node) || !node.props.formId) return;
    const definition = definitions.get(node.props.formId);
    if (!definition) return;
    const bound = boundFields(node);
    for (const field of fieldsOf(definition)) {
      if (field.required && !bound.has(field.name)) {
        missing.push({ formNodeId: node.id, formId: node.props.formId, field: field.name });
      }
    }
  });
  return missing;
}

export function layoutHasForm(layout: Layout): boolean {
  return someNode(layout.root, (node) => isFormNode(node) && node.props.formId.trim() !== "");
}

/** A field as the forms plugin defines it; only what the checks below read. */
export type RequiredFieldInfo = { name: string; label: string; required: boolean };

/**
 * A required field visitors can't fill (W-511): `missing` has no control in the form; `hidden`
 * has its controls hidden on some device, where the form then can never be sent (the forms
 * client checks the hidden control and writes its error where nobody sees it).
 */
export type RequiredFieldIssue =
  | { kind: "missing"; formNodeId: string; field: string; label: string }
  | {
      kind: "hidden";
      formNodeId: string;
      field: string;
      label: string;
      /** The bound control (the first one, when the field is bound more than once). */
      nodeId: string;
      devices: string[];
    };

const FIELD_TYPES = new Set(["text-input", "textarea", "select", "checkbox", "radio"]);
const DEVICE_ORDER = ["desktop", "tablet", "mobile"];

/** Each bound field's controls, with the devices each is hidden on (itself or an ancestor). */
function boundControls(form: LayoutNode): Map<string, { nodeId: string; hidden: Set<string> }[]> {
  const found = new Map<string, { nodeId: string; hidden: Set<string> }[]>();
  const walk = (node: LayoutNode, inherited: ReadonlySet<string>) => {
    const own = (node as { hiddenOn?: readonly string[] }).hiddenOn ?? [];
    const hidden = own.length ? new Set([...inherited, ...own]) : inherited;
    if (FIELD_TYPES.has(node.type)) {
      const field = (node.props as { field?: unknown }).field;
      if (typeof field === "string" && field) {
        found.set(field, [
          ...(found.get(field) ?? []),
          { nodeId: node.id, hidden: new Set(hidden) },
        ]);
      }
    }
    for (const child of nodeChildren(node)) walk(child, hidden);
  };
  // The form's own hiddenOn hides the whole form there, which loses no answers: not counted.
  for (const child of nodeChildren(form)) walk(child, new Set());
  return found;
}

/** W-511: required fields of the form element's definition that visitors can't fill. */
export function requiredFieldIssues(
  form: LayoutNode,
  fields: readonly RequiredFieldInfo[],
): RequiredFieldIssue[] {
  const controls = boundControls(form);
  const issues: RequiredFieldIssue[] = [];
  for (const field of fields) {
    if (!field.required) continue;
    const label = field.label.trim() || field.name;
    const bound = controls.get(field.name);
    if (!bound?.length) {
      issues.push({ kind: "missing", formNodeId: form.id, field: field.name, label });
      continue;
    }
    // Hidden on a device only when every control for the field is hidden there.
    const devices = DEVICE_ORDER.filter((device) => bound.every((c) => c.hidden.has(device)));
    if (devices.length) {
      issues.push({
        kind: "hidden",
        formNodeId: form.id,
        field: field.name,
        label,
        nodeId: (bound[0] as { nodeId: string }).nodeId,
        devices,
      });
    }
  }
  return issues;
}

/** The sentence the editor and describe_page show for one issue (W-511). */
export function requiredFieldIssueText(issue: RequiredFieldIssue): string {
  if (issue.kind === "missing") {
    return `“${issue.label}” is required by the form but has no field here, so the form can't be sent. Add a field bound to ${issue.field}, or make it optional in Forms.`;
  }
  const where =
    issue.devices.length === 3 ? "on every device" : `on ${issue.devices.join(" and ")}`;
  return `“${issue.label}” is required but hidden ${where}, so visitors there can't send the form. Show the field there, or make it optional in Forms.`;
}
