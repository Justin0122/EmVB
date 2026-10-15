import { getEmDashCollection, getTermsForEntries, type PluginRoute } from "emdash";
import { z } from "zod";
import { loadQuery } from "../astro/collection-loops.ts";
import { LOOP_ORDERS, MAX_CARD_OVERRIDES } from "../core/index.ts";

const Slug = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
const TermSlug = z.string().min(1).max(200);
const EntryId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

const EntriesInput = z.object({
  collection: Slug,
  limit: z.number().int().min(1).max(50).default(50),
  order: z.enum(LOOP_ORDERS).default("newest"),
  taxonomy: Slug.optional(),
  terms: z.array(TermSlug).max(20).optional(),
  pinned: z.array(TermSlug).max(50).optional(),
  first: z.array(EntryId).max(MAX_CARD_OVERRIDES).optional(),
  hidden: z.array(EntryId).max(MAX_CARD_OVERRIDES).optional(),
});

/**
 * W-339: the entries a collection Loop lists, loaded as the page loads them: for the editor's
 * card list and the canvas, which otherwise only has sample cards.
 */
export const loopEntriesRoute: PluginRoute<z.infer<typeof EntriesInput>> = {
  permission: "content:edit_any",
  input: EntriesInput,
  handler: async (ctx) => {
    const { taxonomy, terms, pinned, first, hidden, ...query } = ctx.input;
    const items = await loadQuery({
      ...query,
      ...(taxonomy && terms?.length ? { taxonomy, terms } : {}),
      ...(pinned?.length ? { pinned } : {}),
      ...(first?.length ? { first } : {}),
      ...(hidden?.length ? { hidden } : {}),
    });
    // Without the body text, which a card list doesn't show.
    return { items: items.map(({ content: _content, ...post }) => post) };
  },
};

const TermsInput = z.object({ collection: Slug, taxonomy: Slug });

/** Entries a collection's term list looks through: enough for any real site. */
const TERM_SCAN = 1000;

/**
 * W-339: the terms of a taxonomy that a collection's published entries use, with how many use
 * each: what a Terms field offers. A taxonomy shared by collections lists only this one's.
 */
export const loopTermsRoute: PluginRoute<z.infer<typeof TermsInput>> = {
  permission: "content:edit_any",
  input: TermsInput,
  handler: async (ctx) => {
    const { collection, taxonomy } = ctx.input;
    const result = await getEmDashCollection(collection, { limit: TERM_SCAN }).catch(() => null);
    // An entry's own id sits in its data; the entry's `id` is its slug.
    const ids = (result?.entries ?? []).flatMap((entry) => {
      const id = (entry as { data?: { id?: unknown } }).data?.id;
      return typeof id === "string" ? [id] : [];
    });
    const byEntry = await getTermsForEntries(collection, ids, taxonomy).catch(() => new Map());
    const terms = new Map<string, { slug: string; label: string; count: number }>();
    for (const list of byEntry.values()) {
      for (const term of list as { slug: string; label: string }[]) {
        const known = terms.get(term.slug);
        if (known) known.count += 1;
        else terms.set(term.slug, { slug: term.slug, label: term.label, count: 1 });
      }
    }
    return { terms: [...terms.values()].toSorted((a, b) => a.label.localeCompare(b.label)) };
  },
};
