import type { Extensions } from "@tiptap/core";
import { Image } from "@tiptap/extension-image";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { TableKit } from "@tiptap/extension-table";
import { StarterKit } from "@tiptap/starter-kit";

/**
 * W-325: what the on-page rich text editor can make. The same list as the admin's editor
 * (`admin/editor/rich-text/extensions.ts`, W-323), which this runtime may not import; keep the
 * two in step. Both match what the renderer keeps (`core/sanitize/rich-text.ts`).
 */
export function inlineRichTextExtensions(): Extensions {
  return [
    StarterKit.configure({
      codeBlock: false,
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
