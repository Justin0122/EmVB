export const PLUGIN_ID = "emvb";
export const PLUGIN_VERSION = "0.2.1";
export const PACKAGE_NAME = "@perkyzz/emvb";
export const ADMIN_ENTRY = `${PACKAGE_NAME}/admin`;
export const PAGES_COLLECTION = "emvb_pages";
/** Hidden collection for Header/Footer theme parts (D-TB-03). Not public URLs. */
export const THEME_PARTS_COLLECTION = "emvb_theme_parts";
/** EDITOR in EmDash's RBAC (`packages/auth/src/rbac.ts`); EmVB is for editors and above (D-020). */
export const EDITOR_ROLE = 40;
export const DESIGN_KEY = "system";
/** Editor working copy. The public route keeps reading `DESIGN_KEY` (W-100). */
export const DESIGN_DRAFT_KEY = "draft";
/** W-307: the field "Edit visually" adds to an EmDash collection; it holds each entry's own layout. */
export const ENTRY_LAYOUT_FIELD = "emvb_layout";
/** True for EmVB's own collections, which store the layout in `layout`. */
export const isEmvbCollection = (collection: string) =>
  collection === PAGES_COLLECTION || collection === THEME_PARTS_COLLECTION;
/** The field that holds an entry's layout: `layout` in EmVB's collections, else `emvb_layout`. */
export const layoutFieldFor = (collection: string) =>
  isEmvbCollection(collection) ? "layout" : ENTRY_LAYOUT_FIELD;
/** A collection slug as EmDash allows it, so a URL can't point the editor anywhere else. */
export const COLLECTION_SLUG = /^[a-z][a-z0-9_]{0,63}$/;
