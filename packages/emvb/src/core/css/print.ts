/**
 * Print stylesheet (W-335). Chrome that only makes sense on screen is hidden.
 * Appended after scoped page CSS so the selectors stay global: a header, float or popup
 * is not inside the page's scope wrapper.
 */
export function printCss(): string {
  return (
    "@media print{" +
    ".emvb-theme-header,.emvb-theme-footer,.emvb-float,.emvb-popup{display:none!important}" +
    "}"
  );
}
