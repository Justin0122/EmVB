/** Minimal public form definition (forms-plugin `definition` route). */
export type PublicFormField = {
  name: string;
  type: string;
  label: string;
  required: boolean;
  options?: ReadonlyArray<{ label: string; value: string }>;
  placeholder?: string;
  /** Constraints the forms plugin's own embed puts on the control (W-297). */
  validation?: PublicFieldValidation;
};

/** The constraint subset the renderer can apply; anything else is ignored. */
export type PublicFieldValidation = {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
};

export type PublicFormDefinition = {
  name: string;
  slug: string;
  status: string;
  pages: ReadonlyArray<{ fields: ReadonlyArray<PublicFormField> }>;
  settings: {
    spamProtection?: string;
    submitLabel?: string;
  };
};

export type FormDefinitions = ReadonlyMap<string, PublicFormDefinition>;

export function fieldsOf(definition: PublicFormDefinition): PublicFormField[] {
  return definition.pages.flatMap((page) => [...page.fields]);
}

export function fieldByName(
  definition: PublicFormDefinition | undefined,
  name: string,
): PublicFormField | undefined {
  if (!definition) return undefined;
  return fieldsOf(definition).find((field) => field.name === name);
}

/** W-577: a field whose limits no answer can meet (min above max), so the form can't be sent. */
export type ImpossibleRangeField = { name: string; label: string; kind: "length" | "value" };

const above = (lo: unknown, hi: unknown) =>
  typeof lo === "number" && typeof hi === "number" && lo > hi;

export function impossibleRangeFields(
  fields: ReadonlyArray<{ name: string; label: string; validation?: unknown }>,
): ImpossibleRangeField[] {
  const found: ImpossibleRangeField[] = [];
  for (const field of fields) {
    const v = field.validation;
    if (!v || typeof v !== "object") continue;
    const { minLength, maxLength, min, max } = v as Record<string, unknown>;
    const label = field.label.trim() || field.name;
    if (above(minLength, maxLength)) found.push({ name: field.name, label, kind: "length" });
    else if (above(min, max)) found.push({ name: field.name, label, kind: "value" });
  }
  return found;
}

/**
 * W-579: a control that can't send any answer its field accepts. A field with a fixed list of
 * options (select, radio, checkbox group) is refused by the forms plugin unless the value is one
 * of them, so a Text input, Textarea or Checkbox bound to it makes the form unsendable.
 */
export type MismatchedControl = { nodeId: string; name: string; label: string; fieldType: string };

const OPTION_TYPES = new Set(["select", "radio", "checkbox-group"]);
const FREE_CONTROLS = new Set(["text-input", "textarea", "checkbox"]);

type ControlLike = { id: string; type: string; props: unknown; children?: readonly ControlLike[] };

export function mismatchedControls(
  form: ControlLike,
  fields: ReadonlyArray<{
    name: string;
    type: string;
    label: string;
    options?: readonly unknown[];
  }>,
): MismatchedControl[] {
  const byName = new Map(fields.map((field) => [field.name, field]));
  const found: MismatchedControl[] = [];
  const visit = (node: ControlLike) => {
    if (FREE_CONTROLS.has(node.type)) {
      const name = (node.props as { field?: unknown }).field;
      const field = typeof name === "string" ? byName.get(name) : undefined;
      if (field && OPTION_TYPES.has(field.type) && (field.options?.length ?? 0) > 0) {
        found.push({
          nodeId: node.id,
          name: field.name,
          label: field.label.trim() || field.name,
          fieldType: field.type,
        });
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  for (const child of form.children ?? []) visit(child);
  return found;
}
