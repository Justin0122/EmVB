# Visual collections

Any EmDash collection can be edited in EmVB, not only Visual pages. Every entry then has its own
layout in the EmVB editor, while its other fields (image, summary, category, SEO…) stay in
EmDash's normal editor. This suits collections where entries differ from each other, such as
news, products or case studies.

## Turn it on

1. Open **EmVB → Pages VisualBuilder**.
2. Under **Edit a collection visually**, choose **Edit visually** next to the collection.

EmVB adds one field to the collection: `emvb_layout`, labelled **Visual layout**. Nothing else
changes and existing content is kept. The collection now has its own list on the Pages
VisualBuilder page. Each entry opens in the editor, and the entry's page in EmDash's editor shows
**Open in EmVB** as well.

Collections hidden from the admin and EmVB's own collections aren't offered. To stop editing a
collection visually, delete the Visual layout field under **Content Types**. That deletes the
layouts too.

## What the editor saves

For an entry of a visual collection, the editor saves only the entry's layout, its title (when
the collection has a `title` field) and its slug. EmDash keeps every field a save leaves out, so
the entry's other fields are never touched. The settings panel shows **Entry settings** with a
link to the entry's other fields.

Every save is validated like a Visual page's layout. A save that clears `emvb_layout` to `null`
is allowed and means the entry has no visual layout. Who may save an entry is EmDash's decision,
as for any other field.

## Show it on the site

A visual collection needs a route in the host site, at the collection's URL pattern. Use
`resolveEmVBEntry` to render the entry's layout:

```astro
---
// src/pages/news/[slug].astro
import { decodeSlug, getEmDashEntry } from "emdash";
import { EmVBPage, resolveEmVBEntry } from "@perkyzz/emvb/astro";
import Base from "../../layouts/Base.astro";

const slug = decodeSlug(Astro.params.slug);
const emvb = await resolveEmVBEntry(Astro, "news", { slug });
const entry = emvb?.entry ?? (await getEmDashEntry("news", slug)).entry;
if (!entry) return Astro.rewrite("/404");
---

<Base title={entry.data.title} content={{ collection: "news", id: entry.data.id, slug }}>
  {emvb ? <EmVBPage page={emvb} /> : <h1>{entry.data.title}</h1>}
</Base>
```

`resolveEmVBEntry(Astro, collection, { slug?, param? })` returns `null` when the entry doesn't
exist or has no layout yet. The route can then render the entry with its own template, so not
every entry has to be designed. The slug comes from `options.slug`, or from the route parameter
named by `options.param` (default `slug`). The result has the same shape as `resolveEmVBPage`'s,
so it works with `EmVBPage` and the runtimes the same way.

Pass `content: { collection, id, slug }` to the layout, as above, so Theme Builder conditions
such as **Singular → collection** match the entry.
