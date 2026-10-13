import { describe, expect, test } from "bun:test";
import { parseOptions } from "../src/options.ts";

const read = (path: string) => (path === "/tok" ? "ec_pat_file\n" : "");

describe("bridge options (W-461)", () => {
  test("site and token from env; the endpoint is EmDash's MCP", () => {
    const o = parseOptions(
      ["--site", "https://example.com/some/path"],
      { EMVB_TOKEN: "ec_pat_x" },
      read,
    );
    expect(o.endpoint.href).toBe("https://example.com/_emdash/api/mcp");
    expect(o.token).toBe("ec_pat_x");
    expect(o.allowPublish).toBe(false);
  });

  test("token from a file; --allow-publish", () => {
    const o = parseOptions(
      ["--site=https://a.dev", "--token-file", "/tok", "--allow-publish"],
      {},
      read,
    );
    expect(o.token).toBe("ec_pat_file");
    expect(o.allowPublish).toBe(true);
  });

  test("refuses a token on the command line, plain http and a missing token", () => {
    expect(() => parseOptions(["--site", "https://a.dev", "--token", "x"], {}, read)).toThrow(
      "never on the command line",
    );
    expect(() => parseOptions(["--site", "http://a.dev"], { EMVB_TOKEN: "x" }, read)).toThrow(
      "https",
    );
    expect(() => parseOptions(["--site", "https://a.dev"], {}, read)).toThrow("EMVB_TOKEN");
  });

  test("http is allowed for localhost", () => {
    const o = parseOptions(["--site", "http://localhost:4321"], { EMVB_TOKEN: "x" }, read);
    expect(o.endpoint.href).toBe("http://localhost:4321/_emdash/api/mcp");
  });
});
