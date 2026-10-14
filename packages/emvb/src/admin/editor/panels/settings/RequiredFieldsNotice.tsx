import { Banner } from "@cloudflare/kumo";
import { WarningIcon } from "@phosphor-icons/react";
import * as React from "react";
import type { Fetcher } from "../../../api.ts";
import { loadFormFields, type DefinitionField } from "../../../forms-api.ts";
import {
  requiredFieldIssues,
  requiredFieldIssueText,
  type LayoutNode,
} from "../../../../core/index.ts";

/**
 * W-511: on a Form, the required fields visitors can't fill: missing from the form, or hidden on
 * a device. Either way the form can't be sent there, and the visitor sees no reason why.
 */
export function RequiredFieldsNotice({ node, fetcher }: { node: LayoutNode; fetcher: Fetcher }) {
  const formId = String((node.props as { formId?: unknown }).formId ?? "").trim();
  const [fields, setFields] = React.useState<DefinitionField[] | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    setFields(null);
    if (!formId) return undefined;
    void loadFormFields(fetcher, formId).then((next) => {
      if (!cancelled) setFields(next);
    });
    return () => {
      cancelled = true;
    };
  }, [fetcher, formId]);
  const issues = fields ? requiredFieldIssues(node, fields) : [];
  if (issues.length === 0) return null;
  const title =
    issues.length === 1
      ? "A required field can't be filled in"
      : `${issues.length} required fields can't be filled in`;
  return (
    <div className="emvb-required-notice" data-emvb-required-fields="">
      <Banner
        variant="alert"
        icon={<WarningIcon aria-hidden="true" />}
        title={title}
        description={
          <ul className="emvb-required-notice__list">
            {issues.map((issue) => (
              <li key={`${issue.kind}:${issue.field}`} data-emvb-required-issue={issue.kind}>
                {requiredFieldIssueText(issue)}
              </li>
            ))}
          </ul>
        }
      />
    </div>
  );
}
