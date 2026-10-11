import type { PublicPluginApiRouteHandler } from "emdash/plugin-utils";
import type { DesignSystem, FormDefinitions, Layout, PublicFormDefinition } from "../core/index.ts";
import { loadFormDefinitions } from "./forms-definitions.ts";
import { loadDesign, readLayout } from "./render.ts";

/**
 * One request's shared reads (W-360). Keyed by the Astro object the host passes to both
 * `resolveEmVBPage` and `resolveThemeParts`. A different object is a different request.
 */
type Session = {
  design?: Promise<DesignSystem>;
  site?: Promise<unknown>;
  parts?: Promise<unknown>;
  forms: Map<string, Promise<PublicFormDefinition | null>>;
  layouts: Map<string, Layout | null>;
};

const sessions = new WeakMap<object, Session>();

function sessionOf(request: object): Session {
  let session = sessions.get(request);
  if (!session) {
    session = { forms: new Map(), layouts: new Map() };
    sessions.set(request, session);
  }
  return session;
}

export function designFor(
  request: object,
  handler: PublicPluginApiRouteHandler | undefined,
  base: URL,
): Promise<DesignSystem> {
  const session = sessionOf(request);
  session.design ??= loadDesign(handler, base);
  return session.design;
}

/** Each form id is loaded once per request, including when several parts use it. */
export function formsFor(
  request: object,
  handler: PublicPluginApiRouteHandler | undefined,
  base: URL,
  formIds: readonly string[],
): Promise<FormDefinitions> {
  const session = sessionOf(request);
  return Promise.all(
    formIds.map(async (formId) => {
      let pending = session.forms.get(formId);
      if (!pending) {
        pending = loadFormDefinitions(handler, base, [formId]).then(
          (map) => map.get(formId) ?? null,
        );
        session.forms.set(formId, pending);
      }
      return [formId, await pending] as const;
    }),
  ).then((rows) => {
    const map = new Map<string, PublicFormDefinition>();
    for (const [id, definition] of rows) if (definition) map.set(id, definition);
    return map;
  });
}

export function siteFor<T>(request: object, load: () => Promise<T>): Promise<T> {
  const session = sessionOf(request);
  session.site ??= load();
  return session.site as Promise<T>;
}

export function partsFor<T>(request: object, load: () => Promise<T>): Promise<T> {
  const session = sessionOf(request);
  session.parts ??= load();
  return session.parts as Promise<T>;
}

/** A theme part's layout, parsed once per request. */
export function layoutFor(request: object | undefined, id: string, raw: unknown): Layout | null {
  if (!request) return readLayout(raw);
  const layouts = sessionOf(request).layouts;
  if (layouts.has(id)) return layouts.get(id) ?? null;
  const layout = readLayout(raw);
  layouts.set(id, layout);
  return layout;
}
