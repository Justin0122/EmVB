# @perkyzz/emvb-mcp

A local (stdio) MCP server that lets AI agents build [EmVB](https://emvb.dev) pages on your
EmDash site. It forwards tool calls to your site's EmDash MCP endpoint and adds resources
(layout and style schemas, page layouts), workflow prompts and the `emvb-page-builder` skill.

```json
{
  "mcpServers": {
    "emvb": {
      "command": "npx",
      "args": ["-y", "@perkyzz/emvb-mcp", "--site", "https://your.site"],
      "env": { "EMVB_TOKEN": "<EmDash API token, scope mcp:tools:emvb, editor user>" }
    }
  }
}
```

Options: `--site <url>` (https, or http for localhost), `--token-file <path>` instead of
`EMVB_TOKEN`, `--allow-publish` to list the publish tools (the site still decides).

Needs Node 20+, EmDash 1.2+ with `mcp: true`, `@perkyzz/emvb` on the site, and agents turned on
in **Pages VisualBuilder → AI agents**. Full guide:
<https://github.com/PerkyZZ999/EmVB/blob/main/docs/guides/mcp.md>.

MIT © 2026 Charles Wilkin.
