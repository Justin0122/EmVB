import { PLUGIN_ID } from "../constants.ts";
import type { AgentSettings } from "../mcp/settings.ts";
import { requestJson, type Fetcher } from "./api.ts";

export type AgentActivity = {
  id: string;
  at: string;
  tool: string;
  target: "page" | "styles" | "settings";
  pageId?: string;
  revisionId?: string;
  summary: string;
  userId: string | null;
  client?: string;
};

export type AgentsState = {
  settings: AgentSettings;
  revision: string | null;
  endpoint: string;
  activity: AgentActivity[];
};

const base = `/_emdash/api/plugins/${PLUGIN_ID}`;

export const loadAgents = (fetcher: Fetcher) => requestJson<AgentsState>(fetcher, `${base}/agents`);

/** Saves the agent settings; the returned revision is the one the next save must send. */
export async function saveAgentSettings(
  fetcher: Fetcher,
  settings: AgentSettings,
  revision: string | null,
): Promise<string> {
  const body = await requestJson<{ revision: string }>(fetcher, `${base}/agents/save`, {
    method: "POST",
    body: { settings, revision },
  });
  return body.revision;
}
