#!/bin/sh
# W-469: open the MCP Inspector on the built stdio bridge.
# Usage: scripts/mcp-inspector.sh https://your.site /path/to/token-file [inspector args]
# The token is read from a file so it never appears in a process list.
set -e
SITE="$1"; TOKEN_FILE="$2"
[ -n "$SITE" ] && [ -f "$TOKEN_FILE" ] || { echo "usage: $0 https://your.site token-file [inspector args]" >&2; exit 2; }
shift 2
bun run --cwd packages/emvb-mcp build >/dev/null
exec npx -y @modelcontextprotocol/inspector@2.10.1 "$@" -- node packages/emvb-mcp/dist/cli.mjs --site "$SITE" --token-file "$TOKEN_FILE"
