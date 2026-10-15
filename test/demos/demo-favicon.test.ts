import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

// W-617: public pages had no icon link, so browsers asked for /favicon.ico and logged a 404.
const read = (path: string) =>
  readFileSync(new URL(`../../demos/${path}`, import.meta.url), "utf8");

describe("demo favicon (W-617)", () => {
  for (const demo of ["node", "cloudflare"]) {
    test(`${demo}: the site's favicon wins, else a bundled one that exists`, () => {
      expect(read(`${demo}/src/utils/site-identity.ts`)).toContain(
        'siteFavicon: settings?.favicon?.url || "/favicon.svg"',
      );
      expect(existsSync(new URL(`../../demos/${demo}/public/favicon.svg`, import.meta.url))).toBe(
        true,
      );
      expect(read(`${demo}/src/layouts/Base.astro`)).toContain(
        '<link rel="icon" href={siteFavicon} />',
      );
    });
  }
});
