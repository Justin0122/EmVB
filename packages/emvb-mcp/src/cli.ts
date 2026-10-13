#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { BRIDGE_VERSION, createBridgeServer } from "./bridge.ts";
import { OptionsError, parseOptions } from "./options.ts";
import { httpRemote } from "./remote.ts";

// stdout is the MCP channel; every log line goes to stderr.
const log = (message: string) => process.stderr.write(`[emvb-mcp] ${message}\n`);

try {
  const options = parseOptions(process.argv.slice(2), process.env, (path) =>
    readFileSync(path, "utf8"),
  );
  const remote = httpRemote(options.endpoint, options.token, BRIDGE_VERSION);
  serveStdio(() => createBridgeServer({ remote, allowPublish: options.allowPublish }), {
    onerror: (error) => log(error.message),
  });
  log(`serving EmVB tools for ${options.site.origin}`);
} catch (error) {
  log(error instanceof OptionsError ? error.message : String(error));
  process.exit(2);
}
