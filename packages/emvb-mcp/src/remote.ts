import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

/** One tool result as the MCP spec defines it. */
export type ToolResult = {
  content: { type: string; text?: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
};

/** Where the bridge sends tool calls: the site's EmDash MCP endpoint (R1 D-054). */
export interface Remote {
  /** `name` is the EmDash name, `emvb__<tool>`. */
  call(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  close(): Promise<void>;
}

/** W-498: an error never carries the token on to the agent (a header error quotes it). */
export function redactToken(error: unknown, token: string): unknown {
  if (!token || !(error instanceof Error) || !error.message.includes(token)) return error;
  const clean = new Error(error.message.split(token).join("[token]"));
  clean.name = error.name;
  return clean;
}

/** An MCP client to `https://site/_emdash/api/mcp` with the token as a Bearer, connected lazily. */
export function httpRemote(endpoint: URL, token: string, version: string): Remote {
  let connected: Promise<Client> | null = null;
  const connect = () => {
    connected ??= (async () => {
      const client = new Client({ name: "emvb-mcp", version });
      const transport = new StreamableHTTPClientTransport(endpoint, {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      });
      await client.connect(transport);
      return client;
    })().catch((error: unknown) => {
      connected = null;
      throw error;
    });
    return connected;
  };
  return {
    async call(name, args) {
      try {
        const client = await connect();
        return (await client.callTool({ name, arguments: args })) as ToolResult;
      } catch (error) {
        throw redactToken(error, token);
      }
    },
    async close() {
      if (connected) await (await connected).close();
    },
  };
}
