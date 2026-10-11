/** JSON for a script tag. `<` is written as `\u003c` so the text cannot close the tag. */
export function jsonLdScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
