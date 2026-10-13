import type { Extensions } from "@tiptap/core";
import { Image } from "@tiptap/extension-image";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { TableKit } from "@tiptap/extension-table";
import { StarterKit } from "@tiptap/starter-kit";
import { parseRichText } from "../../../core/sanitize/rich-text.ts";
import { serialize } from "../../../core/render/vnode.ts";

/**
 * W-323: what the rich text editor can make, matched to what the renderer keeps
 * (`core/sanitize/rich-text.ts`): paragraphs, h1–h6, bold, italic, underline, strike, code,
 * sub/superscript, links, lists, quotes, rules, line breaks, images and tables. Code blocks are
 * left out: the renderer has no <pre>.
 */
export function richTextExtensions(): Extensions {
  return [
    StarterKit.configure({
      codeBlock: false,
      // No empty paragraph forced after the last heading or table.
      trailingNode: false,
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
    }),
    Subscript,
    Superscript,
    Image.configure({ inline: true }),
    TableKit.configure({ table: { resizable: false } }),
  ];
}

/** The HTML as the renderer will show it, for comparing two values. */
const rendered = (html: string) => parseRichText(html).map(serialize).join("");

/** Tiptap's way of writing tables and empty paragraphs, undone. */
const strip = (html: string) =>
  rendered(html)
    .replace(/<(t[hd])><p>([\s\S]*?)<\/p><\/\1>/g, "<$1>$2</$1>")
    .replace(/<\/?(thead|tbody)>/g, "")
    .replace(/<p><\/p>/g, "");

/**
 * Whether two rich text values show the same thing. Tiptap writes some markup its own way (a
 * <p> in every table cell, a colgroup), which shouldn't count as a change.
 */
export function sameRichText(a: string, b: string): boolean {
  if (a === b) return true;
  return strip(a) === strip(b);
}
