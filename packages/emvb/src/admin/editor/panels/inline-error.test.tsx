import { afterEach, expect, test } from "bun:test";
import { cleanup, mount } from "../../../../test/dom/mount.ts";
import { InlineError } from "./inline-error.tsx";

afterEach(cleanup);

test("an inline error is an alert with its message", async () => {
  const host = await mount(<InlineError>Enter a hex color such as #1a2b3c.</InlineError>);
  const alert = host.querySelector(".emvb-inline-error");
  expect(alert?.getAttribute("role")).toBe("alert");
  expect(alert?.textContent).toBe("Enter a hex color such as #1a2b3c.");
});
