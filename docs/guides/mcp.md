# AI agents (MCP)

EmVB gives AI agents (Claude, ChatGPT, Cursor and other MCP clients) a small set of tools to
read and build EmVB pages. Agents only change **drafts**: every change is validated like an edit
in the editor, shows in the page's version timeline with an **Agent** badge, and a person
publishes it, unless an admin allows agent publishing.

## Requirements

- EmDash **1.2 or later** with MCP on: `emdash({ mcp: true, … })`. The rest of EmVB still works on
  EmDash 1.0 and 1.1; only the agent tools need 1.2.
- An admin turns agents on in **Pages VisualBuilder → AI agents** (off by default), and approves the
  EmVB tools once on EmDash's Plugins screen.

## Two ways to connect

| | Remote | Local (stdio) |
| --- | --- | --- |
| Endpoint | `https://your.site/_emdash/api/mcp` (EmDash's own) | `npx -y @perkyzz/emvb-mcp --site https://your.site` |
| Sign-in | OAuth through EmDash | An EmDash API token in `EMVB_TOKEN` |
| Tools | `emvb__list_pages`, `emvb__add_element`, … | `list_pages`, `add_element`, … |
| Extras | — | Resources (schemas, page layouts), prompts and the `emvb-page-builder` skill |

Remote config:

```json
{ "mcpServers": { "emvb": { "url": "https://your.site/_emdash/api/mcp" } } }
```

Local config:

```json
{
  "mcpServers": {
    "emvb": {
      "command": "npx",
      "args": ["-y", "@perkyzz/emvb-mcp", "--site", "https://your.site"],
      "env": { "EMVB_TOKEN": "<your EmDash API token>" }
    }
  }
}
```

The bridge never takes the token on the command line; use `EMVB_TOKEN` or `--token-file`. It
refuses `http://` sites except `localhost`, and logs to stderr only. It warns when the token file
can be read by other users of the computer; run `chmod 600` on it.

## Tokens and permissions

- Create the token in EmDash → **API tokens** with the scope **`mcp:tools:emvb`**.
- The token's user must be an **editor or above**. **Never use an admin token** for an agent.
- EmDash checks the scope and the role before any EmVB tool runs.

## Tools

| Read | Write (draft only) | Publish (only when allowed) |
| --- | --- | --- |
| `list_pages`, `get_layout`, `describe_page`, `list_element_types`, `get_site_styles`, `list_section_recipes`, `get_accessibility_findings`, `list_versions` | `create_page`, `add_element`, `move_element`, `update_element`, `remove_element`, `apply_section_recipe`, `restore_version`, `update_site_styles` | `publish_page`, `publish_site_styles` |

- Writes take an optional `expectedRev`; a stale one returns `CONFLICT`. Every write returns a new
  `rev`: pass that one to the next write.
- Style references to a site variable can leave out `from`; EmVB fills it in from the variable's
  kind and refuses ids and classes that don't exist, listing the ones that do.
- `create_page` uses the slug EmDash derives from the title and refuses a taken one.
- `update_site_styles` changes the style draft only, and refuses to remove a variable a page or class
  still uses unless `force: true`.
- Errors come back as tool errors with a code (`NESTING`, `INVALID_LAYOUT`, `CONFLICT`,
  `PUBLISH_DISABLED`, `FORBIDDEN`, `REFUSED`, `TOO_LARGE`, `NOT_SET_UP`, …) and a message the agent can act on.

## Publishing

Agent publishing is **off** by default. In **AI agents**, an admin can separately allow
**Agents may publish pages** and **Agents may publish site styles**. While they are off:

- `publish_page` and `publish_site_styles` refuse with `PUBLISH_DISABLED` (the local bridge only
  lists them with `--allow-publish`; EmDash's endpoint always lists them).
- EmVB also refuses EmVB pages published through EmDash's own `content_publish` MCP tool.

## What people see

- **AI agents** page (admins): the switches, the endpoint, connect snippets and the last 50 agent
  changes with who made them.
- **Version timeline**: an **Agent** badge on versions an agent saved, and an All / People / Agents
  filter.
- **Editor**: if an agent changes the page while you are idle, a notice offers **Reload**.

## Security notes

- Agents can't change the AI agents settings; no tool writes them.
- Every agent write is validated with the same rules as the editor and the save hook.
- Known limits, raised with EmDash: plugin writes skip `content:beforeSave` hooks of other plugins
  and record no author on the revision (EmVB keeps its own log), and there is a short window between
  EmVB's revision check and the write.

## Debugging

`scripts/mcp-inspector.sh https://your.site ./token.txt` opens the MCP Inspector on the local
bridge.
