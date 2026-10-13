# Layout format (short)

A layout is `{ schemaVersion, root }`. `root` is a page node whose `children` are sections.
Each node has `id`, `type`, `props`, optional `style` (with `devices.tablet/mobile` overrides and
`states.hover/focus`), `classes`, and `children` when it is a parent.

Style values may be literals (`"16px"`, `"#123456"`) or variable references
(`{ "var": "brand" }`, `{ "var": "space-m", "from": "spacing" }`).

The full JSON Schema is the resource `emvb://schema/layout`; the full prose reference is
`emvb://docs/layout-format`. Element props and allowed parents: `list_element_types`.
