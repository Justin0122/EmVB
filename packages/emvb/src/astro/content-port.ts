import { decodeSlug, getEmDashCollection, getEmDashEntry, getSiteSettings, getTerm } from "emdash";
import { getPublicPluginApiRouteHandler } from "emdash/plugin-utils";

/**
 * How the Astro adapter reads EmDash content (W-359). The default calls EmDash.
 * Tests pass a fake. This is not a host export.
 */
export type ContentPort = {
  decodeSlug: typeof decodeSlug;
  getEntry: typeof getEmDashEntry;
  getCollection: typeof getEmDashCollection;
  getTerm: typeof getTerm;
  getSiteSettings: typeof getSiteSettings;
  pluginHandler: typeof getPublicPluginApiRouteHandler;
};

export const emdashContent: ContentPort = {
  decodeSlug,
  getEntry: getEmDashEntry,
  getCollection: getEmDashCollection,
  getTerm,
  getSiteSettings,
  pluginHandler: getPublicPluginApiRouteHandler,
};
