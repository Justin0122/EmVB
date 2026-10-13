import { z } from "zod";
import { DesignSystem } from "../core/schema/design.ts";
import { Layout } from "../core/schema/layout.ts";

/** JSON Schema (2020-12) of a stored layout, for `emvb://schema/layout` (W-467). */
export const layoutJsonSchema = () =>
  z.toJSONSchema(Layout, { io: "input", unrepresentable: "any" });

/** JSON Schema of the design system (site styles), for `emvb://schema/design`. */
export const designJsonSchema = () =>
  z.toJSONSchema(DesignSystem, { io: "input", unrepresentable: "any" });

export type PromptDef = {
  name: string;
  title: string;
  description: string;
  args: Record<string, { description: string; required: boolean }>;
  text(args: Record<string, string | undefined>): string;
};

const list = (value: string | undefined) => (value ? ` Sections to include: ${value}.` : "");

/** Workflow prompts (plan § 3 Prompts). They only describe steps; the tools do the work. */
export const PROMPTS: PromptDef[] = [
  {
    name: "build_landing_page",
    title: "Build a landing page",
    description:
      "Plan and build a new draft landing page from a topic, ready for a person to review.",
    args: {
      topic: { description: "What the page is about", required: true },
      audience: { description: "Who it is for", required: false },
      sections: { description: "Sections to include, comma-separated", required: false },
    },
    text: (a) =>
      `Build a draft EmVB landing page about "${a["topic"] ?? ""}"${a["audience"] ? ` for ${a["audience"]}` : ""}.${list(a["sections"])}
1. Call get_site_styles and list_section_recipes, and use the site's variables, not raw colours.
2. Call create_page with a clear title and the recipes that fit.
3. Replace placeholder copy with update_element; keep headings in order (one h1).
4. Call get_accessibility_findings and fix every error.
5. Do not publish. Finish with describe_page and a short summary for the person to review.`,
  },
  {
    name: "fix_accessibility",
    title: "Fix accessibility findings",
    description: "Fix the accessibility findings on one page, then re-check.",
    args: { pageId: { description: "The page id (from list_pages)", required: true } },
    text: (a) =>
      `Call get_accessibility_findings for page ${a["pageId"] ?? ""}. Apply each finding's fix with update_element (pass the page rev you read as expectedRev), then call get_accessibility_findings again and report what is left. Do not publish.`,
  },
  {
    name: "restyle_site",
    title: "Restyle the site",
    description: "Propose and apply site style changes to the style draft only.",
    args: { brief: { description: "The look you want", required: true } },
    text: (a) =>
      `Restyle the site to match: "${a["brief"] ?? ""}". Call get_site_styles, propose variable and class changes, then apply them with update_site_styles (draft only). Never remove a variable that is in use. Do not publish; a person reviews the style draft.`,
  },
  {
    name: "review_page",
    title: "Review a page",
    description: "Write a review of one page without changing it.",
    args: { pageId: { description: "The page id (from list_pages)", required: true } },
    text: (a) =>
      `Review page ${a["pageId"] ?? ""} without editing it: call describe_page and get_accessibility_findings, then write a short review covering structure, copy, accessibility and consistency with the site styles.`,
  },
];
