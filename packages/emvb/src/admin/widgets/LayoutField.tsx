import { LinkButton, Text } from "@cloudflare/kumo";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { summarizeLayout } from "../../core/index.ts";
import { COLLECTION_SLUG, PAGES_COLLECTION, PLUGIN_ID } from "../../constants.ts";

export type FieldWidgetProps = {
  value: unknown;
  onChange: (value: unknown) => void;
  label: string;
  id: string;
  required?: boolean;
  options?: Record<string, unknown>;
  minimal?: boolean;
};

function parse(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * W-307: the collection and entry id from `/_emdash/admin/content/<collection>/<id>`, so the
 * widget also links entries of visual collections (an `emvb_layout` field) to the editor.
 */
export function entryFromLocation(
  pathname: string,
): { collection: string; id: string } | undefined {
  const match = /\/content\/([^/?#]+)\/([^/?#]+)/.exec(pathname);
  const collection = match?.[1] ?? "";
  const id = match?.[2] ? decodeURIComponent(match[2]) : "";
  if (!COLLECTION_SLUG.test(collection) || !id || id === "new") return undefined;
  return { collection, id };
}

/** The editor URL for an entry: Visual pages keep the short form without a collection. */
function editorHref(entry: { collection: string; id: string }): string {
  const base = `/_emdash/admin/plugins/${PLUGIN_ID}/editor?entry=${encodeURIComponent(entry.id)}`;
  return entry.collection === PAGES_COLLECTION
    ? base
    : `${base}&collection=${encodeURIComponent(entry.collection)}`;
}

/**
 * Read-only widget for the hidden collection's `layout` field (D-019). It summarises the page and
 * links to EmVB. It has no inputs and never calls `onChange`, so the JSON can't be hand-edited here.
 */
export function LayoutField({ value, label, id }: FieldWidgetProps) {
  const summary = summarizeLayout(parse(value));
  const entry = entryFromLocation(window.location.pathname);
  const entryId = entry?.id;
  const href = entry ? editorHref(entry) : `/_emdash/admin/plugins/${PLUGIN_ID}/pages`;
  const description = !summary
    ? "This page has no content yet."
    : `${summary.nodes} ${summary.nodes === 1 ? "element" : "elements"} · schema ${summary.schemaVersion ?? "unknown"}`;
  return (
    <div
      id={id}
      role="group"
      aria-label={label}
      data-emvb-widget="layout"
      className="flex flex-col gap-2"
    >
      <Text variant="secondary">{label}</Text>
      <Text>{description}</Text>
      <Text variant="secondary">This page is edited in EmVB.</Text>
      <div>
        <LinkButton
          href={href}
          variant="secondary"
          icon={<ArrowSquareOutIcon aria-hidden="true" />}
        >
          {entryId ? "Open in EmVB" : "Go to Visual pages"}
        </LinkButton>
      </div>
    </div>
  );
}
