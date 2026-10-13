import { Button, Input, Select } from "@cloudflare/kumo";
import * as React from "react";
import type { Layout, LayoutNode } from "../../../../core/index.ts";
import { BUTTON, FIELD } from "../../../ui.ts";
import {
  attributeErrors,
  htmlIdError,
  MAX_ATTR_VALUE,
  savableAttributes,
  type AttributeRow,
} from "./advanced-rules.ts";
import { QueryStyleRows } from "./QueryStyleRows.tsx";

/**
 * CSS id: a value the page can't save (bad characters, or another element's id) stays in the
 * field with an inline error and is not stored (W-189).
 */
export function HtmlIdField({
  node,
  layout,
  onChange,
}: {
  node: LayoutNode;
  layout: Layout | null;
  onChange: (node: LayoutNode) => void;
}) {
  const stored = node.htmlId ?? "";
  const [draft, setDraft] = React.useState(stored);
  React.useEffect(() => {
    setDraft((current) => (htmlIdError(current, layout, node.id) ? current : stored));
    // Follow the stored id when another element is picked, or undo changes it.
  }, [stored, node.id]);
  const error = htmlIdError(draft, layout, node.id);
  return (
    <Input
      label="CSS id"
      className={`${FIELD} emvb-mono`}
      value={draft}
      error={error ?? undefined}
      aria-invalid={error ? true : undefined}
      onChange={(event) => {
        const next = event.target.value.trim();
        setDraft(next);
        if (htmlIdError(next, layout, node.id)) return;
        onChange({ ...node, htmlId: next === "" ? undefined : next });
      }}
    />
  );
}

/** Text direction for this element only (W-341). Unset follows the site. */
export function DirectionField({
  node,
  onChange,
}: {
  node: LayoutNode;
  onChange: (node: LayoutNode) => void;
}) {
  return (
    <Select
      label="Text direction"
      className={FIELD}
      data-emvb-dir=""
      value={node.dir ?? "site"}
      onValueChange={(value) => {
        const dir = value === "ltr" || value === "rtl" || value === "auto" ? value : undefined;
        onChange({ ...node, dir });
      }}
    >
      <Select.Option value="site">Site default</Select.Option>
      <Select.Option value="ltr">Left to right</Select.Option>
      <Select.Option value="rtl">Right to left</Select.Option>
      <Select.Option value="auto">Auto</Select.Option>
    </Select>
  );
}

/** Marks a box as a container-query container (W-346). */
export function ContainerQueryFields({
  node,
  onChange,
}: {
  node: LayoutNode;
  onChange: (node: LayoutNode) => void;
}) {
  const min = node.query?.min ?? "";
  return (
    <div className="emvb-field-group" data-emvb-container="">
      {/* W-398: any element can take container-query styles; only a box can be the container. */}
      {"children" in node && (
        <label className="emvb-check">
          <input
            type="checkbox"
            checked={node.container === true}
            onChange={(event) =>
              onChange({ ...node, container: event.target.checked ? true : undefined })
            }
          />
          Query container
        </label>
      )}
      <Input
        label="Styles from container width (px)"
        className={FIELD}
        type="number"
        min={1}
        max={3840}
        value={min === "" ? "" : String(min)}
        onChange={(event) => {
          const next = event.target.value.trim();
          if (next === "") {
            const { query: _query, ...rest } = node;
            onChange(rest);
            return;
          }
          const width = Number(next);
          if (!Number.isInteger(width) || width < 1 || width > 3840) return;
          onChange({ ...node, query: { min: width, style: node.query?.style ?? {} } });
        }}
      />
      <Button
        type="button"
        variant="secondary"
        className={BUTTON}
        onClick={() => {
          const width = node.query?.min ?? 480;
          onChange({ ...node, query: { min: width, style: node.style ?? {} } });
        }}
      >
        Use current style at that width
      </Button>
      <QueryStyleRows node={node} onChange={onChange} />
      <p className="emvb-helper">
        Query container makes this box the size children measure. The styles listed here apply
        inside @container once the container is at least that wide, not the viewport.
      </p>
    </div>
  );
}

const sameRows = (a: readonly AttributeRow[] | undefined, b: readonly AttributeRow[] | undefined) =>
  JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

/**
 * Attributes: rows keep what you type; only rows the page can save are stored, and the others
 * say why inline, so a half-typed or refused name never blocks Save (W-189).
 */
export function AttributesEditor({
  attributes,
  onChange,
}: {
  attributes: LayoutNode["attributes"];
  onChange: (next: LayoutNode["attributes"]) => void;
}) {
  const [rows, setRows] = React.useState<AttributeRow[]>(() => [...(attributes ?? [])]);
  React.useEffect(() => {
    // Undo, redo or another element: show the stored rows unless they are what these rows save.
    setRows((current) =>
      sameRows(savableAttributes(current), attributes) ? current : [...(attributes ?? [])],
    );
  }, [attributes]);
  const errors = attributeErrors(rows);
  const change = (next: AttributeRow[]) => {
    setRows(next);
    const keep = savableAttributes(next);
    if (!sameRows(keep, attributes)) onChange(keep);
  };
  const update = (index: number, patch: Partial<AttributeRow>) =>
    change(rows.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  return (
    <div className="emvb-field-group" data-emvb-attributes="">
      <span className="emvb-var-field-label">Attributes</span>
      {rows.map((item, index) => (
        <div key={index} className="emvb-style-row">
          <Input
            label="Name"
            className={`${FIELD} emvb-mono`}
            value={item.name}
            error={errors[index] ?? undefined}
            aria-invalid={errors[index] ? true : undefined}
            onChange={(event) => update(index, { name: event.target.value.trim().toLowerCase() })}
          />
          <Input
            label="Value"
            className={FIELD}
            value={item.value}
            maxLength={MAX_ATTR_VALUE}
            onChange={(event) => update(index, { value: event.target.value })}
          />
          <Button
            type="button"
            variant="ghost"
            onClick={() => change(rows.filter((_, i) => i !== index))}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        className={BUTTON}
        onClick={() => setRows([...rows, { name: "data-", value: "" }])}
      >
        Add attribute
      </Button>
      <p className="emvb-helper">data-* and aria-* names only. Event handlers are refused.</p>
    </div>
  );
}
