import {
  CodeIcon,
  ImageIcon,
  LinkSimpleIcon,
  ListBulletsIcon,
  ListNumbersIcon,
  QuotesIcon,
  TableIcon,
  TextBIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  TextUnderlineIcon,
  type Icon,
} from "@phosphor-icons/react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import * as React from "react";
import type { Fetcher } from "../../api.ts";
import { listImages, type MediaLibraryItem } from "../../media-api.ts";
import { FIELD } from "../../ui.ts";
import { richTextExtensions, sameRichText } from "./extensions.ts";

/** The block types the dropdown offers, in order. */
const BLOCKS = [
  { value: "p", label: "Paragraph" },
  { value: "h1", label: "Heading 1" },
  { value: "h2", label: "Heading 2" },
  { value: "h3", label: "Heading 3" },
  { value: "h4", label: "Heading 4" },
] as const;

type BlockValue = (typeof BLOCKS)[number]["value"];

function currentBlock(editor: Editor): BlockValue {
  for (const level of [1, 2, 3, 4] as const) {
    if (editor.isActive("heading", { level })) return `h${level}`;
  }
  return "p";
}

function setBlock(editor: Editor, value: BlockValue) {
  const chain = editor.chain().focus();
  if (value === "p") chain.setParagraph().run();
  else chain.setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 | 4 }).run();
}

function ToolButton({
  icon: IconComponent,
  label,
  active = false,
  disabled = false,
  onClick,
}: {
  icon?: Icon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="emvb-rte-btn"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the selection: a mousedown on the button would blur the editor first.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {IconComponent ? <IconComponent size={16} weight="bold" /> : label}
    </button>
  );
}

/** The link row: an address for the selection, applied, or the link removed. */
function LinkRow({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [href, setHref] = React.useState(String(editor.getAttributes("link")["href"] ?? "").trim());
  const apply = () => {
    const value = href.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (value) chain.setLink({ href: value }).run();
    else chain.unsetLink().run();
    onClose();
  };
  return (
    <div className="emvb-rte-row" data-emvb-rte-link="">
      <input
        className={FIELD}
        aria-label="Link address"
        placeholder="https://… or /page"
        value={href}
        autoFocus
        onChange={(event) => setHref(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            apply();
          } else if (event.key === "Escape") onClose();
        }}
      />
      <button type="button" className="emvb-rte-btn" onClick={apply}>
        Apply
      </button>
      {editor.isActive("link") && (
        <button
          type="button"
          className="emvb-rte-btn"
          onClick={() => {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            onClose();
          }}
        >
          Remove
        </button>
      )}
    </div>
  );
}

/** The image row: a library image or an address, inserted at the cursor. */
function ImageRow({
  editor,
  fetcher,
  onClose,
}: {
  editor: Editor;
  fetcher: Fetcher | undefined;
  onClose: () => void;
}) {
  const [src, setSrc] = React.useState("");
  const [images, setImages] = React.useState<MediaLibraryItem[] | null>(null);
  React.useEffect(() => {
    if (!fetcher) return;
    let live = true;
    void listImages(fetcher, { limit: 24 })
      .then((items) => live && setImages(items))
      .catch(() => live && setImages([]));
    return () => {
      live = false;
    };
  }, [fetcher]);
  const insert = (url: string, alt = "") => {
    if (!url.trim()) return;
    editor.chain().focus().setImage({ src: url.trim(), alt }).run();
    onClose();
  };
  return (
    <div className="emvb-rte-row emvb-rte-images" data-emvb-rte-image="">
      {images && images.length > 0 && (
        <div className="emvb-rte-thumbs">
          {images.map((item) => (
            <button
              key={item.id}
              type="button"
              className="emvb-rte-thumb"
              title={item.alt || item.filename}
              onClick={() => insert(item.url, item.alt ?? "")}
            >
              <img src={item.url} alt={item.alt ?? ""} loading="lazy" />
            </button>
          ))}
        </div>
      )}
      <div className="emvb-rte-row">
        <input
          className={FIELD}
          aria-label="Image address"
          placeholder="Image address"
          value={src}
          onChange={(event) => setSrc(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              insert(src);
            } else if (event.key === "Escape") onClose();
          }}
        />
        <button type="button" className="emvb-rte-btn" onClick={() => insert(src)}>
          Insert
        </button>
      </div>
    </div>
  );
}

/** The formatting buttons for an editor; shared by the panel field and the canvas (W-324). */
export function RichTextToolbar({
  editor,
  fetcher,
  source,
  onToggleSource,
}: {
  editor: Editor;
  fetcher?: Fetcher;
  /** Whether the HTML source is shown instead of the editor; omit to hide the toggle. */
  source?: boolean;
  onToggleSource?: () => void;
}) {
  const [row, setRow] = React.useState<"link" | "image" | null>(null);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: currentBlock(e),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      link: e.isActive("link"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      table: e.isActive("table"),
    }),
  });
  const run = (fn: (chain: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) => () =>
    fn(editor.chain().focus()).run();
  const off = source === true;
  return (
    <div className="emvb-rte-toolbar" role="toolbar" aria-label="Formatting">
      <div className="emvb-rte-row">
        <select
          className="emvb-rte-block"
          aria-label="Text style"
          value={state.block}
          disabled={off}
          onChange={(event) => setBlock(editor, event.currentTarget.value as BlockValue)}
        >
          {BLOCKS.map((block) => (
            <option key={block.value} value={block.value}>
              {block.label}
            </option>
          ))}
        </select>
        <ToolButton
          icon={TextBIcon}
          label="Bold"
          active={state.bold}
          disabled={off}
          onClick={run((c) => c.toggleBold())}
        />
        <ToolButton
          icon={TextItalicIcon}
          label="Italic"
          active={state.italic}
          disabled={off}
          onClick={run((c) => c.toggleItalic())}
        />
        <ToolButton
          icon={TextUnderlineIcon}
          label="Underline"
          active={state.underline}
          disabled={off}
          onClick={run((c) => c.toggleUnderline())}
        />
        <ToolButton
          icon={TextStrikethroughIcon}
          label="Strikethrough"
          active={state.strike}
          disabled={off}
          onClick={run((c) => c.toggleStrike())}
        />
        <ToolButton
          icon={LinkSimpleIcon}
          label="Link"
          active={state.link || row === "link"}
          disabled={off}
          onClick={() => setRow(row === "link" ? null : "link")}
        />
        <ToolButton
          icon={ListBulletsIcon}
          label="Bulleted list"
          active={state.bullet}
          disabled={off}
          onClick={run((c) => c.toggleBulletList())}
        />
        <ToolButton
          icon={ListNumbersIcon}
          label="Numbered list"
          active={state.ordered}
          disabled={off}
          onClick={run((c) => c.toggleOrderedList())}
        />
        <ToolButton
          icon={QuotesIcon}
          label="Quote"
          active={state.quote}
          disabled={off}
          onClick={run((c) => c.toggleBlockquote())}
        />
        <ToolButton
          icon={ImageIcon}
          label="Image"
          active={row === "image"}
          disabled={off}
          onClick={() => setRow(row === "image" ? null : "image")}
        />
        <ToolButton
          icon={TableIcon}
          label="Table"
          active={state.table}
          disabled={off || state.table}
          onClick={run((c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }))}
        />
        {onToggleSource && (
          <ToolButton icon={CodeIcon} label="HTML" active={off} onClick={onToggleSource} />
        )}
      </div>
      {state.table && !off && (
        <div className="emvb-rte-row" data-emvb-rte-table="">
          <ToolButton label="+ Row" onClick={run((c) => c.addRowAfter())} />
          <ToolButton label="+ Column" onClick={run((c) => c.addColumnAfter())} />
          <ToolButton label="− Row" onClick={run((c) => c.deleteRow())} />
          <ToolButton label="− Column" onClick={run((c) => c.deleteColumn())} />
          <ToolButton label="Header row" onClick={run((c) => c.toggleHeaderRow())} />
          <ToolButton label="Delete table" onClick={run((c) => c.deleteTable())} />
        </div>
      )}
      {row === "link" && !off && <LinkRow editor={editor} onClose={() => setRow(null)} />}
      {row === "image" && !off && (
        <ImageRow editor={editor} fetcher={fetcher} onClose={() => setRow(null)} />
      )}
    </div>
  );
}

/**
 * W-323: rich text edited as formatted text (Tiptap) instead of raw HTML: paragraphs, headings,
 * marks, links, lists, quotes, images and tables. The HTML toggle shows the source for anything
 * the toolbar doesn't cover. The output still goes through the renderer's allowlist.
 */
export function RichTextEditor({
  label,
  value,
  onChange,
  fetcher,
  help,
}: {
  label: string;
  value: string;
  onChange: (html: string) => void;
  fetcher?: Fetcher;
  help?: React.ReactNode;
}) {
  const [source, setSource] = React.useState(false);
  const latest = React.useRef(onChange);
  latest.current = onChange;
  const editor = useEditor({
    extensions: richTextExtensions(),
    content: value,
    editorProps: { attributes: { class: "emvb-rte-content", "aria-label": label } },
    onUpdate: ({ editor: e }) => latest.current(e.isEmpty ? "" : e.getHTML()),
  });

  // A value changed elsewhere (undo, the canvas, another field) replaces the content, unless it
  // only differs in markup Tiptap writes differently.
  React.useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (sameRichText(editor.isEmpty ? "" : editor.getHTML(), value)) return;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  return (
    <div className="emvb-field-block emvb-rte" data-emvb-rich-text-editor="">
      <span className="emvb-field-label">{label}</span>
      {editor && (
        <RichTextToolbar
          editor={editor}
          fetcher={fetcher}
          source={source}
          onToggleSource={() => setSource(!source)}
        />
      )}
      {source ? (
        <textarea
          className={`${FIELD} emvb-textarea emvb-rte-source`}
          aria-label={`${label} (HTML)`}
          rows={10}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      ) : (
        <EditorContent editor={editor} />
      )}
      {help}
    </div>
  );
}
