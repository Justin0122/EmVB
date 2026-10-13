import { describe, expect, test } from "bun:test";
import { defaultElement } from "../elements/index.ts";
import type { FormDefinitions, PublicFormDefinition } from "../forms/definition.ts";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { renderPage } from "./index.ts";

const field = (type: "select" | "radio", id: string, name: string): LayoutNode =>
  ({ id, type, props: { field: name, label: name } }) as LayoutNode;

const layout: Layout = {
  schemaVersion: 15,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      {
        ...defaultElement("form", "form0001"),
        props: { formId: "contact" },
        children: [
          field("select", "sele0001", "topic"),
          field("radio", "radi0001", "size"),
          field("select", "sele0002", "plain"),
          field("radio", "radi0002", "unbound"),
        ],
      } as LayoutNode,
    ],
  },
};

const definition: PublicFormDefinition = {
  name: "Contact",
  slug: "contact",
  status: "active",
  settings: {},
  pages: [
    {
      fields: [
        {
          name: "topic",
          type: "select",
          label: "Topic",
          required: false,
          options: [
            { label: "Sales", value: "sales" },
            { label: "Support", value: "support" },
          ],
        },
        {
          name: "size",
          type: "radio",
          label: "Size",
          required: false,
          options: [
            { label: "Small", value: "s" },
            { label: "Large", value: "l" },
          ],
        },
        { name: "plain", type: "select", label: "Plain", required: false },
      ],
    },
  ],
};

const definitions: FormDefinitions = new Map([["contact", definition]]);

describe("form field options from the bound definition (W-035)", () => {
  const { html } = renderPage(layout, emptyDesign(), { formDefinitions: definitions });

  test("a select lists the definition's options after a blank choice", () => {
    expect(html).toContain(
      '<select class="ec-form-input" id="emvb-field-sele0001" name="topic"><option value="">Choose…</option><option value="sales">Sales</option><option value="support">Support</option></select>',
    );
  });

  test("a radio group lists one labelled radio per option", () => {
    expect(html).toContain(
      '<label class="emvb-form-radio-label"><input type="radio" name="size" value="s"> Small</label><label class="emvb-form-radio-label"><input type="radio" name="size" value="l"> Large</label>',
    );
  });

  test("fields without options, or not in any definition, keep their placeholders", () => {
    expect(html).toContain('name="plain"><option value="">Choose…</option></select>');
    expect(html).toContain('name="unbound" value="a"> Option A');
  });
});

describe("form fields take the definition's type and limits (W-297)", () => {
  const typed: PublicFormDefinition = {
    name: "Contact",
    slug: "contact",
    status: "active",
    settings: {},
    pages: [
      {
        fields: [
          { name: "topic", type: "select", label: "Topic", required: true },
          {
            name: "email",
            type: "email",
            label: "Email",
            required: true,
            validation: { minLength: 5, maxLength: 80, pattern: ".+@example.com" },
          },
          {
            name: "age",
            type: "number",
            label: "Age",
            required: false,
            validation: { min: 18, max: 99 },
          },
          { name: "agree", type: "checkbox", label: "I agree", required: true },
          { name: "when", type: "date", label: "When", required: false },
        ],
      },
    ],
  };
  const typedLayout: Layout = {
    schemaVersion: 15,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        {
          ...defaultElement("form", "form0001"),
          props: { formId: "contact" },
          children: [
            field("select", "sele0001", "topic"),
            { id: "text0001", type: "text-input", props: { field: "email", label: "Email" } },
            { id: "text0002", type: "text-input", props: { field: "age", label: "Age" } },
            { id: "chek0001", type: "checkbox", props: { field: "agree", label: "I agree" } },
            { id: "text0003", type: "text-input", props: { field: "when", label: "When" } },
          ],
        } as LayoutNode,
      ],
    },
  };

  const html = renderPage(typedLayout, emptyDesign(), {
    formDefinitions: new Map([["contact", typed]]),
  }).html;

  test("the input type, required, limits and a mark reach the markup, and the form skips the browser bubble", () => {
    expect(html).toContain('<form class="emvb-form ec-form" method="POST"');
    expect(html).toContain('novalidate=""');
    expect(html).toContain(
      '<select class="ec-form-input" id="emvb-field-sele0001" name="topic" required="">',
    );
    expect(html).toContain(
      '<input type="email" class="ec-form-input" id="emvb-field-text0001" name="email" required="" minlength="5" maxlength="80" pattern=".+@example.com">',
    );
    expect(html).toContain(
      '<input type="number" class="ec-form-input" id="emvb-field-text0002" name="age" min="18" max="99">',
    );
    expect(html).toContain(
      '<input type="date" class="ec-form-input" id="emvb-field-text0003" name="when">',
    );
    expect(html).toContain(
      '<input type="checkbox" id="emvb-field-chek0001" name="agree" value="true" required="">',
    );
    expect(html).toContain('class="emvb-form-required" aria-hidden="true"> *</span>');
    // Topic, Email and I agree carry the mark; Age and When don't.
    const marks = html.split('class="emvb-form-required"').length - 1;
    expect(marks).toBe(3);
    // W-441: the checkbox's mark is hidden from screen readers too, not a plain " *".
    expect(html).toContain('I agree<span class="emvb-form-required" aria-hidden="true"> *</span>');
  });

  test("a field the definition doesn't have keeps a plain, optional text input", () => {
    const extra = renderPage(
      {
        ...typedLayout,
        root: {
          ...typedLayout.root,
          children: [
            {
              ...defaultElement("form", "form0001"),
              props: { formId: "contact" },
              children: [{ id: "text0009", type: "text-input", props: { field: "nick" } }],
            } as LayoutNode,
          ],
        },
      } as Layout,
      emptyDesign(),
      { formDefinitions: new Map([["contact", typed]]) },
    ).html;
    expect(extra).toContain(
      '<input type="text" class="ec-form-input" id="emvb-field-text0009" name="nick">',
    );
  });

  test("a form pattern that can hang the browser is left off the control", () => {
    const bad: PublicFormDefinition = {
      ...typed,
      pages: [
        {
          fields: [
            {
              name: "email",
              type: "email",
              label: "Email",
              required: false,
              validation: { pattern: "(a+)+" },
            },
          ],
        },
      ],
    };
    const rendered = renderPage(typedLayout, emptyDesign(), {
      formDefinitions: new Map([["contact", bad]]),
    }).html;
    expect(rendered.includes("pattern=")).toBe(false);
    expect(rendered.includes("(a+)+")).toBe(false);
  });

  test("an alternating form pattern that can hang the browser is left off the control", () => {
    const bad: PublicFormDefinition = {
      ...typed,
      pages: [
        {
          fields: [
            {
              name: "email",
              type: "email",
              label: "Email",
              required: false,
              validation: { pattern: "(a|aa)+" },
            },
          ],
        },
      ],
    };
    const rendered = renderPage(typedLayout, emptyDesign(), {
      formDefinitions: new Map([["contact", bad]]),
    }).html;
    expect(rendered.includes("pattern=")).toBe(false);
    expect(rendered.includes("(a|aa)+")).toBe(false);
  });
});

describe("a field uses the form it sits in", () => {
  test("two forms with the same field name keep their own options", () => {
    const select = (id: string): LayoutNode =>
      ({ id, type: "select", props: { field: "topic", label: "Topic" } }) as LayoutNode;
    const form = (id: string, formId: string, fieldId: string): LayoutNode =>
      ({
        id,
        type: "form",
        props: { formId },
        children: [select(fieldId)],
      }) as LayoutNode;
    const page: Layout = {
      schemaVersion: 15,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [form("form0001", "alpha", "sele0001"), form("form0002", "beta", "sele0002")],
      },
    };
    const def = (name: string, value: string): PublicFormDefinition => ({
      name,
      slug: name,
      status: "active",
      settings: {},
      pages: [
        {
          fields: [
            {
              name: "topic",
              type: "select",
              label: "Topic",
              required: false,
              options: [{ label: name, value }],
            },
          ],
        },
      ],
    });
    const html = renderPage(page, emptyDesign(), {
      formDefinitions: new Map([
        ["alpha", def("Alpha", "a")],
        ["beta", def("Beta", "b")],
      ]),
    }).html;
    expect(html).toContain('<option value="a">Alpha</option>');
    expect(html).toContain('<option value="b">Beta</option>');
    expect(html.includes('<option value="a">Alpha</option><option value="b">Beta</option>')).toBe(
      false,
    );
  });

  test("a form inside a synced section uses that section's definition", () => {
    const sectionForm: Layout = {
      schemaVersion: 15,
      root: {
        id: "rootsec1",
        type: "container",
        props: {},
        children: [
          {
            id: "form0001",
            type: "form",
            props: { formId: "newsletter" },
            children: [
              { id: "sele0001", type: "select", props: { field: "topic", label: "Topic" } },
            ],
          } as LayoutNode,
        ],
      },
    };
    const page: Layout = {
      schemaVersion: 15,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "sec00001", type: "section", props: { partId: "SEC00001" }, children: [] },
        ],
      },
    };
    const html = renderPage(page, emptyDesign(), {
      dynamic: { sectionTemplates: { SEC00001: sectionForm } },
      formDefinitions: new Map([
        [
          "newsletter",
          {
            name: "News",
            slug: "newsletter",
            status: "active",
            settings: {},
            pages: [
              {
                fields: [
                  {
                    name: "topic",
                    type: "select",
                    label: "Topic",
                    required: false,
                    options: [{ label: "Weekly", value: "weekly" }],
                  },
                ],
              },
            ],
          },
        ],
      ]),
    }).html;
    expect(html).toContain('<option value="weekly">Weekly</option>');
  });
});
