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
