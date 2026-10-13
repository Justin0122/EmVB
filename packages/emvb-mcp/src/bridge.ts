import { McpServer } from "@modelcontextprotocol/server";
import { visibleTools, type ToolDef } from "@perkyzz/emvb/mcp";
import type { Remote, ToolResult } from "./remote.ts";

export const BRIDGE_VERSION = "0.4.0";

const failure = (message: string): ToolResult => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

/** Turns a transport or auth failure into a tool error the agent and the person can act on. */
function explain(error: unknown, tool: string): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  if (/401|unauthori[sz]ed|invalid token/i.test(message)) {
    return failure("The site refused the token. Create a new EmDash API token and set EMVB_TOKEN.");
  }
  if (/403|scope|forbidden/i.test(message)) {
    return failure(
      "The token can't use EmVB tools. It needs the scope mcp:tools:emvb and a user who is an editor or above.",
    );
  }
  if (/not found|unknown tool/i.test(message)) {
    return failure(
      `The site doesn't offer emvb__${tool}. Check that EmDash's MCP is on (mcp: true, EmDash 1.2+) and that an admin approved the EmVB tools.`,
    );
  }
  return failure(`Couldn't reach the site: ${message}`);
}

/**
 * The local MCP server (R1): lists the shared tool definitions under their plain names and
 * forwards each call to the site as `emvb__<name>`. All checks and writes happen on the site.
 */
export function createBridgeServer(options: { remote: Remote; allowPublish: boolean }): McpServer {
  const server = new McpServer(
    { name: "emvb", title: "EmVB pages", version: BRIDGE_VERSION },
    { capabilities: { tools: {} } },
  );
  const tools: ToolDef[] = visibleTools({
    publishPages: options.allowPublish,
    publishStyles: options.allowPublish,
  });
  for (const def of tools) {
    server.registerTool(
      def.name,
      {
        title: def.title,
        description: def.description,
        inputSchema: def.input,
        outputSchema: def.output,
        annotations: {
          title: def.title,
          readOnlyHint: def.readOnly,
          destructiveHint: def.destructive,
          openWorldHint: false,
        },
      },
      async (args: unknown) => {
        try {
          return await options.remote.call(`emvb__${def.name}`, args as Record<string, unknown>);
        } catch (error) {
          return explain(error, def.name);
        }
      },
    );
  }
  return server;
}
