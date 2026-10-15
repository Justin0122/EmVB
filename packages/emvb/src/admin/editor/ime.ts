/**
 * True for an Enter that commits a field: not the Enter that confirms an IME
 * composition (Japanese, Chinese, Korean input), which must only finish the word (W-606).
 */
export function isCommitEnter(event: {
  key: string;
  keyCode?: number;
  nativeEvent?: { isComposing?: boolean };
  isComposing?: boolean;
}): boolean {
  if (event.key !== "Enter") return false;
  if (event.nativeEvent?.isComposing || event.isComposing) return false;
  return event.keyCode !== 229;
}

/**
 * W-681: true for an Escape that cancels a field, not the Escape an input method uses to drop the
 * word being composed. Fields cancelled on it threw away everything typed so far.
 */
export function isCancelEscape(event: {
  key: string;
  keyCode?: number;
  nativeEvent?: { isComposing?: boolean };
  isComposing?: boolean;
}): boolean {
  if (event.key !== "Escape") return false;
  if (event.nativeEvent?.isComposing || event.isComposing) return false;
  return event.keyCode !== 229;
}
