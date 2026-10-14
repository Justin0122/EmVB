/** Server-enforced budgets (N-005). Real D1 caps rows at 2 MB but local D1 doesn't (K12, S0-8). */
export const MAX_LAYOUT_BYTES = 512 * 1024;
/** Plugin storage compare-and-set fails above 1 MiB (S0-9); the design doc budget stays well below. */
export const MAX_DESIGN_BYTES = 256 * 1024;
export const MAX_DEPTH = 24;
export const MAX_NODES = 2000;
export const MAX_TEXT_LENGTH = 2000;
/** Tabs show at most this many panels; the CSS-only switcher has a rule per tab. */
export const MAX_TABS = 12;

/**
 * W-509: `text` cut to at most `max` UTF-16 units, as schema limits count, without leaving half
 * of an emoji (a lone surrogate) at the end.
 */
export function clipText(text: string, max: number): string {
  if (text.length <= max) return text;
  const code = text.charCodeAt(max - 1);
  return text.slice(0, code >= 0xd800 && code <= 0xdbff ? max - 1 : max);
}
