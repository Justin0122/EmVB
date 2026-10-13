---
name: emvb-page-builder
description: Build and edit EmVB visual pages on an EmDash site through the EmVB MCP tools (list_pages, get_layout, create_page, add_element, update_element, apply_section_recipe, update_site_styles). Use when asked to create, change, restyle or review pages on a site built with EmVB or EmDash, or to fix their accessibility.
---

# EmVB page builder

EmVB pages are trees of elements (sections, containers, headings, text, images, buttons…) stored
as drafts on an EmDash site. You change them only through the EmVB tools; every change is a
validated **draft** that a person reviews and publishes.

## Always

1. **Read before you write.** `list_pages` → `get_layout` (gives `rev`) or `describe_page`.
2. **Use the site's styles.** `get_site_styles` first; reference variables (`{ "var": "brand" }`)
   instead of raw colours and sizes.
3. **Pass `expectedRev`** from your last read on writes when a person may be editing. A
   `CONFLICT` means: read again, re-apply, retry once.
4. **Prefer recipes.** `list_section_recipes` + `apply_section_recipe` give styled, accessible
   sections; then change the copy with `update_element`.
5. **Check accessibility** with `get_accessibility_findings` after building, and fix errors.
6. **Don't publish** unless the person asked and `publish_page` is available. Otherwise end with
   a summary of what changed so they can review it.

## Errors

- `NESTING` / `INVALID_LAYOUT`: the message says which parent can hold what. Call
  `list_element_types` with the type to see allowed parents and props.
- `REFUSED` on removing a variable: it's still used; replace those references first.
- `PUBLISH_DISABLED`: leave the draft for review.
- `FORBIDDEN`: agent access is off on the site or the token lacks `mcp:tools:emvb`; tell the person.

See `references/workflow.md` for a full page build and `references/layout.md` for the format.
