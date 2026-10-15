import { PLUGIN_ID } from "../constants.ts";
import { loopQueryKey, type LoopQuery, type ThemePostFields } from "../core/index.ts";
import { requestJson, type Fetcher } from "./api.ts";

/** A term a collection's entries use, with how many use it (W-339). */
export type LoopTerm = { slug: string; label: string; count: number };

/** Entries the editor loads per Loop: as many as a Loop shows or its card list arranges. */
export const EDITOR_LOOP_ENTRIES = 50;

/**
 * W-339: the query the editor loads for a Loop: its collection, terms and order, without the
 * hand-made order and hidden cards. Those the renderer applies to these entries, so arranging
 * cards doesn't load again.
 */
export function baseLoopQuery(query: LoopQuery): LoopQuery {
  const { first: _first, hidden: _hidden, ...rest } = query;
  return { ...rest, limit: EDITOR_LOOP_ENTRIES };
}

const entryLoads = new Map<string, Promise<ThemePostFields[]>>();
const termLoads = new Map<string, Promise<LoopTerm[]>>();

/** A Loop query's entries, as the page lists them; one load per query while the editor is open. */
export function loadLoopEntries(fetcher: Fetcher, query: LoopQuery): Promise<ThemePostFields[]> {
  const key = loopQueryKey(query);
  let load = entryLoads.get(key);
  if (!load) {
    load = requestJson<{ items?: ThemePostFields[] }>(
      fetcher,
      `/_emdash/api/plugins/${PLUGIN_ID}/loop/entries`,
      { method: "POST", body: query },
    ).then((body) => body?.items ?? []);
    // A failed load is asked again next time.
    load.catch(() => entryLoads.delete(key));
    entryLoads.set(key, load);
  }
  return load;
}

/** The terms of `taxonomy` a collection's entries use. */
export function loadLoopTerms(
  fetcher: Fetcher,
  collection: string,
  taxonomy: string,
): Promise<LoopTerm[]> {
  const key = `${collection}|${taxonomy}`;
  let load = termLoads.get(key);
  if (!load) {
    load = requestJson<{ terms?: LoopTerm[] }>(
      fetcher,
      `/_emdash/api/plugins/${PLUGIN_ID}/loop/terms`,
      { method: "POST", body: { collection, taxonomy } },
    ).then((body) => body?.terms ?? []);
    load.catch(() => termLoads.delete(key));
    termLoads.set(key, load);
  }
  return load;
}

/** Forgets loaded entries and terms (tests, or after content changed). */
export function clearLoopLoads() {
  entryLoads.clear();
  termLoads.clear();
}
