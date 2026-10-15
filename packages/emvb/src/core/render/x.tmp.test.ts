import { test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import { renderPage } from "./index.ts";
const entry = (n: number) => ({ id: `e${n}`, slug: `e-${n}`, title: `Entry ${n}`, excerpt: "", content: "", permalink: `/p/e-${n}` });
test("x", async () => {
  const tabs = { id: "tabs0001", type: "tabs", props: {}, children: [
    { id: "tabp0001", type: "tab-panel", props: { label: "A" }, children: [] },
    { id: "tabp0002", type: "tab-panel", props: { label: "B" }, children: [] } ] };
  const acc = { id: "acc00001", type: "accordion", props: {}, children: [{ id: "acci0001", type: "accordion-item", props: { summary: "Q" }, children: [] }] };
  const layout = { schemaVersion: 16, root: { id: "root0001", type: "container", props: {}, children: [
    { id: "loop0001", type: "loop", props: { collection: "projects" }, children: [tabs, acc] } ] } };
  const { validateLayout } = await import("../validate.ts"); console.log(JSON.stringify(validateLayout(layout).ok ? "valid" : validateLayout(layout)).slice(0,600));
  const r = renderPage(layout as never, emptyDesign(), { dynamic: { collections: { loop0001: [entry(1), entry(2)] } } as never });
  console.log(r.html.match(/(id|name|for|aria-controls|aria-labelledby)="[^"]+"/g));
  console.log(r.warnings);
});
