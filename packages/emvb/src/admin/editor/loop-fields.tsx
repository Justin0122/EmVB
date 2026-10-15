import { Button, Input, Switch } from "@cloudflare/kumo";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CaretRightIcon,
  EyeSlashIcon,
  MagnifyingGlassIcon,
  XIcon,
} from "@phosphor-icons/react";
import * as React from "react";
import {
  applyComponent,
  arrangeEntries,
  collectLoopQueries,
  findNode,
  loopQueryKey,
  loopQueryOf,
  MAX_CARD_OVERRIDES,
  withCardOverride,
  type CardOverride,
  type CardOverrides,
  type ComponentField,
  type ComponentTemplate,
  type Layout,
  type LayoutNode,
  type LoopNode,
  type ThemePostFields,
} from "../../core/index.ts";
import type { Fetcher } from "../api.ts";
import { baseLoopQuery, loadLoopEntries, loadLoopTerms, type LoopTerm } from "../loop-api.ts";
import { BUTTON, FIELD } from "../ui.ts";

type Values = Record<string, unknown>;

/**
 * W-339: the entries the canvas shows for the collection Loops in this layout (and in the
 * component uses it holds), keyed as the renderer looks them up. Each Loop's collection, terms
 * and order load once; its hand-made order and hidden cards apply to those entries as it renders.
 */
export function useCollectionLoops(
  layout: Layout | null,
  templates: Readonly<Record<string, ComponentTemplate>>,
  fetcher: Fetcher,
): Record<string, ThemePostFields[]> {
  const queries = React.useMemo(
    () => (layout ? collectLoopQueries([layout], templates) : []),
    [layout, templates],
  );
  const [loaded, setLoaded] = React.useState<Record<string, ThemePostFields[]>>({});
  const bases = React.useMemo(() => {
    const byKey = new Map(queries.map((q) => [loopQueryKey(baseLoopQuery(q)), baseLoopQuery(q)]));
    return [...byKey.entries()];
  }, [queries]);
  React.useEffect(() => {
    const missing = bases.filter(([key]) => !(key in loaded));
    if (missing.length === 0) return;
    let live = true;
    // A short pause, so typing a collection or tag doesn't load every step.
    const timer = setTimeout(() => {
      for (const [key, query] of missing) {
        void loadLoopEntries(fetcher, query)
          .then((entries) => live && setLoaded((done) => ({ ...done, [key]: entries })))
          .catch(() => live && setLoaded((done) => ({ ...done, [key]: [] })));
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [bases, loaded, fetcher]);
  return React.useMemo(() => {
    const out: Record<string, ThemePostFields[]> = {};
    for (const query of queries) {
      const entries = loaded[loopQueryKey(baseLoopQuery(query))];
      if (entries) out[loopQueryKey(query)] = entries;
    }
    return out;
  }, [queries, loaded]);
}

/** The use's values and design, which Terms and Cards fields read beside their own value. */
export type UseContext = { template: ComponentTemplate; values: Values };

/**
 * W-339: a Terms field: chips of the chosen terms and a search over those the collection's
 * entries use. Stores comma-separated term slugs.
 */
export function TermsInput({
  field,
  use,
  value,
  fetcher,
  onChange,
}: {
  field: Extract<ComponentField, { kind: "terms" }>;
  use: UseContext | undefined;
  value: unknown;
  fetcher: Fetcher;
  onChange: (value: unknown) => void;
}) {
  const fromField = field.collectionField ? use?.values[field.collectionField] : undefined;
  const fromDefault = field.collectionField
    ? use?.template.fields.find((f) => f.key === field.collectionField)
    : undefined;
  const collection =
    (typeof fromField === "string" && fromField) ||
    (fromDefault?.kind === "select"
      ? (fromDefault.default ?? fromDefault.options[0]?.value)
      : "") ||
    field.collection ||
    "";
  const [terms, setTerms] = React.useState<LoopTerm[] | null>(null);
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    if (!collection) return;
    let live = true;
    setTerms(null);
    loadLoopTerms(fetcher, collection, field.taxonomy)
      .then((list) => live && setTerms(list))
      .catch(() => live && setTerms([]));
    return () => {
      live = false;
    };
  }, [fetcher, collection, field.taxonomy]);
  const chosen = (typeof value === "string" ? value : "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const set = (next: string[]) => onChange([...new Set(next)].join(","));
  const label = (slug: string) => terms?.find((t) => t.slug === slug)?.label ?? slug;
  const needle = query.trim().toLowerCase();
  const offered = (terms ?? []).filter(
    (t) =>
      !chosen.includes(t.slug) &&
      (!needle || t.label.toLowerCase().includes(needle) || t.slug.includes(needle)),
  );
  return (
    <div className="emvb-terms" data-emvb-field-kind="terms" data-emvb-field={field.key}>
      <span className="emvb-field-label">{field.label}</span>
      <div className="emvb-terms-box">
        {chosen.map((slug) => (
          <span key={slug} className="emvb-terms-chip" data-emvb-term={slug}>
            {label(slug)}
            <button
              type="button"
              aria-label={`Remove ${label(slug)}`}
              onClick={() => set(chosen.filter((s) => s !== slug))}
            >
              <XIcon size={12} aria-hidden="true" />
            </button>
          </span>
        ))}
        <span className="emvb-terms-search">
          <MagnifyingGlassIcon size={14} aria-hidden="true" />
          <input
            aria-label={`Add ${field.label}`}
            placeholder={chosen.length ? "Add more" : "Search tags"}
            value={query}
            data-emvb-terms-search=""
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && offered[0]) {
                event.preventDefault();
                set([...chosen, offered[0].slug]);
                setQuery("");
              }
              if (event.key === "Backspace" && !query && chosen.length) set(chosen.slice(0, -1));
              if (event.key === "Escape") setOpen(false);
            }}
          />
        </span>
      </div>
      {open && (
        <ul className="emvb-terms-menu" role="listbox" aria-label={field.label}>
          {!collection && <li className="emvb-helper">Choose a collection first.</li>}
          {collection && terms === null && <li className="emvb-helper">Loading…</li>}
          {terms !== null && offered.length === 0 && (
            <li className="emvb-helper">
              {terms.length === 0
                ? "This collection's entries have no tags."
                : "No other tags match."}
            </li>
          )}
          {offered.map((term) => (
            <li key={term.slug}>
              <button
                type="button"
                role="option"
                aria-selected="false"
                data-emvb-term-option={term.slug}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  set([...chosen, term.slug]);
                  setQuery("");
                }}
              >
                <span>{term.label}</span>
                <span className="emvb-muted">{term.count}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {field.help && <p className="emvb-helper">{field.help}</p>}
      {chosen.length === 0 && <p className="emvb-helper">No tags: every entry is listed.</p>}
    </div>
  );
}

/** The Loop node in a use's design whose card changes come from field `key`. */
function loopFor(template: ComponentTemplate, values: Values, key: string): LoopNode | undefined {
  const stack = [...template.nodes];
  let id: string | undefined;
  while (stack.length > 0 && !id) {
    const node = stack.pop() as LayoutNode;
    if (node.type === "loop" && node.bind?.["overrides"] === key) id = node.id;
    if ("children" in node && Array.isArray(node.children)) stack.push(...node.children);
  }
  if (!id) return undefined;
  const applied = applyComponent(template, values);
  const root = { id: "root", type: "container", props: {}, children: applied } as LayoutNode;
  const found = findNode({ schemaVersion: 12, root } as Layout, id);
  return found?.type === "loop" ? (found as LoopNode) : undefined;
}

/** A card change without blank texts; undefined when nothing is left. */
function tidy(card: CardOverride): CardOverride | undefined {
  const next: CardOverride = {};
  if (card.hidden) next.hidden = true;
  for (const key of ["title", "excerpt", "buttonLabel", "link"] as const) {
    const text = card[key];
    if (typeof text === "string" && text.trim() !== "") next[key] = text;
  }
  if (card.button === false) next.button = false;
  return Object.keys(next).length > 0 ? next : undefined;
}

const dateText = (raw: string | undefined) => {
  if (!raw) return "";
  const time = Date.parse(raw);
  return Number.isNaN(time)
    ? ""
    : new Date(time).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
};

/**
 * W-339: a Cards field: the entries its Loop lists, in the order the page shows them, to move,
 * hide or change one by one. Stores the hand-made order (entry ids) and each card's changes.
 */
export function CardsInput({
  field,
  use,
  value,
  fetcher,
  onChange,
}: {
  field: Extract<ComponentField, { kind: "cards" }>;
  use: UseContext | undefined;
  value: unknown;
  fetcher: Fetcher;
  onChange: (value: unknown) => void;
}) {
  const overrides = (value && typeof value === "object" ? value : {}) as CardOverrides;
  const loop = use ? loopFor(use.template, use.values, field.key) : undefined;
  const query = loop ? loopQueryOf(loop) : null;
  const base = query ? baseLoopQuery(query) : null;
  const baseKey = base ? loopQueryKey(base) : "";
  const [entries, setEntries] = React.useState<ThemePostFields[] | null>(null);
  const [open, setOpen] = React.useState<Set<string>>(new Set());
  React.useEffect(() => {
    if (!base) return;
    let live = true;
    setEntries(null);
    loadLoopEntries(fetcher, base)
      .then((list) => live && setEntries(list))
      .catch(() => live && setEntries([]));
    return () => {
      live = false;
    };
    // The base query is rebuilt each render; its key says when it changed.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher, baseKey]);

  const set = (next: CardOverrides) => {
    const cards = Object.fromEntries(
      Object.entries(next.cards ?? {}).flatMap(([id, card]) => {
        const kept = tidy(card);
        return kept ? [[id, kept]] : [];
      }),
    );
    const order = (next.order ?? []).slice(0, MAX_CARD_OVERRIDES);
    onChange({
      ...(order.length > 0 ? { order } : {}),
      ...(Object.keys(cards).length > 0 ? { cards } : {}),
    });
  };

  if (!use || !loop) {
    return (
      <p className="emvb-helper">
        {field.label}: bind a Loop&apos;s Card changes to this field in the component&apos;s design.
      </p>
    );
  }
  // Hidden cards stay in the list, marked, so they can be shown again.
  const arranged = entries
    ? arrangeEntries(entries, { limit: entries.length, first: overrides.order })
    : [];
  const ids = arranged.map((entry) => entry.id);
  const move = (index: number, by: number) => {
    const next = [...ids];
    const [id] = next.splice(index, 1);
    if (id === undefined) return;
    next.splice(index + by, 0, id);
    set({ ...overrides, order: next });
  };
  const change = (id: string, card: CardOverride) =>
    set({ ...overrides, cards: { ...overrides.cards, [id]: card } });
  const toggle = (id: string) =>
    setOpen((shown) => {
      const next = new Set(shown);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const shownCount = arranged.filter((e) => !overrides.cards?.[e.id]?.hidden).length;

  return (
    <fieldset className="emvb-cards" data-emvb-field-kind="cards" data-emvb-field={field.key}>
      <legend className="emvb-field-label">{field.label}</legend>
      <div className="emvb-cards-head">
        <span className="emvb-helper">
          {entries === null
            ? "Loading cards…"
            : `${arranged.length} ${arranged.length === 1 ? "card" : "cards"}${
                shownCount < arranged.length ? `, ${arranged.length - shownCount} hidden` : ""
              }; the page shows ${Math.min(shownCount, query?.limit ?? shownCount)}`}
        </span>
        <span className="emvb-cards-links">
          <button type="button" onClick={() => setOpen(new Set(ids))}>
            Expand all
          </button>
          <button type="button" onClick={() => setOpen(new Set())}>
            Collapse all
          </button>
          {overrides.order?.length ? (
            <button
              type="button"
              data-emvb-cards-reset=""
              title="Back to the order the Loop sorts by"
              onClick={() => set({ ...overrides, order: [] })}
            >
              Reset order
            </button>
          ) : null}
        </span>
      </div>
      {entries !== null && arranged.length === 0 && (
        <p className="emvb-helper">No entries match. Check the collection and tags.</p>
      )}
      <ol className="emvb-cards-list">
        {arranged.map((entry, index) => {
          const card = overrides.cards?.[entry.id] ?? {};
          const shown = withCardOverride(entry, card);
          const expanded = open.has(entry.id);
          return (
            <li
              key={entry.id}
              className="emvb-cards-row"
              data-emvb-card={entry.id}
              data-hidden={card.hidden ? "" : undefined}
              data-changed={tidy({ ...card, hidden: undefined }) ? "" : undefined}
            >
              <div className="emvb-cards-row-head">
                <button
                  type="button"
                  className="emvb-cards-toggle"
                  aria-expanded={expanded}
                  aria-label={`${expanded ? "Collapse" : "Expand"} ${shown.title}`}
                  onClick={() => toggle(entry.id)}
                >
                  <CaretRightIcon size={12} aria-hidden="true" />
                </button>
                <span className="emvb-cards-thumb">
                  {entry.featuredImageUrl ? <img src={entry.featuredImageUrl} alt="" /> : null}
                </span>
                <button type="button" className="emvb-cards-text" onClick={() => toggle(entry.id)}>
                  <span className="emvb-cards-title">
                    {card.hidden && <EyeSlashIcon size={12} aria-label="Hidden" />}
                    {shown.title}
                  </span>
                  <span className="emvb-cards-meta">
                    {[dateText(entry.publishedAt), shown.permalink].filter(Boolean).join(" · ")}
                  </span>
                </button>
                <span className="emvb-cards-move">
                  <Button
                    variant="secondary"
                    className={BUTTON}
                    shape="square"
                    aria-label={`Move ${shown.title} up`}
                    disabled={index === 0}
                    icon={<ArrowUpIcon aria-hidden="true" />}
                    onClick={() => move(index, -1)}
                  />
                  <Button
                    variant="secondary"
                    className={BUTTON}
                    shape="square"
                    aria-label={`Move ${shown.title} down`}
                    disabled={index === arranged.length - 1}
                    icon={<ArrowDownIcon aria-hidden="true" />}
                    onClick={() => move(index, 1)}
                  />
                </span>
              </div>
              {expanded && (
                <div className="emvb-cards-body">
                  <Switch
                    label="Hide this card"
                    checked={card.hidden === true}
                    onCheckedChange={(checked) =>
                      change(entry.id, { ...card, hidden: checked === true ? true : undefined })
                    }
                  />
                  <Input
                    label="Title"
                    className={FIELD}
                    value={card.title ?? ""}
                    placeholder={entry.title}
                    onChange={(event) => change(entry.id, { ...card, title: event.target.value })}
                  />
                  <label className="emvb-cards-area">
                    <span className="emvb-field-label">Summary</span>
                    <textarea
                      className={FIELD}
                      rows={3}
                      value={card.excerpt ?? ""}
                      placeholder={entry.excerpt}
                      onChange={(event) =>
                        change(entry.id, { ...card, excerpt: event.target.value })
                      }
                    />
                  </label>
                  <Switch
                    label="Show button"
                    checked={card.button !== false}
                    onCheckedChange={(checked) =>
                      change(entry.id, { ...card, button: checked === true ? undefined : false })
                    }
                  />
                  {card.button !== false && (
                    <>
                      <Input
                        label="Button label"
                        className={FIELD}
                        value={card.buttonLabel ?? ""}
                        placeholder="The design's own label"
                        onChange={(event) =>
                          change(entry.id, { ...card, buttonLabel: event.target.value })
                        }
                      />
                      <Input
                        label="Link"
                        className={FIELD}
                        value={card.link ?? ""}
                        placeholder={entry.permalink}
                        onChange={(event) =>
                          change(entry.id, { ...card, link: event.target.value })
                        }
                      />
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {field.help && <p className="emvb-helper">{field.help}</p>}
    </fieldset>
  );
}
