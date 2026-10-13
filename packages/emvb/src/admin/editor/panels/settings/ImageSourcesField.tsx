import * as React from "react";
import { sanitizeMediaUrl, type LayoutNode } from "../../../../core/index.ts";
import { FIELD } from "../../../ui.ts";
import { savableNode } from "./DraftTextField.tsx";
import { propsOf, withProp } from "./node-props.ts";

type Source = { src: string; width: number };

const MAX_SOURCES = 6;

/** Stored sources as lines: `URL WIDTH` (W-397). */
const sourcesText = (value: unknown): string =>
  Array.isArray(value)
    ? value
        .filter(
          (s): s is Source =>
            typeof s === "object" && s !== null && typeof (s as Source).src === "string",
        )
        .map((s) => `${s.src} ${s.width}`)
        .join("\n")
    : "";

/**
 * `/photo-400.jpg 400` or `/photo-400.jpg 400w`, one per line → sources; or the reason the
 * text can't be stored (W-397).
 */
export function parseSources(text: string): { sources: Source[] } | { error: string } {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length > MAX_SOURCES) return { error: `Up to ${MAX_SOURCES} extra sources.` };
  const sources: Source[] = [];
  for (const line of lines) {
    const match = /^(\S+)\s+(\d{1,4})w?$/.exec(line);
    const width = match ? Number(match[2]) : Number.NaN;
    if (!match || !Number.isInteger(width) || width < 1 || width > 8000) {
      return {
        error: `"${line.slice(0, 60)}": write the URL, a space, then its width in px (1–8000).`,
      };
    }
    const src = match[1] as string;
    if (!sanitizeMediaUrl(src) || src.includes(",")) {
      return { error: `"${src.slice(0, 60)}" isn't a URL or site path the page can use.` };
    }
    sources.push({ src, width });
  }
  return { sources };
}

/** The Image element's extra `srcset` sources (W-397): one `URL WIDTH` per line. */
export function ImageSourcesField({
  node,
  onChange,
}: {
  node: LayoutNode;
  onChange: (node: LayoutNode) => void;
}) {
  const raw = propsOf(node)["sources"];
  const [draft, setDraft] = React.useState(sourcesText(raw));
  const [error, setError] = React.useState<string | null>(null);
  const id = React.useId();
  React.useEffect(() => {
    setDraft(sourcesText(raw));
    setError(null);
  }, [node.id, raw]);

  const commit = () => {
    const parsed = parseSources(draft);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    const next = withProp(node, "sources", parsed.sources.length > 0 ? parsed.sources : undefined);
    if (!savableNode(next) && savableNode(node)) {
      setError("One of these sources can't be saved.");
      return;
    }
    setError(null);
    if (sourcesText(raw) === sourcesText(parsed.sources)) return;
    onChange(next);
  };

  return (
    <div className="emvb-field-group" data-emvb-field="sources">
      <label className="emvb-field-label" htmlFor={id}>
        Extra sizes (srcset)
      </label>
      <textarea
        id={id}
        className={`${FIELD} emvb-textarea`}
        rows={3}
        placeholder={"/photo-480.jpg 480\n/photo-1600.jpg 1600"}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-help`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
      />
      <span
        className="emvb-helper"
        id={`${id}-help`}
        data-emvb-sources-error={error ? "" : undefined}
      >
        {error ??
          "One per line: the URL of a smaller or larger copy, a space, then its width in px. Set Width (px) so the main image is listed too."}
      </span>
    </div>
  );
}
