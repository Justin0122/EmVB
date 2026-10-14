import { readFileSync } from "node:fs";
import path from "node:path";
import {
  expect,
  request as requestFactory,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { createPage, ensureEmvbSetup, getPage, publishPage } from "./support/api.ts";
import { EDITOR, openLayers, overlay, unique } from "./support/helpers.ts";

// W-482: the image editor under the production CSP (EmDash sends it only in production builds).
const PHOTO = path.join(process.cwd(), "e2e/fixtures/photo-gps.jpg");
const SHOTS = process.env["EMVB_IMAGE_EDITOR_SHOTS"];

let author: APIRequestContext;
let media: { id: string; url: string };

test.describe.configure({ mode: "serial" });
// The editor needs a signed-in admin; the production build shares the dev server's sign-in.
test.use({
  // oxlint-disable-next-line no-empty-pattern -- Playwright reads fixture names from the pattern.
  storageState: async ({}, use, info) => use((info.project.metadata as { auth: string }).auth),
  viewport: { width: 1440, height: 900 },
});

test.beforeAll(async ({ browser }) => {
  const { dev, auth } = test.info().project.metadata as { dev: string; auth: string };
  const context = await browser.newContext({ baseURL: dev, storageState: auth });
  await ensureEmvbSetup(await context.newPage());
  await context.close();
  author = await requestFactory.newContext({ baseURL: dev, storageState: auth });
  const upload = await author.post("/_emdash/api/media", {
    headers: { "X-EmDash-Request": "1" },
    multipart: {
      file: { name: "garden.jpg", mimeType: "image/jpeg", buffer: readFileSync(PHOTO) },
      width: "640",
      height: "480",
    },
  });
  expect(upload.status()).toBeLessThan(300);
  const item = ((await upload.json()) as { data: { item: { id: string; url: string } } }).data.item;
  media = { id: item.id, url: item.url };
});

test.afterAll(async () => {
  await author.dispose();
});

const imagePage = (props: Record<string, unknown>) => ({
  schemaVersion: 16,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    style: { flexDirection: "column", gap: { value: 16, unit: "px" } },
    children: [{ id: "img00001", type: "image", props: { alt: "A garden in autumn", ...props } }],
  },
});

/** Collects CSP violations and the scripts the page loads. */
function watch(page: Page) {
  const csp: string[] = [];
  const scripts: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) csp.push(m.text());
  });
  page.on("request", (r) => {
    if (r.resourceType() === "script") scripts.push(r.url());
  });
  return { csp, scripts };
}

async function openImageEditor(page: Page, id: string) {
  await page.goto(`${EDITOR}?entry=${id}`);
  await expect(overlay(page).locator(".emvb-topbar-title")).toBeVisible({ timeout: 30_000 });
  await openLayers(page);
  await overlay(page).locator(".emvb-layer-select", { hasText: "Image" }).click();
  await overlay(page).locator("[data-emvb-image-edit]").click();
}

const editor = (page: Page) => page.locator("[data-emvb-image-editor]");

test("a library picture opens in the worker under the admin CSP, with nothing loaded before the click", async ({
  page,
}) => {
  const seen = watch(page);
  const id = await createPage(
    author,
    "Image editor",
    imagePage({ src: media.url, mediaId: media.id, width: 640, height: 480 }),
    `ie-${unique()}`,
  );
  await page.goto(`${EDITOR}?entry=${id}`);
  await expect(overlay(page).locator(".emvb-topbar-title")).toBeVisible({ timeout: 30_000 });
  const before = seen.scripts.length;
  // The editor chunk is in neither the editor's first load nor anything before "Edit image".
  expect(seen.scripts.some((u) => /editor\.worker/.test(u))).toBe(false);
  await openLayers(page);
  await overlay(page).locator(".emvb-layer-select", { hasText: "Image" }).click();
  await overlay(page).locator("[data-emvb-image-edit]").click();
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready", {
    timeout: 30_000,
  });
  expect(seen.scripts.length).toBeGreaterThan(before);
  await expect(editor(page)).toHaveAttribute("data-emvb-render-mode", "worker");
  await expect(page.locator("[data-emvb-image-editor-file]")).toContainText("640 × 480 px");
  await expect(page.locator("[data-emvb-image-save]")).toBeDisabled();
  const box = await page.locator("[data-emvb-image-canvas]").boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(200);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-ready.png` });

  await page.keyboard.down("\\");
  await expect(page.locator("[data-emvb-image-original]")).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-compare.png` });
  await page.keyboard.up("\\");
  await page.locator('[data-emvb-image-tool="filters"]').click();
  await expect(page.locator('[data-emvb-image-panel="filters"]')).toBeVisible();
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-filters-panel.png` });
  await page.keyboard.press("Escape");
  await expect(editor(page)).toHaveCount(0);
  await expect(overlay(page).locator("[data-emvb-image-edit]")).toBeFocused();
  expect(seen.csp).toEqual([]);
});

test("a picture on another website explains how to edit it", async ({ page }) => {
  const id = await createPage(
    author,
    "Image editor external",
    imagePage({ src: "https://images.example.com/a.jpg" }),
    `ie-x-${unique()}`,
  );
  await openImageEditor(page, id);
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "error");
  await expect(page.locator("[data-emvb-image-error]")).toContainText(
    "Upload a copy to the media library",
  );
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-external.png` });
});

test("the published page loads no image-editor code", async ({ page }) => {
  const slug = `ie-pub-${unique()}`;
  const id = await createPage(
    author,
    "Image editor public",
    imagePage({ src: media.url, mediaId: media.id }),
    slug,
  );
  await publishPage(author, id);
  const { slug: stored } = await getPage(author, id);
  const seen = watch(page);
  await page.goto(`/${stored}`);
  await expect(page.locator("img[alt='A garden in autumn']")).toBeVisible();
  const html = await page.content();
  expect(html).not.toMatch(/photocn|editor\.worker|ImageEditorDialog/);
  expect(seen.scripts.some((u) => /editor\.worker|ImageEditorDialog/.test(u))).toBe(false);
});

test("dogfood screenshots in dark mode and at the smallest supported size", async ({ page }) => {
  test.skip(!SHOTS, "Only when EMVB_IMAGE_EDITOR_SHOTS names a folder");
  const id = await createPage(
    author,
    "Image editor shots",
    imagePage({ src: media.url, mediaId: media.id, width: 640, height: 480 }),
    `ie-s-${unique()}`,
  );
  const name = test.info().project.name;
  await page.emulateMedia({ colorScheme: "dark" });
  await openImageEditor(page, id);
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready", {
    timeout: 30_000,
  });
  await page.locator('[data-emvb-image-tool="curves"]').click();
  await page.screenshot({ path: `${SHOTS}/${name}-dark-curves.png` });
  await page.setViewportSize({ width: 1024, height: 680 });
  await page.screenshot({ path: `${SHOTS}/${name}-dark-1024.png` });
  await page.emulateMedia({ colorScheme: "light" });
  await page.screenshot({ path: `${SHOTS}/${name}-light-1024.png` });
});
