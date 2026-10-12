import type { FontFile, VariableKind } from "../../../core/index.ts";
import { isFontFileUrl } from "../../../core/sanitize/media-url.ts";

export type Length = { value: number; unit: "px" | "rem" | "em" | "%" };

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const LENGTH = /^(\d+(?:\.\d+)?|\.\d+)\s*(px|rem|em|%)?$/i;
const MAX_LENGTH = 10_000;

export const isLengthKind = (kind: VariableKind) => kind === "fontSize" || kind === "spacing";

/** "16", "16px", "1.5rem", "2em" or "50%" as a length (px when no unit); undefined otherwise. */
export function parseLength(text: string): Length | undefined {
  const match = LENGTH.exec(text.trim());
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value > MAX_LENGTH) return undefined;
  const unit = (match[2]?.toLowerCase() ?? "px") as Length["unit"];
  return { value, unit };
}

const formatLength = (length: Length) => `${length.value}${length.unit}`;

/** The length in px for previews: rem and em at 16 px, % as the 16 px base. */
export function lengthPx(length: Length): number {
  if (length.unit === "px") return length.value;
  if (length.unit === "%") return (length.value / 100) * 16;
  return length.value * 16;
}

/** The value the field shows for a stored variable value. */
export function valueText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "value" in value && "unit" in value) {
    return formatLength(value as Length);
  }
  return "";
}

const ERRORS: Record<VariableKind, string> = {
  color: "Enter a hex color such as #1a2b3c.",
  font: "Enter a font stack such as Inter, sans-serif.",
  fontSize: "Enter a size such as 16, 16px or 1.5rem.",
  spacing: "Enter a length such as 16, 16px or 1.5rem.",
};

/** The stored value for `text`, or the message that explains how to fix it. */
export function parseValue(
  kind: VariableKind,
  text: string,
): { ok: true; value: string | Length } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (isLengthKind(kind)) {
    const length = parseLength(trimmed);
    return length ? { ok: true, value: length } : { ok: false, error: ERRORS[kind] };
  }
  if (kind === "color") {
    return HEX.test(trimmed) ? { ok: true, value: trimmed } : { ok: false, error: ERRORS.color };
  }
  return trimmed && trimmed.length <= 200
    ? { ok: true, value: trimmed }
    : { ok: false, error: ERRORS.font };
}

/** A 6-digit hex for `<input type="color">`, which can't show 3, 4 or 8-digit forms. */
export function pickerHex(hex: string): string {
  const h = hex.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(h)) return h;
  if (/^#[0-9a-f]{8}$/.test(h)) return h.slice(0, 7);
  if (/^#[0-9a-f]{3,4}$/.test(h)) {
    return `#${Array.from(h.slice(1, 4), (c) => c + c).join("")}`;
  }
  return "#000000";
}

/** W-321: a font's files as editable lines: `url [weight] [italic]`. */
export function fontFilesText(files: readonly FontFile[] | undefined): string {
  return (files ?? [])
    .map((file) =>
      [
        file.url,
        file.weight && file.weight !== 400 ? String(file.weight) : "",
        file.style === "italic" ? "italic" : "",
      ]
        .filter(Boolean)
        .join(" "),
    )
    .join("\n");
}

/** W-321: the lines back as files. Each line is a file URL, then an optional weight and `italic`. */
export function parseFontFiles(
  text: string,
): { ok: true; files: FontFile[] } | { ok: false; error: string } {
  const files: FontFile[] = [];
  for (const line of text.split("\n")) {
    const [url, ...rest] = line.trim().split(/\s+/);
    if (!url) continue;
    if (!isFontFileUrl(url)) {
      return {
        ok: false,
        error: `“${url.slice(0, 80)}” isn't a .woff2, .woff, .ttf or .otf file URL.`,
      };
    }
    const file: FontFile = { url };
    for (const word of rest) {
      if (/^[1-9]00$/.test(word)) file.weight = Number(word);
      else if (word === "italic") file.style = "italic";
      else if (word !== "normal")
        return { ok: false, error: `Unknown “${word}”: use a weight such as 700, or italic.` };
    }
    files.push(file);
  }
  return files.length > 18
    ? { ok: false, error: "At most 18 files per font." }
    : { ok: true, files };
}
