import type { VNode } from "../render/vnode.ts";
import { sanitizeHref } from "./href.ts";

/**
 * W-309: Rich text. Stored HTML (pasted, imported or typed) becomes safe VNodes: a fixed set of
 * text, list and table tags, `href` on links (through `sanitizeHref`) and spans on table cells.
 * Everything else is dropped: attributes, styles, comments, and unknown tags, whose text is kept.
 * Scripts, styles and embeds are dropped with their contents. Text is escaped by the serializer.
 */

/** The longest Rich text the layout stores, in characters. */
export const MAX_RICH_TEXT = 100_000;
/** Deeper nesting than this is flattened into its parent, so a hostile paste can't go deep. */
const MAX_DEPTH = 32;

/** Tags kept as they are, or renamed to their modern form (b → strong, i → em…). */
const TAGS: Record<string, string> = {
  p: "p",
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  h5: "h5",
  h6: "h6",
  strong: "strong",
  b: "strong",
  em: "em",
  i: "em",
  u: "u",
  s: "s",
  strike: "s",
  del: "s",
  sub: "sub",
  sup: "sup",
  code: "code",
  a: "a",
  ul: "ul",
  ol: "ol",
  li: "li",
  blockquote: "blockquote",
  br: "br",
  hr: "hr",
  table: "table",
  caption: "caption",
  thead: "thead",
  tbody: "tbody",
  tfoot: "tfoot",
  tr: "tr",
  th: "th",
  td: "td",
};
const VOID = new Set([
  "br",
  "hr",
  "img",
  "input",
  "meta",
  "link",
  "col",
  "source",
  "wbr",
  "area",
  "base",
  "embed",
  "param",
  "track",
]);
/** Dropped together with everything inside them. */
const DROP = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "noscript",
  "template",
  "svg",
  "math",
  "head",
  "title",
  "textarea",
  "select",
  "button",
  "form",
  "frameset",
  "frame",
  "canvas",
  "audio",
  "video",
]);

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  euro: "€",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  middot: "·",
  bull: "•",
  times: "×",
  eacute: "é",
  egrave: "è",
  euml: "ë",
  ecirc: "ê",
  aacute: "á",
  agrave: "à",
  auml: "ä",
  iuml: "ï",
  ouml: "ö",
  uuml: "ü",
  ccedil: "ç",
};

function decode(raw: string): string {
  return raw.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]+);/gi, (whole, ref: string) => {
    if (ref.startsWith("#")) {
      const code =
        ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : Number(ref.slice(1));
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code)
        : whole;
    }
    return NAMED[ref.toLowerCase()] ?? whole;
  });
}

function attrOf(raw: string, name: string): string | undefined {
  const re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, "i");
  const match = re.exec(raw);
  if (!match) return undefined;
  return decode(match[1] ?? match[2] ?? match[3] ?? "");
}

/** The attributes a kept tag may carry. */
function attrsFor(tag: string, raw: string): Record<string, string> | null {
  if (tag === "a") {
    const href = attrOf(raw, "href")?.trim();
    const safe = href ? sanitizeHref(href) : undefined;
    // A link without a safe address is just its text.
    if (!safe) return null;
    return attrOf(raw, "target")?.trim() === "_blank"
      ? { href: safe, target: "_blank", rel: "noopener noreferrer" }
      : { href: safe };
  }
  if (tag === "th" || tag === "td") {
    const attrs: Record<string, string> = {};
    for (const name of ["colspan", "rowspan"]) {
      const value = attrOf(raw, name)?.trim();
      if (value && /^[1-9][0-9]{0,2}$/.test(value) && value !== "1") attrs[name] = value;
    }
    return attrs;
  }
  return {};
}

type Frame = { tag: string; node: VNode | null; children: (VNode | string)[] };

/** Rich text HTML as safe VNodes, ready for the serializer. */
export function parseRichText(html: string): (VNode | string)[] {
  const source = html.length > MAX_RICH_TEXT ? html.slice(0, MAX_RICH_TEXT) : html;
  const root: Frame = { tag: "#root", node: null, children: [] };
  const stack: Frame[] = [root];
  let dropping: { tag: string; depth: number } | null = null;
  const top = () => stack[stack.length - 1] as Frame;
  const token =
    /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<![^>]*>|<\?[^>]*>|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|[^<]+|</g;
  for (let match = token.exec(source); match; match = token.exec(source)) {
    const whole = match[0];
    const name = match[1]?.toLowerCase();
    if (!name) {
      // Text, or a comment / doctype / processing instruction, which are dropped.
      if (dropping || whole.startsWith("<!") || whole.startsWith("<?")) continue;
      top().children.push(decode(whole));
      continue;
    }
    const closing = whole.startsWith("</");
    const selfClosing = /\/\s*>$/.test(whole) || VOID.has(name);
    if (dropping) {
      if (name === dropping.tag && !selfClosing) dropping.depth += closing ? -1 : 1;
      if (dropping.depth === 0) dropping = null;
      continue;
    }
    if (!closing && DROP.has(name)) {
      if (!selfClosing) dropping = { tag: name, depth: 1 };
      continue;
    }
    const tag = TAGS[name];
    if (closing) {
      if (!tag) continue;
      // Close up to the matching open tag; a stray closing tag is ignored.
      const at = stack.findLastIndex((frame) => frame.tag === tag);
      if (at <= 0) continue;
      while (stack.length > at) closeFrame(stack);
      continue;
    }
    if (!tag) continue; // Unknown tag: its text stays, in the parent.
    const attrs = attrsFor(tag, match[2] ?? "");
    if (attrs === null) continue; // An unsafe link: its text stays, in the parent.
    const node: VNode = { tag, attrs, children: [] };
    if (tag === "br" || tag === "hr") {
      top().children.push(node);
      continue;
    }
    if (selfClosing) continue;
    if (stack.length > MAX_DEPTH) continue; // Too deep: flatten into the parent.
    stack.push({ tag, node, children: node.children });
  }
  while (stack.length > 1) closeFrame(stack);
  return root.children;
}

function closeFrame(stack: Frame[]) {
  const frame = stack.pop() as Frame;
  if (frame.node) (stack[stack.length - 1] as Frame).children.push(frame.node);
}

const visibleText = (nodes: (VNode | string)[]): string =>
  nodes
    .map((n) =>
      typeof n === "string" ? n : n.tag === "hr" || n.tag === "br" ? "" : visibleText(n.children),
    )
    .join("");

/** True when the HTML holds no visible text, so an editor can show its placeholder. */
export function richTextIsEmpty(html: string): boolean {
  return visibleText(parseRichText(html)).trim() === "";
}
