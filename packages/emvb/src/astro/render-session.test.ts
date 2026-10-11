import { describe, expect, test } from "bun:test";
import { designFor, formsFor, partsFor } from "./render-session.ts";

const url = new URL("http://site.test/");

describe("render session (W-360)", () => {
  test("one request loads design once, and another request loads it again", async () => {
    let calls = 0;
    const handler = async () => {
      calls += 1;
      return {
        success: true,
        data: { design: { schemaVersion: 15, variables: { colors: [] } } },
      };
    };
    const first = {};
    await designFor(first, handler, url);
    await designFor(first, handler, url);
    expect(calls).toBe(1);
    await designFor({}, handler, url);
    expect(calls).toBe(2);
  });

  test("a form id is loaded once when several parts ask for it", async () => {
    const ids: string[] = [];
    const handler = async (_plugin: string, _method: string, _path: string, request: Request) => {
      const body = (await request.json()) as { id: string };
      ids.push(body.id);
      return { success: true, data: { name: body.id, slug: body.id, settings: {}, pages: [] } };
    };
    const request = {};
    await formsFor(request, handler, url, ["contact"]);
    await formsFor(request, handler, url, ["contact", "newsletter"]);
    expect(ids).toEqual(["contact", "newsletter"]);
  });

  test("theme parts are listed once per request", async () => {
    let calls = 0;
    const request = {};
    const load = async () => {
      calls += 1;
      return ["header"];
    };
    const [a, b] = await Promise.all([partsFor(request, load), partsFor(request, load)]);
    expect(a).toEqual(["header"]);
    expect(b).toEqual(["header"]);
    expect(calls).toBe(1);
  });
});
