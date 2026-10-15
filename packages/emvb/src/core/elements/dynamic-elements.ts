import type {
  LoopNode,
  SectionNode,
  PostAuthorNode,
  PostContentNode,
  PostDateNode,
  PostExcerptNode,
  PostFieldNode,
  PostImageNode,
  PostLinkNode,
  PostTitleNode,
  PaginationNode,
  BreadcrumbsNode,
} from "../schema/layout.ts";
import type { ElementDefinition } from "./definition.ts";

export const postTitle: ElementDefinition<PostTitleNode> = {
  baseCss: ".emvb-post-title{margin:0}",
  defaults: () => ({ type: "post-title", props: { level: 1 } }),
  descriptor: {
    type: "post-title",
    name: "Post Title",
    group: "dynamic",
    defaultTab: "content",
    fields: [
      {
        key: "level",
        kind: "select",
        label: "Level",
        optional: true,
        options: [1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: `H${n}` })),
      },
    ],
  },
  // Rendered with ThemeDynamicData in renderPage (placeholder build for typing).
  build: (_node, attrs) => ({ tag: "h1", attrs, children: ["Post Title"] }),
};

export const postExcerpt: ElementDefinition<PostExcerptNode> = {
  baseCss: ".emvb-post-excerpt{margin:0}",
  defaults: () => ({ type: "post-excerpt", props: {} }),
  descriptor: {
    type: "post-excerpt",
    name: "Post Excerpt",
    group: "dynamic",
    defaultTab: "style",
    fields: [
      {
        key: "maxWords",
        kind: "int",
        label: "Excerpt length (words)",
        optional: true,
        message: "Enter a whole number of words, or leave it blank for the whole excerpt.",
      },
    ],
  },
  build: (_node, attrs) => ({ tag: "p", attrs, children: ["Post excerpt…"] }),
};

export const postContent: ElementDefinition<PostContentNode> = {
  baseCss: ".emvb-post-content{min-width:0}",
  defaults: () => ({ type: "post-content", props: {} }),
  descriptor: {
    type: "post-content",
    name: "Post Content",
    group: "dynamic",
    defaultTab: "style",
    fields: [],
  },
  build: (_node, attrs) => ({
    tag: "div",
    attrs,
    children: [{ tag: "p", attrs: {}, children: ["Post content…"] }],
  }),
};

export const postImage: ElementDefinition<PostImageNode> = {
  baseCss: ".emvb-post-image{display:block;max-width:100%;height:auto}",
  defaults: () => ({ type: "post-image", props: { decorative: false } }),
  descriptor: {
    type: "post-image",
    name: "Post Image",
    group: "dynamic",
    defaultTab: "content",
    fields: [{ key: "decorative", kind: "boolean", label: "Decorative", optional: true }],
  },
  build: (_node, attrs) => ({
    tag: "div",
    attrs: { ...attrs, class: `${attrs.class ?? ""} emvb-post-image-missing`.trim() },
    children: ["Featured image"],
  }),
};

export const postDate: ElementDefinition<PostDateNode> = {
  baseCss: ".emvb-post-date{margin:0}",
  defaults: () => ({ type: "post-date", props: {} }),
  descriptor: {
    type: "post-date",
    name: "Post Date",
    group: "dynamic",
    defaultTab: "style",
    fields: [
      {
        key: "format",
        kind: "select",
        label: "Date format",
        optional: true,
        options: [
          { value: "medium", label: "Medium (Oct 6, 2026)" },
          { value: "short", label: "Short (10/6/26)" },
          { value: "long", label: "Long (October 6, 2026)" },
          { value: "full", label: "Full (Tuesday, October 6, 2026)" },
          { value: "numeric", label: "Numeric (2026-10-06)" },
        ],
      },
    ],
  },
  build: (_node, attrs) => ({ tag: "time", attrs, children: ["Post date"] }),
};

export const postAuthor: ElementDefinition<PostAuthorNode> = {
  baseCss: ".emvb-post-author{margin:0}",
  defaults: () => ({ type: "post-author", props: {} }),
  descriptor: {
    type: "post-author",
    name: "Post Author",
    group: "dynamic",
    defaultTab: "style",
    fields: [],
  },
  build: (_node, attrs) => ({ tag: "span", attrs, children: ["Author"] }),
};

/** W-338: any other field of the post's entry, as text or a link (e-mail, phone, URL). */
export const postField: ElementDefinition<PostFieldNode> = {
  baseCss: ".emvb-post-field{margin:0}a.emvb-post-field{color:inherit}",
  defaults: () => ({ type: "post-field", props: {} }),
  descriptor: {
    type: "post-field",
    name: "Post Field",
    group: "dynamic",
    defaultTab: "content",
    fields: [
      {
        key: "field",
        kind: "text",
        label: "Field",
        optional: true,
        message: "The entry field's name, e.g. email or role.",
      },
      {
        key: "link",
        kind: "select",
        label: "Link",
        optional: true,
        options: [
          { value: "none", label: "No link" },
          { value: "url", label: "Web address" },
          { value: "email", label: "E-mail address" },
          { value: "phone", label: "Phone number" },
        ],
      },
      {
        key: "text",
        kind: "text",
        label: "Text",
        optional: true,
        message: "Leave blank to show the field's value.",
      },
      { key: "newTab", kind: "boolean", label: "Open in new tab", optional: true },
    ],
  },
  build: (node, attrs) => ({
    tag: node.props.link && node.props.link !== "none" ? "a" : "p",
    attrs,
    children: [node.props.field ? `{${node.props.field}}` : "Post field"],
  }),
};

export const postLink: ElementDefinition<PostLinkNode> = {
  baseCss: ".emvb-post-link{color:inherit}",
  defaults: () => ({ type: "post-link", props: {} }),
  descriptor: {
    type: "post-link",
    name: "Post Link",
    group: "dynamic",
    defaultTab: "content",
    fields: [
      {
        key: "text",
        kind: "text",
        label: "Text",
        optional: true,
        message: "Leave blank to use the post title.",
      },
      { key: "newTab", kind: "boolean", label: "Open in new tab", optional: true },
    ],
  },
  build: (_node, attrs) => ({ tag: "a", attrs: { ...attrs, href: "#" }, children: ["Post link"] }),
};

export const loop: ElementDefinition<LoopNode> = {
  baseCss:
    ".emvb-loop{display:flex;flex-direction:column;min-width:0;gap:1rem}.emvb-loop[data-emvb-loop-empty]{min-height:48px;padding:12px;color:var(--text-color-kumo-subtle,#666);background:var(--color-kumo-tint,#eee)}",
  defaults: () => ({ type: "loop", props: {}, children: [] }),
  descriptor: {
    type: "loop",
    name: "Loop",
    group: "dynamic",
    defaultTab: "content",
    fields: [
      {
        key: "itemPartId",
        kind: "text",
        label: "Loop Item",
        optional: true,
        message:
          "Optional published Loop Item theme part. Leave blank to use nested elements as the item template.",
      },
      {
        key: "perPage",
        kind: "int",
        max: 50,
        label: "Posts per page",
        optional: true,
        message:
          "1 to 50 posts on each archive page. Leave it empty for 20. Add a Pagination element to link the pages.",
      },
      {
        key: "collection",
        kind: "text",
        label: "Collection",
        optional: true,
        message:
          "List the published entries of this collection, by its slug (for example news), on any page. Leave blank to list the archive's posts.",
      },
      {
        key: "limit",
        kind: "int",
        max: 50,
        label: "Entries",
        optional: true,
        message: "How many entries a collection Loop shows, 1 to 50. Leave it empty for 6.",
      },
      {
        key: "taxonomy",
        kind: "text",
        label: "Filter by taxonomy",
        optional: true,
        message:
          "Only entries tagged in this taxonomy (for example tags), with one of the terms below.",
      },
      {
        key: "terms",
        kind: "text",
        label: "Terms",
        optional: true,
        message: "Term slugs, separated by commas. An entry with any of them is shown.",
      },
      {
        key: "pinned",
        kind: "text",
        label: "Entries first",
        optional: true,
        message:
          "Entry slugs, separated by commas, shown first in this order. The others follow in the Loop's order.",
      },
      {
        key: "slidesInView",
        kind: "select",
        label: "Show as carousel",
        optional: true,
        devices: { tablet: "slidesInViewTablet", mobile: "slidesInViewMobile" },
        options: [1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: `${n} in view` })),
        message: "Shows the items in a row that scrolls sideways, with arrows. Empty is a list.",
      },
      {
        key: "order",
        kind: "select",
        label: "Order",
        optional: true,
        options: [
          { value: "newest", label: "Newest first" },
          { value: "oldest", label: "Oldest first" },
          { value: "title", label: "By title" },
        ],
      },
    ],
  },
  build: (_node, attrs, children) => ({ tag: "div", attrs, children }),
};

export const pagination: ElementDefinition<PaginationNode> = {
  baseCss:
    ".emvb-pagination{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}.emvb-pagination a{color:inherit}.emvb-pagination a[aria-current=page]{font-weight:700;text-decoration:none}",
  defaults: () => ({ type: "pagination", props: {} }),
  descriptor: {
    type: "pagination",
    name: "Pagination",
    group: "dynamic",
    defaultTab: "content",
    fields: [
      { key: "prevText", kind: "text", label: "Previous text", optional: true },
      { key: "nextText", kind: "text", label: "Next text", optional: true },
    ],
  },
  // Rendered by core/render/pagination.ts from the archive's page data (W-222).
  build: (_node, attrs) => ({ tag: "nav", attrs, children: [] }),
};

export const breadcrumbs: ElementDefinition<BreadcrumbsNode> = {
  baseCss:
    ".emvb-breadcrumbs{display:block;min-width:0}.emvb-breadcrumbs-trail{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin:0;padding:0;list-style:none}.emvb-breadcrumbs-trail>li{display:inline-flex;align-items:center;gap:8px;min-width:0}.emvb-breadcrumbs a{color:color-mix(in srgb,currentColor 60%,transparent);text-decoration:none}.emvb-breadcrumbs a:hover{color:inherit}.emvb-breadcrumbs-sep{flex:0 0 auto;width:1em;height:1em;background:color-mix(in srgb,currentColor 60%,transparent);-webkit-mask:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m8.25 4.5 7.5 7.5-7.5 7.5'/%3E%3C/svg%3E\") center/contain no-repeat;mask:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m8.25 4.5 7.5 7.5-7.5 7.5'/%3E%3C/svg%3E\") center/contain no-repeat}.emvb-breadcrumbs-back-icon{transform:scaleX(-1)}.emvb-breadcrumbs [aria-current=page]{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.emvb-breadcrumbs-back{display:none;align-items:center;justify-content:space-between;gap:16px}.emvb-breadcrumbs-back>a{display:inline-flex;align-items:center;gap:6px;min-width:0}@media (max-width:1024px){.emvb-breadcrumbs[data-emvb-mobile=back] .emvb-breadcrumbs-trail{display:none}.emvb-breadcrumbs[data-emvb-mobile=back] .emvb-breadcrumbs-back{display:flex}}",
  defaults: () => ({ type: "breadcrumbs", props: {} }),
  descriptor: {
    type: "breadcrumbs",
    name: "Breadcrumbs",
    group: "dynamic",
    defaultTab: "content",
    fields: [
      { key: "homeLabel", kind: "text", label: "Home text", optional: true },
      {
        key: "mobile",
        kind: "select",
        label: "On small screens",
        optional: true,
        options: [
          { value: "trail", label: "The whole trail" },
          { value: "back", label: "A link back, and this page" },
        ],
      },
    ],
  },
  // Rendered by core/render/breadcrumbs.ts from the page's trail (W-329).
  build: (_node, attrs) => ({ tag: "nav", attrs, children: [] }),
};

export const section: ElementDefinition<SectionNode> = {
  baseCss: ".emvb-section{display:flex;flex-direction:column;min-width:0}",
  defaults: () => ({ type: "section", props: {}, children: [] }),
  descriptor: {
    type: "section",
    // "Theme section": it embeds a Section theme part; the layout Section is its own element (W-155).
    name: "Theme section",
    group: "layout",
    defaultTab: "content",
    fields: [
      {
        key: "partId",
        kind: "text",
        label: "Section part",
        optional: true,
        message:
          "Optional published Section theme part. When set, the part's contents replace the nested elements on every page that uses it.",
      },
    ],
  },
  build: (_node, attrs, children) => ({ tag: "div", attrs, children }),
};
