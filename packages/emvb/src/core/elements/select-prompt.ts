/** The Select's empty first choice: its Placeholder, or "Choose…" (W-686). */
export const selectPrompt = (props: { placeholder?: string | undefined }): string =>
  props.placeholder?.trim() || "Choose…";
