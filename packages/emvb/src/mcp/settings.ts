import { z } from "zod";

/** Site-owner settings for AI agents (plan § 4, D-055). Only admins change them; no tool does. */
export const AgentSettings = z.object({
  /** Master switch "Let AI agents edit EmVB pages" (off by default). */
  mcpEnabled: z.boolean(),
  /** Agents may publish pages (`publish_page`). */
  publishPages: z.boolean(),
  /** Agents may publish the site styles (`publish_site_styles`). */
  publishStyles: z.boolean(),
});
export type AgentSettings = z.infer<typeof AgentSettings>;

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  mcpEnabled: false,
  publishPages: false,
  publishStyles: false,
};
