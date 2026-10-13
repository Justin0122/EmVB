import layoutFormat from "../../../docs/system/layout-format.md" with { type: "text" };
import skill from "../skill/emvb-page-builder/SKILL.md" with { type: "text" };
import skillLayout from "../skill/emvb-page-builder/references/layout.md" with { type: "text" };
import skillWorkflow from "../skill/emvb-page-builder/references/workflow.md" with { type: "text" };

/** Text the bridge serves locally; bundled into dist/cli.mjs at build time (W-467, W-468). */
export const DOCS = { layoutFormat };

/** The `emvb-page-builder` skill files, by path inside the skill. */
export const SKILL_FILES: Record<string, string> = {
  "SKILL.md": skill,
  "references/workflow.md": skillWorkflow,
  "references/layout.md": skillLayout,
};
