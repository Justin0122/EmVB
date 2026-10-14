import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// W-395: @perkyzz/emvb-icons ships on its own, so it carries the sets' license texts itself.
const root = join(import.meta.dir, "../..");
const icons = join(root, "packages/emvb-icons");
const emvb = join(root, "packages/emvb");

describe("the icons package carries its licenses (W-395)", () => {
  test("it publishes licenses/, NOTICE.md and README.md", () => {
    const pkg = JSON.parse(readFileSync(join(icons, "package.json"), "utf8")) as {
      files: string[];
    };
    for (const entry of ["licenses", "NOTICE.md", "README.md"]) expect(pkg.files).toContain(entry);
  });

  test("each set's license text matches the copy in @perkyzz/emvb", () => {
    // photocn's license covers the image editor (W-483), not an icon set.
    const notIcons = new Set(["photocn.LICENSE"]);
    const names = readdirSync(join(emvb, "licenses"))
      .filter((name) => !notIcons.has(name))
      .toSorted();
    expect(names.length).toBeGreaterThan(0);
    expect(readdirSync(join(icons, "licenses")).toSorted()).toEqual(names);
    for (const name of names) {
      expect(readFileSync(join(icons, "licenses", name), "utf8")).toBe(
        readFileSync(join(emvb, "licenses", name), "utf8"),
      );
    }
    const notice = readFileSync(join(icons, "NOTICE.md"), "utf8");
    for (const name of names) expect(notice).toContain(`licenses/${name}`);
  });

  test("@perkyzz/emvb depends on exactly this icons version (W-396)", () => {
    const own = JSON.parse(readFileSync(join(icons, "package.json"), "utf8")) as {
      version: string;
    };
    const main = JSON.parse(readFileSync(join(emvb, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(main.dependencies["@perkyzz/emvb-icons"]).toBe(own.version);
  });
});
