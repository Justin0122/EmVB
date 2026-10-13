import { Banner, ClipboardText, Empty, Loader, Switch, Table } from "@cloudflare/kumo";
import { LockKeyIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { defaultFetcher, type Fetcher } from "../api.ts";
import { loadAgents, saveAgentSettings, type AgentsState } from "../agents-api.ts";
import { useRole } from "../access/role.ts";
import { editorUrl } from "../editor/exit.ts";
import type { AgentSettings } from "../../mcp/settings.ts";

const ADMIN_ROLE = 50;

/** The stdio bridge config a person pastes into their MCP client (plan § 4). */
const stdioSnippet = (site: string) =>
  JSON.stringify(
    {
      mcpServers: {
        emvb: {
          command: "npx",
          args: ["-y", "@perkyzz/emvb-mcp", "--site", site],
          env: { EMVB_TOKEN: "<your EmDash API token>" },
        },
      },
    },
    null,
    2,
  );

const remoteSnippet = (endpoint: string) =>
  JSON.stringify({ mcpServers: { emvb: { url: endpoint } } }, null, 2);

/** AI agents (`/agents`, W-463): the master switch, publishing, how to connect, recent activity. */
export function AgentsPage({ fetcher = defaultFetcher }: { fetcher?: Fetcher }) {
  const role = useRole(fetcher);
  const [state, setState] = useState<AgentsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isAdmin = role.state === "ready" && role.role >= ADMIN_ROLE;

  useEffect(() => {
    if (!isAdmin) return;
    loadAgents(fetcher)
      .then(setState)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [fetcher, isAdmin]);

  if (role.state === "loading") return <Loader />;
  if (!isAdmin) {
    return (
      <section data-emvb-access="denied">
        <Empty
          icon={<LockKeyIcon aria-hidden="true" />}
          title="Only administrators can manage AI agents"
          description="Ask an administrator to change these settings."
        />
      </section>
    );
  }
  if (error) {
    return (
      <Banner
        variant="error"
        icon={<WarningCircleIcon aria-hidden="true" />}
        title="Couldn't load the AI agent settings"
        description={error}
      />
    );
  }
  if (!state) return <Loader />;

  const change = async (patch: Partial<AgentSettings>) => {
    const settings = { ...state.settings, ...patch };
    setSaving(true);
    try {
      const revision = await saveAgentSettings(fetcher, settings, state.revision);
      setState({ ...state, settings, revision });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  const site = new URL(state.endpoint).origin;
  const { settings } = state;

  return (
    <div className="emvb-pages emvb-agents" data-emvb-agents="ready">
      <h1>AI agents</h1>
      <section aria-labelledby="emvb-agents-access">
        <h2 id="emvb-agents-access">Access</h2>
        <Switch
          label="Let AI agents edit EmVB pages"
          checked={settings.mcpEnabled}
          disabled={saving}
          onCheckedChange={(checked: boolean) => void change({ mcpEnabled: checked })}
        />
        <p>
          Agents only change drafts. Every change shows in the page's version timeline and can be
          restored. MCP endpoint:
        </p>
        <ClipboardText text={state.endpoint} />
      </section>
      <section aria-labelledby="emvb-agents-publish">
        <h2 id="emvb-agents-publish">Publishing</h2>
        <Switch
          label="Agents may publish pages"
          checked={settings.publishPages}
          disabled={saving || !settings.mcpEnabled}
          onCheckedChange={(checked: boolean) => void change({ publishPages: checked })}
        />
        <Switch
          label="Agents may publish site styles"
          checked={settings.publishStyles}
          disabled={saving || !settings.mcpEnabled}
          onCheckedChange={(checked: boolean) => void change({ publishStyles: checked })}
        />
        <p>Published changes go live immediately. Each one is still in the version timeline.</p>
      </section>
      <section aria-labelledby="emvb-agents-connect">
        <h2 id="emvb-agents-connect">How to connect</h2>
        <p>
          Create a token in EmDash → API tokens with the scope <code>mcp:tools:emvb</code> for a
          user who is an editor or above. Never give an agent an admin token.
        </p>
        <h3>Remote (EmDash MCP, sign in with OAuth)</h3>
        <pre data-emvb-snippet="remote">{remoteSnippet(state.endpoint)}</pre>
        <h3>Local (stdio)</h3>
        <pre data-emvb-snippet="stdio">{stdioSnippet(site)}</pre>
      </section>
      <section aria-labelledby="emvb-agents-activity">
        <h2 id="emvb-agents-activity">Recent agent activity</h2>
        {state.activity.length === 0 ? (
          <p>No agent changes yet.</p>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>When</Table.Head>
                <Table.Head>Who</Table.Head>
                <Table.Head>Change</Table.Head>
                <Table.Head>Page</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {state.activity.map((entry) => (
                <Table.Row key={entry.id}>
                  <Table.Cell>{new Date(entry.at).toLocaleString()}</Table.Cell>
                  <Table.Cell>
                    {entry.userId ?? "unknown"}
                    {entry.client ? ` (${entry.client})` : ""}
                  </Table.Cell>
                  <Table.Cell>{entry.summary}</Table.Cell>
                  <Table.Cell>
                    {entry.pageId ? <a href={editorUrl(entry.pageId)}>Open in editor</a> : "—"}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </section>
    </div>
  );
}
