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
