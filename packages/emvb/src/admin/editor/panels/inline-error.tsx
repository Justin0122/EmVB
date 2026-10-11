import { WarningCircleIcon } from "@phosphor-icons/react";

/** A one-line alert under a field. */
export function InlineError({ children }: { children: string }) {
  return (
    <p className="emvb-inline-error" role="alert">
      <WarningCircleIcon size={16} aria-hidden="true" />
      {children}
    </p>
  );
}
