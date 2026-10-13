# Building a page, step by step

1. `get_site_styles` — note colour, font and spacing variable ids.
2. `create_page { title, recipes: ["hero", "features", "cta"] }` — returns `pageId`, `rev`.
3. `get_layout { pageId }` — find the ids of the headings, text and buttons the recipes added.
4. `update_element { pageId, nodeId, set: { props: { text: "…" } }, expectedRev }` for each.
5. `add_element { pageId, parentId, element: { type, props, style } }` for anything missing.
6. `get_accessibility_findings { pageId }` — fix each finding with the `fix` it suggests.
7. `describe_page { pageId }` — summarise for the person. `restore_version` undoes your edits.
