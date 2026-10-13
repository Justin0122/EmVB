# Building a page, step by step

1. `get_site_styles`: note the colour, font, font size and spacing variable ids, the classes and
   `tokens`. No palette or scale yet? Add them first (see design.md) and check `tokens` again.
2. Plan the page as bands: hero → proof (logos, stats) → features or offer → detail → social
   proof → call to action. One primary action, repeated at the end.
3. `create_page { title, recipes: ["hero", "features", "cta"] }` returns `pageId` and `rev`.
   Without recipes the page starts with a title h1; remove it if your hero has its own.
4. `get_layout { pageId, format: "outline" }`: find the ids of the headings, text and buttons
   the recipes added.
5. `update_element { pageId, nodeId, set: { props: { text: "…" } } }` for each placeholder.
   `set` merges `props` and `style` one level deep. Buttons need a real `href`.
6. `add_element { pageId, parentId, element }` for the rest. An element is
   `{ type, props, style, classes, children }`; ids are generated. Build a whole band in one call:
   a `layout-section` (props.contentWidth for the inner width) holding flexboxes and grids.
7. `get_accessibility_findings { pageId }`: apply each finding's `fix` (heading-level →
   props.level, text-color → style.color, decorative → props.decorative) or follow its message.
8. `describe_page { pageId }`: check the heading outline and image alt texts, then summarise for
   the person. `restore_version` undoes your edits; `list_versions` lists them.
