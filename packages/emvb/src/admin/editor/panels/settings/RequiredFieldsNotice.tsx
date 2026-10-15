import { Banner } from "@cloudflare/kumo";
import { WarningIcon } from "@phosphor-icons/react";
import * as React from "react";
import type { Fetcher } from "../../../api.ts";
import { loadFormFields, type DefinitionField } from "../../../forms-api.ts";
import {
  impossibleRangeFields,
  requiredFieldIssues,
  requiredFieldIssueText,
  type LayoutNode,
  type RequiredFieldIssue,
} from "../../../../core/index.ts";

/** The panel's short line for one issue; the full sentence is its tooltip and the MCP text. */
function shortReason(issue: RequiredFieldIssue): string {
  if (issue.kind === "missing") return `has no field on this form (${issue.field}).`;
  if (issue.kind === "hidden") {
    return issue.devices.length === 3
      ? "is hidden on every device."
      : `is hidden on ${issue.devices.join(" and ")}.`;
  }
  return `is shown only to some visitors: ${issue.who}.`;
}

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
  const ranges = fields ? impossibleRangeFields(fields) : [];
  if (issues.length === 0 && ranges.length === 0) return null;
  const rangeBanner =
    ranges.length > 0 ? (
      <Banner
        variant="alert"
        icon={<WarningIcon aria-hidden="true" />}
        title={
          ranges.length === 1
            ? "A field's limits can't be met"
            : `${ranges.length} fields' limits can't be met`
        }
        description={
          <ul className="emvb-required-notice__list">
            {ranges.map((range) => (
              <li key={range.name} data-emvb-range-issue={range.kind}>
                <strong>{range.label}</strong>{" "}
                {range.kind === "length"
                  ? "has a minimum length above its maximum length"
                  : "has a minimum value above its maximum"}
                , so no answer is accepted. Fix the limits in Forms.
              </li>
            ))}
          </ul>
        }
      />
    ) : null;
  if (issues.length === 0) {
    return (
      <div className="emvb-required-notice" data-emvb-range-fields="">
        {rangeBanner}
      </div>
    );
  }
  const title =
    issues.length === 1
      ? "A required field can't be filled in"
      : `${issues.length} required fields can't be filled in`;
  return (
    <div className="emvb-required-notice" data-emvb-required-fields="">
      {rangeBanner}
      <Banner
        variant="alert"
        icon={<WarningIcon aria-hidden="true" />}
        title={title}
        description={
          <>
            <ul className="emvb-required-notice__list">
              {issues.map((issue) => (
                <li
                  key={`${issue.kind}:${issue.field}`}
                  data-emvb-required-issue={issue.kind}
                  title={requiredFieldIssueText(issue)}
                >
                  <strong>{issue.label}</strong> {shortReason(issue)}
                </li>
              ))}
            </ul>
            <span className="emvb-required-notice__hint">
              Visitors who can't fill a required field can't send the form. Show the field to
              everyone, or make it optional in Forms.
            </span>
          </>
        }
      />
    </div>
  );
}
