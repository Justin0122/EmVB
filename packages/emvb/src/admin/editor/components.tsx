import { Button, Input, Select, Switch } from "@cloudflare/kumo";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import * as React from "react";
import {
  collectComponentPartIds,
  editListItem,
  type ListItemOp,
  emptyComponentFields,
  validateComponentFields,
  validateLayout,
  type ComponentField,
  type ComponentTemplate,
  type Layout,
  type LayoutNode,
} from "../../core/index.ts";
import { THEME_PARTS_COLLECTION } from "../../constants.ts";
import { requestJson, type Fetcher } from "../api.ts";
import { listThemeParts } from "../theme-api.ts";
import { BUTTON, FIELD } from "../ui.ts";
import { CardsInput, TermsInput, type UseContext } from "./loop-fields.tsx";
import { MediaPicker } from "./panels/settings/MediaPicker.tsx";
import { RichTextEditor } from "./rich-text/RichTextEditor.tsx";

/**
 * W-312: the editor's side of Components. The canvas renders each use from its design and the
 * Add panel lists the site's components; selecting a use shows its fields as a form.
 */

/** W-340: `thumbnail` is the component's picture on its Add panel tile. */
export type ComponentSummary = { id: string; title: string; thumbnail?: string };
type ComponentsState = { list: ComponentSummary[]; templates: Record<string, ComponentTemplate> };

export const ComponentsContext = React.createContext<ComponentsState>({ list: [], templates: {} });

/** W-336: the list item chosen on the canvas; the Content tab opens it. */
export type FocusedListItem = { useId: string; path: string; index: number };
export const ListItemFocusContext = React.createContext<FocusedListItem | null>(null);

/** Where a field sits: the use, and its path in the use's values ("cards", "cards.0.title"). */
type FieldAt = { useId: string; path: string };

const MAX_DEPTH = 6;

/** A component part's design and fields, or null when it isn't a component. */
export async function loadComponent(
  fetcher: Fetcher,
  id: string,
): Promise<ComponentTemplate | null> {
  try {
    const body = await requestJson<{ item?: { data?: Record<string, unknown> } }>(
      fetcher,
      `/_emdash/api/content/${THEME_PARTS_COLLECTION}/${encodeURIComponent(id)}`,
    );
    const data = body?.item?.data;
    if (!data || data["part_type"] !== "component") return null;
    const layout = validateLayout(data["layout"]);
    if (!layout.ok) return null;
    let raw = data["component_fields"];
    if (typeof raw === "string") raw = JSON.parse(raw) as unknown;
    const fields = validateComponentFields(raw ?? emptyComponentFields());
    return { nodes: layout.layout.root.children, fields: fields.ok ? fields.doc.fields : [] };
  } catch {
    return null;
  }
}

/** The site's components, and the designs of those the open layout uses (and they use). */
export function useComponents(layout: Layout | null, fetcher: Fetcher): ComponentsState {
  const [list, setList] = React.useState<ComponentSummary[]>([]);
  const [templates, setTemplates] = React.useState<Record<string, ComponentTemplate>>({});
  React.useEffect(() => {
    let cancelled = false;
    void listThemeParts(fetcher)
      .then((parts) => {
        if (!cancelled) {
          setList(
            parts
              .filter((p) => p.partType === "component")
              .map((p) => ({
                id: p.id,
                title: p.title,
                ...(p.thumbnail ? { thumbnail: p.thumbnail } : {}),
              })),
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fetcher]);
  const key = layout ? collectComponentPartIds([layout.root]).toSorted().join("\0") : "";
  React.useEffect(() => {
    const ids = key ? key.split("\0") : [];
    let cancelled = false;
    const load = async () => {
      const acc: Record<string, ComponentTemplate> = {};
      let next = ids;
      for (let depth = 0; depth < MAX_DEPTH && next.length > 0; depth++) {
        // oxlint-disable-next-line no-await-in-loop -- each level comes from the designs just loaded
        const loaded = await Promise.all(
          next
            .filter((id) => !acc[id])
            .map(async (id) => [id, await loadComponent(fetcher, id)] as const),
        );
        next = [];
        for (const [id, template] of loaded) {
          if (!template) continue;
          acc[id] = template;
          next.push(...collectComponentPartIds(template.nodes));
        }
      }
      if (!cancelled) setTemplates(acc);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [key, fetcher]);
  return React.useMemo(() => ({ list, templates }), [list, templates]);
}

/** A component use's name: its component's title, so Layers and the canvas say what it is. */
export function componentTitle(
  node: LayoutNode,
  list: readonly ComponentSummary[],
): string | undefined {
  if (node.type !== "component") return undefined;
  const partId = (node.props as { partId?: string }).partId;
  return list.find((c) => c.id === partId)?.title;
}

type Values = Record<string, unknown>;
const record = (value: unknown): Values =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Values) : {};

/** An image field's value as the image element the media picker edits (W-312, W-337). */
export function imageFieldNode(value: unknown): LayoutNode {
  const image = record(value);
  return {
    id: "component-image",
    type: "image",
    props: { src: image["src"] ?? "", alt: image["alt"] ?? "" },
  } as LayoutNode;
}

/** The image field value of what the media picker chose; null when it was cleared. */
export function imageFieldValue(picked: LayoutNode): Values | null {
  const p = picked.props as {
    src?: string;
    alt?: string;
    mediaId?: string;
    width?: number;
    height?: number;
  };
  if (!p.src) return null;
  return {
    src: p.src,
    ...(p.alt ? { alt: p.alt } : {}),
    ...(p.mediaId ? { mediaId: p.mediaId } : {}),
    // W-335: the picked image's size travels with it.
    ...(p.width && p.height ? { width: p.width, height: p.height } : {}),
  };
}

/** The fields form of one component use (Content tab). */
export function ComponentFieldsForm({
  node,
  fetcher,
  onChange,
}: {
  node: LayoutNode;
  fetcher: Fetcher;
  onChange: (node: LayoutNode) => void;
}) {
  const { list, templates } = React.useContext(ComponentsContext);
  const props = node.props as { partId: string; values?: Values };
  const template = templates[props.partId];
  const values = props.values ?? {};
  const setValues = (next: Values) =>
    onChange({ ...node, props: { ...props, values: next } } as LayoutNode);
  return (
    <div className="emvb-component-fields" data-emvb-component-fields="">
      <Select
        label="Component"
        className={FIELD}
        value={props.partId}
        onValueChange={(value) =>
          onChange({ ...node, props: { partId: String(value), values } } as LayoutNode)
        }
        renderValue={(value: unknown) =>
          list.find((c) => c.id === value)?.title ?? "Choose a component"
        }
      >
        {list.map((c) => (
          <Select.Option key={c.id} value={c.id}>
            {c.title}
          </Select.Option>
        ))}
      </Select>
      {!template ? (
        <p className="emvb-helper">Choose a published component to fill in its fields.</p>
      ) : template.fields.length === 0 ? (
        <p className="emvb-helper">
          This component has no fields. Edit its design in Theme Builder.
        </p>
      ) : (
        template.fields.map((field) => (
          <FieldInput
            key={field.key}
            field={field}
            at={{ useId: node.id, path: field.key }}
            use={{ template, values }}
            value={values[field.key]}
            fetcher={fetcher}
            onChange={(value) => setValues({ ...values, [field.key]: value })}
          />
        ))
      )}
    </div>
  );
}

function FieldInput({
  field,
  at,
  use,
  value,
  fetcher,
  onChange,
}: {
  field: ComponentField;
  at: FieldAt;
  /** W-339: the whole use, for fields that read its other values (Terms, Cards). */
  use?: UseContext;
  value: unknown;
  fetcher: Fetcher;
  onChange: (value: unknown) => void;
}) {
  const help = field.help ? <p className="emvb-helper">{field.help}</p> : null;
  switch (field.kind) {
    case "text":
      return (
        <div>
          <Input
            label={field.label}
            className={FIELD}
            value={typeof value === "string" ? value : ""}
            placeholder={field.default}
            onChange={(event) => onChange(event.target.value)}
          />
          {help}
        </div>
      );
    case "rich-text":
      return (
        <div data-emvb-field-kind="rich-text">
          <RichTextEditor
            label={field.label}
            value={typeof value === "string" ? value : ""}
            fetcher={fetcher}
            onChange={onChange}
            help={help}
          />
        </div>
      );
    case "image": {
      const image = record(value);
      return (
        <div data-emvb-field-kind="image">
          <MediaPicker
            label={field.label}
            fetcher={fetcher}
            node={imageFieldNode(image)}
            onChange={(next) => onChange(imageFieldValue(next))}
          />
          {help}
        </div>
      );
    }
    case "link": {
      const link = record(value);
      const href =
        typeof link["href"] === "string" ? link["href"] : typeof value === "string" ? value : "";
      return (
        <div data-emvb-field-kind="link">
          <Input
            label={field.label}
            className={`${FIELD} emvb-mono`}
            value={href}
            placeholder="/pagina of https://"
            onChange={(event) =>
              onChange({ href: event.target.value, ...(link["newTab"] ? { newTab: true } : {}) })
            }
          />
          <Switch
            label="Open in a new tab"
            checked={link["newTab"] === true}
            onCheckedChange={(checked) => onChange({ href, ...(checked ? { newTab: true } : {}) })}
          />
          {help}
        </div>
      );
    }
    case "select":
      return (
        <div>
          <Select
            label={field.label}
            className={FIELD}
            value={typeof value === "string" ? value : (field.default ?? field.options[0]?.value)}
            onValueChange={(next) => onChange(String(next))}
            renderValue={(v: unknown) =>
              field.options.find((o) => o.value === v)?.label ?? String(v)
            }
          >
            {field.options.map((o) => (
              <Select.Option key={o.value} value={o.value}>
                {o.label}
              </Select.Option>
            ))}
          </Select>
          {help}
        </div>
      );
    case "toggle":
      return (
        <div>
          <Switch
            label={field.label}
            checked={typeof value === "boolean" ? value : field.default === true}
            onCheckedChange={(checked) => onChange(checked === true)}
          />
          {help}
        </div>
      );
    case "terms":
      return (
        <TermsInput field={field} use={use} value={value} fetcher={fetcher} onChange={onChange} />
      );
    case "cards":
      return (
        <CardsInput field={field} use={use} value={value} fetcher={fetcher} onChange={onChange} />
      );
    case "list":
      return (
        <ListInput field={field} at={at} value={value} fetcher={fetcher} onChange={onChange} />
      );
  }
}

function ListInput({
  field,
  at,
  value,
  fetcher,
  onChange,
}: {
  field: Extract<ComponentField, { kind: "list" }>;
  at: FieldAt;
  value: unknown;
  fetcher: Fetcher;
  onChange: (value: unknown) => void;
}) {
  const items = Array.isArray(value) ? (value.map(record) as Values[]) : [];
  const max = field.max ?? 50;
  const set = (next: Values[]) => onChange(next);
  // The same edits as the canvas's list item toolbar (W-336).
  const edit = (index: number, op: ListItemOp) => {
    const next = editListItem({ items }, "items", index, op, max);
    if (next) set(next.values["items"] as Values[]);
  };
  const focus = React.useContext(ListItemFocusContext);
  const focused = focus && focus.useId === at.useId && focus.path === at.path ? focus.index : null;
  const title = (item: Values, index: number) => {
    const first = field.fields.find((f) => f.kind === "text");
    const text = first ? item[first.key] : undefined;
    return typeof text === "string" && text.trim() ? text : `Item ${index + 1}`;
  };
  return (
    <fieldset className="emvb-component-list" data-emvb-field-kind="list">
      <legend className="emvb-field-label">{field.label}</legend>
      {items.map((item, index) => (
        <ListItemDetails
          key={index}
          open={items.length <= 2 || focused === index}
          focused={focused === index}
          summary={title(item, index)}
        >
          <div className="emvb-component-item-body">
            {field.fields.map((sub) => (
              <FieldInput
                key={sub.key}
                field={sub}
                at={{ useId: at.useId, path: `${at.path}.${index}.${sub.key}` }}
                value={item[sub.key]}
                fetcher={fetcher}
                onChange={(next) =>
                  set(items.map((it, i) => (i === index ? { ...it, [sub.key]: next } : it)))
                }
              />
            ))}
            <div className="emvb-component-item-actions">
              <Button
                variant="secondary"
                className={BUTTON}
                shape="square"
                aria-label="Move up"
                disabled={index === 0}
                icon={<ArrowUpIcon aria-hidden="true" />}
                onClick={() => edit(index, "move-back")}
              />
              <Button
                variant="secondary"
                className={BUTTON}
                shape="square"
                aria-label="Move down"
                disabled={index === items.length - 1}
                icon={<ArrowDownIcon aria-hidden="true" />}
                onClick={() => edit(index, "move-on")}
              />
              <Button
                variant="secondary"
                className={BUTTON}
                shape="square"
                aria-label="Remove item"
                icon={<TrashIcon aria-hidden="true" />}
                onClick={() => edit(index, "remove")}
              />
            </div>
          </div>
        </ListItemDetails>
      ))}
      <Button
        variant="secondary"
        className={BUTTON}
        icon={<PlusIcon aria-hidden="true" />}
        disabled={items.length >= max}
        onClick={() => edit(items.length - 1, "append")}
      >
        Add {field.label.toLocaleLowerCase()}
      </Button>
    </fieldset>
  );
}

/** One list item in the form; the one chosen on the canvas opens and scrolls into view (W-336). */
function ListItemDetails({
  open,
  focused,
  summary,
  children,
}: {
  open: boolean;
  focused: boolean;
  summary: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDetailsElement>(null);
  React.useEffect(() => {
    const element = ref.current;
    if (!focused || !element) return;
    element.open = true;
    element.scrollIntoView?.({ block: "nearest" });
  }, [focused]);
  return (
    <details
      ref={ref}
      className="emvb-component-item"
      open={open}
      data-emvb-list-item-focused={focused ? "" : undefined}
    >
      <summary>{summary}</summary>
      {children}
    </details>
  );
}
