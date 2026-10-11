import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, mount } from "../../../test/dom/mount.ts";
import { useChromeFlags } from "./editor-chrome.tsx";

afterEach(cleanup);

function Probe() {
  const chrome = useChromeFlags();
  const open = Object.entries(chrome.flags)
    .filter(([, value]) => value)
    .map(([key]) => key);
  return (
    <p
      data-open={open.length === 0 ? "none" : open.join(",")}
      data-leaving={String(chrome.leaving)}
    />
  );
}

describe("editor chrome (W-363)", () => {
  test("dialogs start closed", async () => {
    await mount(<Probe />);
    const probe = document.querySelector("p");
    expect(probe?.getAttribute("data-open")).toBe("none");
    expect(probe?.getAttribute("data-leaving")).toBe("false");
  });
});
