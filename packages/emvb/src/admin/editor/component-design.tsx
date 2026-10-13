import { Button, Input, Select } from "@cloudflare/kumo";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import * as React from "react";
import {
  COMPONENT_FIELD_KINDS,
  type ComponentField,
  type ComponentFieldKind,
  type ComponentFieldsDoc,
  type Layout,
  type LayoutNode,
} from "../../core/index.ts";
import { BUTTON, FIELD } from "../ui.ts";

/**
 * W-316: designing a Component in Theme Builder: its field list (in the part's settings) and,
 * per element, which of its props take a field's value.
 */

/** The fields of the Component being edited; null when the open part isn't a Component. */
export const ComponentDesignContext = React.createContext<ComponentField[] | null>(null);

const KIND_LABELS: Record<ComponentFieldKind, string> = {
  text: "Text",
  "rich-text": "Rich text",
  image: "Image",
  link: "Link",
  select: "Choice",
  toggle: "Yes / no",
  list: "List of items",
};
type LeafKind = Exclude<ComponentFieldKind, "list">;
const LEAF_KINDS = COMPONENT_FIELD_KINDS.filter((k): k is LeafKind => k !== "list");

/** A key from a label: lowercase letters, digits and underscores, starting with a letter. */
export function keyFromLabel(label: string, taken: readonly string[]): string {
  const base =
    label
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^[^a-z]+/, "")
      .slice(0, 36) || "field";
  let key = base;
  for (let n = 2; taken.includes(key); n++) key = `${base}_${n}`;
  return key;
}

function newField(kind: ComponentFieldKind, taken: readonly string[]): ComponentField {
  const label = KIND_LABELS[kind];
  const key = keyFromLabel(label, taken);
  if (kind === "select")
    return { key, label, kind, options: [{ value: "option-1", label: "Option 1" }] };
  if (kind === "list")
    return { key, label: "Items", kind, fields: [{ key: "title", label: "Title", kind: "text" }] };
  return { key, label, kind } as ComponentField;
}

/** The Component's field list (theme part settings). */
export function ComponentFieldsEditor({
  value,
  onChange,
}: {
  value: ComponentFieldsDoc | undefined;
  onChange: (doc: ComponentFieldsDoc) => void;
}) {
  const fields = value?.fields ?? [];
  const set = (next: ComponentField[]) => onChange({ schemaVersion: 1, fields: next });
  return (
    <section className="emvb-component-design" data-emvb-component-design="">
      <h3 className="emvb-section-title">Fields</h3>
      <p className="emvb-helper">
        What editors fill in where this component is used. Bind elements to these fields in their
        Content tab.
      </p>
      <FieldList fields={fields} kinds={COMPONENT_FIELD_KINDS} onChange={set} />
    </section>
  );
}

function FieldList({
  fields,
  kinds,
  onChange,
}: {
  fields: ComponentField[];
  kinds: readonly ComponentFieldKind[];
  onChange: (fields: ComponentField[]) => void;
}) {
  const [adding, setAdding] = React.useState<ComponentFieldKind>("text");
  const move = (from: number, to: number) => {
    const next = [...fields];
    const [field] = next.splice(from, 1);
    if (field) next.splice(to, 0, field);
    onChange(next);
  };
  return (
    <div className="emvb-component-list">
      {fields.map((field, index) => (
        <details
          key={`${field.key}-${index}`}
          className="emvb-component-item"
          data-emvb-design-field={field.key}
        >
          <summary>
            {field.label} <span className="emvb-muted">· {KIND_LABELS[field.kind]}</span>
          </summary>
          <div className="emvb-component-item-body">
            <FieldEditor
              field={field}
              taken={fields.filter((_, i) => i !== index).map((f) => f.key)}
              onChange={(next) => onChange(fields.map((f, i) => (i === index ? next : f)))}
            />
            <div className="emvb-component-item-actions">
              <Button
                variant="secondary"
                className={BUTTON}
                shape="square"
                aria-label="Move up"
                disabled={index === 0}
                icon={<ArrowUpIcon aria-hidden="true" />}
                onClick={() => move(index, index - 1)}
              />
              <Button
                variant="secondary"
                className={BUTTON}
                shape="square"
                aria-label="Move down"
                disabled={index === fields.length - 1}
                icon={<ArrowDownIcon aria-hidden="true" />}
                onClick={() => move(index, index + 1)}
              />
              <Button
                variant="secondary"
                className={BUTTON}
                shape="square"
                aria-label={`Remove ${field.label}`}
                icon={<TrashIcon aria-hidden="true" />}
                onClick={() => onChange(fields.filter((_, i) => i !== index))}
              />
            </div>
          </div>
        </details>
      ))}
      <div className="emvb-component-add">
        <Select
          label="New field"
          className={FIELD}
          value={adding}
          onValueChange={(v) => setAdding(v as ComponentFieldKind)}
          renderValue={(v: unknown) => KIND_LABELS[v as ComponentFieldKind]}
        >
          {kinds.map((kind) => (
            <Select.Option key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </Select.Option>
          ))}
        </Select>
        <Button
          variant="secondary"
          className={BUTTON}
          icon={<PlusIcon aria-hidden="true" />}
          disabled={fields.length >= 30}
          onClick={() =>
            onChange([
              ...fields,
              newField(
                adding,
                fields.map((f) => f.key),
              ),
            ])
          }
        >
          Add field
        </Button>
      </div>
    </div>
  );
}

function FieldEditor({
  field,
  taken,
  onChange,
}: {
  field: ComponentField;
  taken: readonly string[];
  onChange: (field: ComponentField) => void;
}) {
  const keyTaken = taken.includes(field.key);
  return (
    <>
      <Input
        label="Label"
        className={FIELD}
        value={field.label}
        onChange={(event) => onChange({ ...field, label: event.target.value.slice(0, 80) })}
      />
      <Input
        label="Key"
        className={`${FIELD} emvb-mono`}
        value={field.key}
        error={keyTaken ? "Another field has this key" : undefined}
        description="Lowercase letters, digits and underscores. Bindings use it."
        onChange={(event) =>
          onChange({
            ...field,
            key: event.target.value
              .toLowerCase()
              .replace(/[^a-z0-9_]/g, "")
              .slice(0, 40),
          })
        }
      />
      <Input
        label="Help"
        className={FIELD}
        value={field.help ?? ""}
        onChange={(event) => {
          const help = event.target.value.slice(0, 300);
          const { help: _old, ...rest } = field;
          onChange((help ? { ...rest, help } : rest) as ComponentField);
        }}
      />
      {field.kind === "select" && (
        <OptionsEditor
          options={field.options}
          onChange={(options) => onChange({ ...field, options })}
        />
      )}
      {field.kind === "list" && (
        <fieldset className="emvb-component-list">
          <legend className="emvb-field-label">Fields of each item</legend>
          <FieldList
            fields={field.fields}
            kinds={LEAF_KINDS}
            onChange={(fields) => onChange({ ...field, fields: fields as typeof field.fields })}
          />
        </fieldset>
      )}
    </>
  );
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: { value: string; label: string }[];
  onChange: (options: { value: string; label: string }[]) => void;
}) {
  return (
    <fieldset className="emvb-component-list" data-emvb-design-options="">
      <legend className="emvb-field-label">Choices</legend>
      {options.map((option, index) => (
        <div key={index} className="emvb-component-option">
          <Input
            label="Label"
            className={FIELD}
            value={option.label}
            onChange={(event) =>
              onChange(
                options.map((o, i) =>
                  i === index ? { ...o, label: event.target.value.slice(0, 80) } : o,
                ),
              )
            }
          />
          <Input
            label="Value"
            className={`${FIELD} emvb-mono`}
            value={option.value}
            description="A style class id when the choice adds a class."
            onChange={(event) =>
              onChange(
                options.map((o, i) =>
                  i === index
                    ? {
                        ...o,
                        value: event.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, "")
                          .slice(0, 40),
                      }
                    : o,
                ),
              )
            }
          />
          <Button
            variant="secondary"
            className={BUTTON}
            shape="square"
            aria-label={`Remove ${option.label}`}
            disabled={options.length <= 1}
            icon={<TrashIcon aria-hidden="true" />}
            onClick={() => onChange(options.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      <Button
        variant="secondary"
        className={BUTTON}
        icon={<PlusIcon aria-hidden="true" />}
        disabled={options.length >= 20}
        onClick={() =>
          onChange([
            ...options,
            { value: `option-${options.length + 1}`, label: `Option ${options.length + 1}` },
          ])
        }
      >
        Add choice
      </Button>
    </fieldset>
  );
}

/** The props of each element type a field can fill, and which field kinds fit each. */
const BINDABLE: Record<string, { prop: string; label: string; kinds: ComponentFieldKind[] }[]> = {
  heading: [
    { prop: "text", label: "Text", kinds: ["text"] },
    { prop: "href", label: "Link", kinds: ["link"] },
  ],
  text: [{ prop: "text", label: "Text", kinds: ["text", "rich-text"] }],
  label: [{ prop: "text", label: "Text", kinds: ["text"] }],
  "rich-text": [{ prop: "html", label: "Content", kinds: ["rich-text", "text"] }],
  link: [
    { prop: "text", label: "Text", kinds: ["text"] },
    { prop: "href", label: "Link", kinds: ["link"] },
  ],
  button: [
    { prop: "text", label: "Text", kinds: ["text"] },
    { prop: "href", label: "Link", kinds: ["link"] },
  ],
  image: [{ prop: "src", label: "Image", kinds: ["image"] }],
  video: [
    { prop: "url", label: "Video", kinds: ["text", "link"] },
    { prop: "poster", label: "Poster image", kinds: ["image"] },
  ],
  icon: [{ prop: "href", label: "Link", kinds: ["link"] }],
  "accordion-item": [{ prop: "summary", label: "Title", kinds: ["text"] }],
  "menu-item": [
    { prop: "text", label: "Text", kinds: ["text"] },
    { prop: "href", label: "Link", kinds: ["link"] },
  ],
  loop: [
    { prop: "collection", label: "Collection", kinds: ["select", "text"] },
    { prop: "terms", label: "Terms", kinds: ["select", "text"] },
    // W-331: number settings take a choice whose values are numbers.
    { prop: "slidesInView", label: "Slides in view", kinds: ["select"] },
  ],
  carousel: [
    { prop: "perView", label: "Slides in view", kinds: ["select"] },
    { prop: "perViewTablet", label: "Slides in view (tablet)", kinds: ["select"] },
  ],
  accordion: [{ prop: "columns", label: "Columns", kinds: ["select"] }],
  flexbox: [{ prop: "href", label: "Link", kinds: ["link"] }],
  container: [{ prop: "href", label: "Link", kinds: ["link"] }],
  "div-block": [{ prop: "href", label: "Link", kinds: ["link"] }],
};

/** The list field a node repeats inside, if any, so its bindings can use the item's fields. */
function enclosingList(
  layout: Layout | null,
  nodeId: string,
  fields: ComponentField[],
): ComponentField | undefined {
  if (!layout) return undefined;
  const path: LayoutNode[] = [];
  const walk = (node: LayoutNode): boolean => {
    path.push(node);
    if (node.id === nodeId) return true;
    if ("children" in node && Array.isArray(node.children))
      for (const child of node.children) if (walk(child)) return true;
    path.pop();
    return false;
  };
  walk(layout.root);
  for (let i = path.length - 2; i >= 0; i--) {
    const key = path[i]?.bind?.["repeat"];
    const field = key ? fields.find((f) => f.key === key) : undefined;
    if (field?.kind === "list") return field;
  }
  return undefined;
}

/** Which of an element's props take a field's value, inside a Component's design. */
export function BindingEditor({
  node,
  layout,
  onChange,
}: {
  node: LayoutNode;
  layout: Layout | null;
  onChange: (node: LayoutNode) => void;
}) {
  const fields = React.useContext(ComponentDesignContext);
  if (!fields) return null;
  const list = enclosingList(layout, node.id, fields);
  const available: ComponentField[] = [...(list?.kind === "list" ? list.fields : []), ...fields];
  const bind = node.bind ?? {};
  const set = (target: string, key: string) => {
    const { [target]: _old, ...rest } = bind;
    const next = key ? { ...rest, [target]: key } : rest;
    const { bind: _bind, ...withoutBind } = node;
    onChange(
      (Object.keys(next).length > 0 ? { ...withoutBind, bind: next } : withoutBind) as LayoutNode,
    );
  };
  const picker = (
    target: string,
    label: string,
    kinds: readonly ComponentFieldKind[],
    help?: string,
  ) => {
    const options = available.filter((f) => kinds.includes(f.kind));
    return (
      <div key={target}>
        <Select
          label={label}
          className={FIELD}
          value={bind[target] ?? ""}
          onValueChange={(v) => set(target, String(v ?? ""))}
          renderValue={(v: unknown) => options.find((f) => f.key === v)?.label ?? "Not bound"}
        >
          <Select.Option value="">Not bound</Select.Option>
          {options.map((f) => (
            <Select.Option key={f.key} value={f.key}>
              {f.label}
            </Select.Option>
          ))}
        </Select>
        {help && <p className="emvb-helper">{help}</p>}
      </div>
    );
  };
  return (
    <section className="emvb-binding-editor" data-emvb-bindings="">
      <h3 className="emvb-section-title">Fields</h3>
      {(BINDABLE[node.type] ?? []).map((b) => picker(b.prop, b.label, b.kinds))}
      {picker("show", "Show only when filled", [
        "text",
        "rich-text",
        "image",
        "link",
        "toggle",
        "list",
      ])}
      {picker(
        "classes",
        "Add style class from",
        ["select"],
        "The chosen choice's value is added as a style class.",
      )}
      {!list &&
        picker(
          "repeat",
          "Repeat for each item of",
          ["list"],
          "This element appears once per item; bind its parts to the item's fields.",
        )}
    </section>
  );
}
