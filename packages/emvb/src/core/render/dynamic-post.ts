import { clipText } from "../limits.ts";
import { HEADING_TAGS } from "../elements/index.ts";
import type { LayoutNode, POST_DATE_FORMATS } from "../schema/layout.ts";
import { sanitizeHref } from "../sanitize/href.ts";
import { sanitizeMediaUrl } from "../sanitize/media-url.ts";
import { portableTextToVNodes, type ThemePostFields } from "../theme/dynamic.ts";
import type { RenderMode } from "./context.ts";
import type { VNode } from "./vnode.ts";

/** Scripts written without spaces between words; a space-separated chunk holds many words. */
const UNSPACED =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
let wordSegmenter: Intl.Segmenter | undefined;

/**
 * The first `max` words, then "…". W-660: Japanese, Chinese or Thai text has no spaces between
 * words, so splitting on spaces counted a whole excerpt as one word and never shortened it.
 * Those chunks are split into words; spaced text is counted by spaces as before.
 */
function limitWords(text: string, max: number | undefined): string {
  if (!max || max < 1) return text;
  let count = 0;
  for (const chunk of text.matchAll(/\S+/g)) {
    const start = chunk.index ?? 0;
    if (!UNSPACED.test(chunk[0])) {
      count++;
      if (count === max) return finish(text, start + chunk[0].length);
      continue;
    }
    wordSegmenter ??= new Intl.Segmenter(undefined, { granularity: "word" });
    for (const piece of wordSegmenter.segment(chunk[0])) {
      if (!piece.isWordLike) continue;
      count++;
      if (count === max) return finish(text, start + piece.index + piece.segment.length);
    }
  }
  return text;
}

const finish = (text: string, end: number) =>
  text.slice(end).trim() === "" ? text : `${text.slice(0, end).trim().replace(/\s+/g, " ")}…`;

/**
 * W-196: only an ISO date (`2026-10-06`, optionally with a time) is read as a date. `Date.parse`
 * also takes text like "Spring 2026" (as Jan 1) or "2026-02-30", which would show a wrong date.
 */
const parseIsoDate = (raw: string): number => {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(raw);
  if (!match) return Number.NaN;
  const parsed = Date.parse(raw.replace(" ", "T"));
  if (Number.isNaN(parsed)) return Number.NaN;
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  // W-599: the day as written. A post at 22:00-04:00 was published that day, not the next
  // one in UTC, and a time with no zone isn't moved by the server's zone.
  return day.getUTCDate() === Number(match[3]) && day.getUTCMonth() === Number(match[2]) - 1
    ? day.getTime()
    : Number.NaN;
};

type Attrs = Record<string, string>;

type PostField = {
  /** Shown in the editor when there is no post, or the post lacks this field; public pages show nothing. */
  placeholder: (attrs: Attrs) => VNode;
  /** Whether the post has this field; the placeholder stands in when it doesn't. */
  has?: (post: ThemePostFields) => boolean;
  /** The field's markup, or nothing when the post's value is empty or unsafe. */
  render: (
    node: LayoutNode,
    attrs: Attrs,
    post: ThemePostFields,
    inLoop: boolean,
    lang?: string,
  ) => VNode | undefined;
};

type PostDateFormat = (typeof POST_DATE_FORMATS)[number];

/** A BCP 47-shaped language tag Intl can use, else English (W-688). */
function dateLocale(lang: string | undefined): string {
  if (!lang || !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(lang)) return "en";
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([lang])[0] ?? "en";
  } catch {
    return "en";
  }
}

/**
 * In UTC on the written day, so the date doesn't move with the server's time zone.
 * W-688: in the page's language ("6 oct. 2026" on a French site); it was always English.
 */
function formatPostDate(time: number, format: PostDateFormat, lang?: string): string {
  const date = new Date(time);
  if (format === "numeric") return date.toISOString().slice(0, 10);
  return new Intl.DateTimeFormat(dateLocale(lang), { dateStyle: format, timeZone: "UTC" }).format(
    date,
  );
}

const props = <T>(node: LayoutNode) => node.props as T;

const POST_FIELDS = new Map<string, PostField>([
  [
    "post-title",
    {
      placeholder: (attrs) => ({ tag: "h1", attrs, children: ["Post Title"] }),
      // W-661: an untitled post left an empty heading on the page (a blank entry for screen
      // reader heading lists).
      has: (post) => !!post.title?.trim(),
      render: (node, attrs, post) => {
        const level = props<{ level?: number }>(node).level ?? 1;
        const tag = HEADING_TAGS[Math.min(6, Math.max(1, level)) - 1] ?? "h1";
        return { tag, attrs, children: [post.title] };
      },
    },
  ],
  [
    "post-excerpt",
    {
      placeholder: (attrs) => ({ tag: "p", attrs, children: ["Post excerpt…"] }),
      render: (node, attrs, post) => {
        if (!post.excerpt?.trim()) return undefined;
        const text = limitWords(post.excerpt, props<{ maxWords?: number }>(node).maxWords);
        return { tag: "p", attrs, children: [text] };
      },
    },
  ],
  [
    "post-content",
    {
      placeholder: (attrs) => ({
        tag: "div",
        attrs,
        children: [{ tag: "p", attrs: {}, children: ["Post content…"] }],
      }),
      render: (_node, attrs, post) => {
        const blocks = portableTextToVNodes(post.content);
        return blocks.length > 0 ? { tag: "div", attrs, children: blocks } : undefined;
      },
    },
  ],
  [
    "post-image",
    {
      placeholder: (attrs) => ({
        tag: "div",
        attrs: { ...attrs, class: `${attrs.class ?? ""} emvb-post-image-missing`.trim() },
        children: ["Featured image"],
      }),
      has: (post) => !!post.featuredImageUrl,
      render: (node, attrs, post, inLoop) => {
        const src = sanitizeMediaUrl(post.featuredImageUrl ?? "");
        if (!src) return undefined;
        const alt = props<{ decorative?: boolean }>(node).decorative
          ? ""
          : post.featuredImageAlt?.trim() || post.title?.trim() || "Featured image";
        // W-440: a Loop's images below the fold loaded all at once; like Image, they wait.
        // A single post's featured image is usually the hero, so it isn't delayed.
        const lazy: Attrs = inLoop ? { loading: "lazy", decoding: "async" } : {};
        return { tag: "img", attrs: { ...attrs, src, alt, ...lazy }, children: [] };
      },
    },
  ],
  [
    "post-link",
    {
      placeholder: (attrs) => ({
        tag: "a",
        attrs: { ...attrs, href: "#" },
        children: ["Post link"],
      }),
      render: (node, attrs, post) => {
        const href = sanitizeHref(post.permalink);
        if (!href) return undefined;
        const { text, newTab } = props<{ text?: string; newTab?: boolean }>(node);
        const linkAttrs: Attrs = { ...attrs, href };
        if (newTab) {
          linkAttrs.target = "_blank";
          linkAttrs.rel = "noopener noreferrer";
        }
        const label = text?.trim();
        const title = post.title.trim();
        // W-439: a Loop repeats the same "Read more" for every post; screen readers listing links
        // heard it N times. The name keeps the visible text first and adds the post's title.
        if (label && title && !label.toLowerCase().includes(title.toLowerCase())) {
          linkAttrs["aria-label"] = `${label}: ${title}`;
        }
        return {
          tag: "a",
          attrs: linkAttrs,
          children: [label || title || post.permalink],
        };
      },
    },
  ],
  [
    "post-date",
    {
      placeholder: (attrs) => ({ tag: "time", attrs, children: ["Post date"] }),
      has: (post) => !!post.publishedAt?.trim(),
      render: (node, attrs, post, _inLoop, lang) => {
        const raw = post.publishedAt?.trim();
        if (!raw) return undefined;
        const parsed = parseIsoDate(raw);
        const format = props<{ format?: PostDateFormat }>(node).format ?? "medium";
        // W-700: whole characters, so a long free-text date doesn't end in half an emoji.
        const text = Number.isNaN(parsed)
          ? clipText(raw, 80)
          : formatPostDate(parsed, format, lang);
        // W-196: `datetime` must be machine-readable, so a date we can't read only shows as text.
        const timeAttrs = Number.isNaN(parsed) ? attrs : { ...attrs, datetime: raw.slice(0, 80) };
        return { tag: "time", attrs: timeAttrs, children: [text] };
      },
    },
  ],
  [
    "post-author",
    {
      placeholder: (attrs) => ({ tag: "span", attrs, children: ["Author"] }),
      has: (post) => !!post.authorName?.trim(),
      render: (_node, attrs, post) => {
        const name = post.authorName?.trim();
        return name ? { tag: "span", attrs, children: [clipText(name, 200)] } : undefined;
      },
    },
  ],
]);

export const isDynamicPostNode = (node: LayoutNode) => POST_FIELDS.has(node.type);

/** A post field element: the post's value publicly, a placeholder in the editor when there is no post. */
export function renderDynamicPost(
  node: LayoutNode,
  attrs: Attrs,
  post: ThemePostFields | undefined,
  mode: RenderMode,
  inLoop = false,
  /** The page's language, e.g. "fr-CA", for dates (W-688). */
  lang?: string,
): VNode | undefined {
  const field = POST_FIELDS.get(node.type);
  if (!field) return undefined;
  if (!post || field.has?.(post) === false) {
    return mode === "editor" ? field.placeholder(attrs) : undefined;
  }
  return field.render(node, attrs, post, inLoop, lang);
}
