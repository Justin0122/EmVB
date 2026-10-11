import type { DesignSystem } from "../core/index.ts";
import { PLUGIN_ID } from "../constants.ts";
import { requestJson, type Fetcher } from "./api.ts";

/** Saves the design draft. The returned revision is the one the next save must send. */
export async function saveDesign(
  fetcher: Fetcher,
  design: DesignSystem,
  revision: string | null,
): Promise<string> {
  const body = await requestJson<{ revision: string }>(
    fetcher,
    `/_emdash/api/plugins/${PLUGIN_ID}/design/save`,
    { method: "POST", body: { design, revision } },
  );
  return body.revision;
}

/** Publishes the design draft. `publishedRevision` is the revision the editor last saw published. */
export async function publishDesign(
  fetcher: Fetcher,
  publishedRevision: string | null,
): Promise<string> {
  const body = await requestJson<{ revision: string }>(
    fetcher,
    `/_emdash/api/plugins/${PLUGIN_ID}/design/publish`,
    { method: "POST", body: { publishedRevision } },
  );
  return body.revision;
}
