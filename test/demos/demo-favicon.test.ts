import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolveStarterSiteIdentity as nodeIdentity } from "../../demos/node/src/utils/site-identity.ts";
import { resolveStarterSiteIdentity as cfIdentity } from "../../demos/cloudflare/src/utils/site-identity.ts";

// W-617: public pages had no icon link, so browsers asked for /favicon.ico and logged a 404.
describe("demo favicon (W-617)", () => {
  for (const [demo, resolve] of [
    ["node", nodeIdentity],
    ["cloudflare", cfIdentity],
  ] as const) {
    test(`${demo}: the site's favicon wins, else a bundled one that exists`, () => {
      expect(resolve({ favicon: { mediaId: "m1", url: "/_emdash/m1.png" } }).siteFavicon).toBe(
        "/_emdash/m1.png",
      );
      expect(resolve().siteFavicon).toBe("/favicon.svg");
      expect(existsSync(new URL(`../../demos/${demo}/public/favicon.svg`, import.meta.url))).toBe(
        true,
      );
      const base = readFileSync(
        new URL(`../../demos/${demo}/src/layouts/Base.astro`, import.meta.url),
        "utf8",
      );
      expect(base).toContain('<link rel="icon" href={siteFavicon} />');
    });
  }
});
