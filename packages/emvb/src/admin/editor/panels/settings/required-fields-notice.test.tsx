import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { LayoutNode } from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import { RequiredFieldsNotice } from "./RequiredFieldsNotice.tsx";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";

afterEach(cleanup);

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

const definition: Fetcher = async () =>
  new Response(
    JSON.stringify({
      data: {
        pages: [
          {
            fields: [
              { name: "email", type: "email", label: "Email", required: true },
              { name: "phone", type: "tel", label: "Phone", required: true },
            ],
          },
        ],
      },
    }),
    { status: 200 },
  );

const form = (children: unknown[]) =>
  ({ id: "form0001", type: "form", props: { formId: "contact" }, children }) as LayoutNode;

describe("Form required-fields notice (W-511)", () => {
  test("lists a missing field and a field hidden on mobile", async () => {
    const node = form([
      {
        id: "inp00001",
        type: "text-input",
        props: { field: "email", label: "Email" },
        hiddenOn: ["mobile"],
      },
    ]);
    await mount(<RequiredFieldsNotice node={node} fetcher={definition} />);
    await flush();
    const notice = document.querySelector("[data-emvb-required-fields]");
    expect(notice?.textContent).toContain("2 required fields can't be filled in");
    const hidden = document.querySelector('[data-emvb-required-issue="hidden"]');
    expect(hidden?.textContent).toBe("Email is hidden on mobile.");
    expect(hidden?.getAttribute("title")).toContain("“Email” is required but hidden on mobile");
    expect(document.querySelector('[data-emvb-required-issue="missing"]')?.textContent).toContain(
      "Phone has no field on this form (phone).",
    );
  });

  test("shows nothing when every required field can be filled, or the definition can't load", async () => {
    const node = form([
      { id: "inp00001", type: "text-input", props: { field: "email", label: "Email" } },
      { id: "inp00002", type: "text-input", props: { field: "phone", label: "Phone" } },
    ]);
    await mount(<RequiredFieldsNotice node={node} fetcher={definition} />);
    await flush();
    expect(document.querySelector("[data-emvb-required-fields]")).toBeNull();
    cleanup();
    const failing: Fetcher = async () => new Response("{}", { status: 500 });
    await mount(<RequiredFieldsNotice node={form([])} fetcher={failing} />);
    await flush();
    expect(document.querySelector("[data-emvb-required-fields]")).toBeNull();
  });
});
