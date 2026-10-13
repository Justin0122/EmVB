import * as React from "react";
import { PLUGIN_ID } from "../../constants.ts";
import { requestJson, type Fetcher } from "../api.ts";

/** How often an idle editor checks whether the page changed elsewhere (W-466). */
const REMOTE_CHECK_MS = 20_000;

export type RemoteChange = null | "agent" | "other";

/**
 * What changed the stored draft since `rev`: null when nothing did, "agent" when the newest
 * version is one an AI agent saved, "other" for anyone else.
 */
export async function checkRemoteChange(
  fetcher: Fetcher,
  collection: string,
  id: string,
  rev: string,
): Promise<RemoteChange> {
  const body = await requestJson<{ item?: { draftRevisionId?: string | null }; _rev?: string }>(
    fetcher,
    `/_emdash/api/content/${collection}/${encodeURIComponent(id)}`,
  );
  const stored = body["_rev"];
  if (!stored || stored === rev) return null;
  const draft = body.item?.draftRevisionId;
  if (!draft) return "other";
  const agents = await requestJson<{ versions?: { revisionId: string }[] }>(
    fetcher,
    `/_emdash/api/plugins/${PLUGIN_ID}/agents/page`,
    { method: "POST", body: { pageId: id } },
  ).catch(() => ({ versions: [] }));
  return (agents.versions ?? []).some((v) => v.revisionId === draft) ? "agent" : "other";
}

/**
 * Polls while the editor is idle (no unsaved edits, nothing in flight, tab visible) and reports
 * when the page changed elsewhere, so the person can reload before their next save conflicts.
 */
export function useRemoteChange(
  fetcher: Fetcher,
  collection: string,
  id: string,
  rev: string | null,
  idle: boolean,
): RemoteChange {
  const [change, setChange] = React.useState<RemoteChange>(null);
  React.useEffect(() => setChange(null), [rev]);
  React.useEffect(() => {
    if (!idle || !rev || change) return;
    let cancelled = false;
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      checkRemoteChange(fetcher, collection, id, rev).then(
        (next) => {
          if (!cancelled && next) setChange(next);
        },
        () => undefined,
      );
    }, REMOTE_CHECK_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [fetcher, collection, id, rev, idle, change]);
  return change;
}
