import { readFileSync } from "node:fs";
import path from "node:path";
import { AxeBuilder } from "@axe-core/playwright";
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

const file = (page: Page) => page.locator("[data-emvb-image-editor-file]");
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png` });
};
const libraryPage = (extra: Record<string, unknown> = {}) =>
  imagePage({ src: media.url, mediaId: media.id, width: 640, height: 480, ...extra });

/**
 * The page editor needs 1024 px (its small-screen notice would unmount the dialog), but the image
 * editor picks its layout from its own width. Keep the page editor mounted and narrow the window,
 * as W-486's media-library entry point will be.
 */
async function keepPageEditorMounted(page: Page) {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query: string) =>
      /min-width:\s*1024px/.test(query)
        ? ({
            matches: true,
            media: query,
            onchange: null,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            addListener: () => undefined,
            removeListener: () => undefined,
            dispatchEvent: () => true,
          } as MediaQueryList)
        : original(query);
  });
}

/** Serious or critical axe findings inside the image editor. */
async function axeProblems(page: Page) {
  const result = await new AxeBuilder({ page }).include("[data-emvb-image-editor]").analyze();
  return result.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

const canvasShot = (page: Page) => page.locator("[data-emvb-image-canvas]").screenshot();
/** Reset all, so each tool's screenshot shows only its own edit. */
const resetAll = async (page: Page) => {
  const reset = page.locator("[data-emvb-image-reset]");
  if (await reset.isEnabled()) await reset.click();
  await expect(reset).toBeDisabled();
};

test("a library picture opens in the worker under the admin CSP, with nothing loaded before the click", async ({
  page,
}) => {
  const seen = watch(page);
  const id = await createPage(author, "Image editor", libraryPage(), `ie-${unique()}`);
  await page.goto(`${EDITOR}?entry=${id}`);
  await expect(overlay(page).locator(".emvb-topbar-title")).toBeVisible({ timeout: 30_000 });
  const before = seen.scripts.length;
  // The editor chunk is in neither the editor's first load nor anything before "Edit image".
  expect(seen.scripts.some((u) => /ImageEditorDialog|editor\.worker/.test(u))).toBe(false);
  await openLayers(page);
  await overlay(page).locator(".emvb-layer-select", { hasText: "Image" }).click();
  await overlay(page).locator("[data-emvb-image-edit]").click();
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready", {
    timeout: 30_000,
  });
  expect(seen.scripts.length).toBeGreaterThan(before);
  await expect(editor(page)).toHaveAttribute("data-emvb-render-mode", "worker");
  await expect(editor(page)).toHaveAttribute("data-layout", "desktop");
  // photocn's arrangement: Adjust first, the tool switcher and histogram on top of the sidebar.
  await expect(editor(page)).toHaveAttribute("data-emvb-image-tool-active", "adjust");
  await expect(page.locator('[data-emvb-image-tool="adjust"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("[data-slot=image-editor-histogram]")).toBeVisible();
  await expect(file(page)).toContainText("640 × 480 px");
  await expect(page.locator("[data-emvb-image-save]")).toBeDisabled();
  const box = await page.locator("[data-emvb-image-canvas]").boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(400);
  await page.waitForTimeout(500);
  await shot(page, "adjust");
  await page.locator('[data-emvb-image-tool="filters"]').click();
  await expect(page.locator('[data-emvb-image-panel="filters"]')).toBeVisible();
  await shot(page, "filters");
  await page.keyboard.press("Escape");
  await expect(editor(page)).toHaveCount(0);
  await expect(overlay(page).locator("[data-emvb-image-edit]")).toBeFocused();
  expect(seen.csp).toEqual([]);
});

test("crop and rotate (W-483): turns, square, the element's own ratio, straighten, undo and Done", async ({
  page,
}) => {
  const seen = watch(page);
  const id = await createPage(
    author,
    "Image editor crop",
    libraryPage({ width: 300, height: 100 }),
    `ie-c-${unique()}`,
  );
  await openImageEditor(page, id);
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready", {
    timeout: 30_000,
  });
  await page.locator('[data-emvb-image-tool="compose"]').click();
  await expect(page.locator("[data-emvb-image-view]")).toHaveAttribute(
    "data-emvb-image-view",
    "crop",
  );
  await expect(page.locator("[data-emvb-image-crop-frame]")).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, "crop");

  await page.locator('[data-emvb-image-rotate="right"]').click();
  await expect(file(page)).toContainText("480 × 640 px");
  await page.locator("[data-emvb-image-undo]").click();
  await expect(file(page)).toContainText("640 × 480 px");

  await page.getByRole("combobox", { name: "Aspect ratio" }).click();
  await page.getByRole("option", { name: "Square" }).click();
  await expect(file(page)).toContainText("480 × 480 px");

  await page.getByRole("combobox", { name: "Aspect ratio" }).click();
  await page.getByRole("option", { name: "Fit this element (300 × 100)" }).click();
  await expect(file(page)).toContainText(/640 × 21[34] px/);

  // The keyboard straightens; the frame stays put and the crop shrinks to stay inside.
  const straighten = page.locator('[data-emvb-image-slider="straighten"]');
  await straighten.focus();
  for (let i = 0; i < 20; i++) await straighten.press("ArrowRight");
  await expect(page.getByRole("button", { name: "+2.0°" })).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, "crop-edited");

  // Adjust corners: Esc leaves the corners first, and doesn't close the editor.
  await page.locator("[data-emvb-image-corners]").click();
  await expect(page.locator("[data-slot=image-editor-corner-overlay]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-slot=image-editor-corner-overlay]")).toHaveCount(0);
  await expect(editor(page)).toHaveCount(1);

  await page.locator("[data-emvb-image-crop-done]").click();
  await expect(page.locator("[data-emvb-image-view]")).toHaveAttribute(
    "data-emvb-image-view",
    "result",
  );
  await expect(editor(page)).toHaveAttribute("data-emvb-image-tool-active", "adjust");
  await page.locator("[data-emvb-image-reset]").click();
  await expect(file(page)).toContainText("640 × 480 px");
  expect(seen.csp).toEqual([]);
});

test("the active tool stays readable after the admin switches from dark to light", async ({
  page,
}) => {
  const id = await createPage(author, "Image editor theme", libraryPage(), `ie-t-${unique()}`);
  const activeColors = async () =>
    page
      .locator('[data-emvb-image-tool][aria-pressed="true"]')
      .first()
      .evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]);
  await openImageEditor(page, id);
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready", {
    timeout: 30_000,
  });
  const light = await activeColors();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(300);
  await shot(page, "dark-adjust");
  await page.locator('[data-emvb-image-tool="compose"]').click();
  await page.waitForTimeout(400);
  await shot(page, "dark-crop");
  await page.locator('[data-emvb-image-tool="adjust"]').click();
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForTimeout(300);
  expect(await activeColors()).toEqual(light);
  await page.setViewportSize({ width: 1024, height: 680 });
  await page.locator('[data-emvb-image-tool="compose"]').click();
  await page.waitForTimeout(400);
  await shot(page, "1024-crop");
});

test("a narrow editor uses the phone layout: tools at the bottom, controls in a sheet", async ({
  page,
}) => {
  const id = await createPage(author, "Image editor compact", libraryPage(), `ie-m-${unique()}`);
  await keepPageEditorMounted(page);
  await openImageEditor(page, id);
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready", {
    timeout: 30_000,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(editor(page)).toHaveAttribute("data-layout", "compact");
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready", {
    timeout: 30_000,
  });
  await page.waitForTimeout(500);
  await shot(page, "mobile");
  await page
    .locator(
      '.emvb-ie-compact-tools:not(.emvb-ie-compact-tools-inline) [data-emvb-image-tool="compose"]',
    )
    .click();
  await expect(page.locator("[data-emvb-image-sheet]")).toHaveAttribute(
    "data-emvb-image-sheet",
    "open",
  );
  await expect(page.locator("[data-emvb-image-crop-frame]")).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, "mobile-crop");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(300);
  await shot(page, "mobile-crop-dark");
  await page.getByRole("button", { name: "Close panel" }).click();
  await expect(page.locator("[data-emvb-image-sheet]")).toHaveAttribute(
    "data-emvb-image-sheet",
    "closed",
  );
});

test("tone tools (W-484): adjust, effects, filters, curves and blur change the picture, by mouse and keyboard", async ({
  page,
}) => {
  const seen = watch(page);
  const id = await createPage(author, "Image editor tone", libraryPage(), `ie-tone-${unique()}`);
  await openImageEditor(page, id);
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready", {
    timeout: 30_000,
  });
  await page.waitForTimeout(600);
  const original = await canvasShot(page);
  const undo = page.locator("[data-emvb-image-undo]");
  await expect(undo).toBeDisabled();
  expect(await axeProblems(page)).toEqual([]);

  // Adjust: the arrow keys move a labelled slider; the value field takes a typed number.
  const brightness = page.getByRole("slider", { name: "Brightness" });
  await brightness.focus();
  for (let i = 0; i < 30; i++) await brightness.press("ArrowRight");
  await expect(page.getByRole("textbox", { name: "Brightness value" })).toHaveValue("+0.30");
  const contrast = page.getByRole("textbox", { name: "Contrast value" });
  await contrast.fill("-0.4");
  await contrast.press("Enter");
  await expect(contrast).toHaveValue("-0.40");
  await expect(page.getByRole("slider", { name: "Contrast" })).toHaveValue("-0.4");
  await expect(undo).toBeEnabled();
  await page.getByRole("tab", { name: "Color" }).click();
  const saturation = page.getByRole("textbox", { name: "Saturation value" });
  await saturation.fill("0.6");
  await saturation.press("Enter");
  await page.waitForTimeout(600);
  expect((await canvasShot(page)).equals(original)).toBe(false);
  await shot(page, "adjust-edited");
  await page.locator("[data-emvb-image-section-reset=colors]").click();
  await expect(saturation).toHaveValue("0.00");

  // Effects opens the same panel on its Effects tab.
  await page.locator('[data-emvb-image-tool="effects"]').click();
  await expect(page.getByRole("tab", { name: "Effects" })).toHaveAttribute("aria-selected", "true");
  await shot(page, "effects");

  // Filters: a look, then its strength.
  await resetAll(page);
  await page.locator('[data-emvb-image-tool="filters"]').click();
  await expect(page.locator('[data-emvb-image-filter="None"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const beforeFilter = await canvasShot(page);
  await page.locator('[data-emvb-image-filter="crema"]').click();
  await expect(page.locator('[data-emvb-image-filter="crema"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const strength = page.getByRole("textbox", { name: "Strength value" });
  await expect(strength).toHaveValue("100%");
  await strength.fill("60");
  await strength.press("Enter");
  await expect(strength).toHaveValue("60%");
  await page.waitForTimeout(600);
  expect((await canvasShot(page)).equals(beforeFilter)).toBe(false);
  await shot(page, "filters-on");
  expect(await axeProblems(page)).toEqual([]);

  // Curves: a point is a keyboard slider; + adds a point, Delete removes it.
  await resetAll(page);
  await page.locator('[data-emvb-image-tool="curves"]').click();
  await page.waitForTimeout(400);
  await shot(page, "curves-default");
  const point = (i: number) => page.locator(`[data-curve-index="${i}"]`);
  await expect(page.locator("[data-curve-index]")).toHaveCount(5);
  await point(1).focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("Shift+ArrowUp");
  await expect(point(1)).toHaveAttribute("aria-valuetext", "input 64, output 104");
  await page.keyboard.press("+");
  await expect(page.locator("[data-curve-index]")).toHaveCount(6);
  await expect(point(2)).toBeFocused();
  await page.keyboard.press("Delete");
  await expect(page.locator("[data-curve-index]")).toHaveCount(5);
  // Typed levels for the focused point.
  await point(3).focus();
  const output = page.getByRole("spinbutton", { name: "Output" });
  await output.fill("150");
  await output.press("Enter");
  await expect(point(3)).toHaveAttribute("aria-valuetext", "input 191, output 150");
  // A mouse drag on the red channel.
  await page.getByRole("tab", { name: /^R/ }).nth(1).click();
  await expect(page.locator("[data-emvb-image-curve]")).toHaveAttribute(
    "data-emvb-image-curve",
    "r",
  );
  const mid = await point(2).boundingBox();
  if (mid) {
    await page.mouse.move(mid.x + mid.width / 2, mid.y + mid.height / 2);
    await page.mouse.down();
    await page.mouse.move(mid.x + mid.width / 2, mid.y - 30, { steps: 5 });
    await page.mouse.up();
  }
  await expect(point(2)).not.toHaveAttribute("aria-valuetext", "input 128, output 128");
  await page.getByRole("tab", { name: "RGB" }).click();
  await page.waitForTimeout(600);
  await shot(page, "curves");
  expect(await axeProblems(page)).toEqual([]);

  // Blur: strength, then move the sharp spot with the keyboard and by dragging.
  await resetAll(page);
  await page.locator('[data-emvb-image-tool="blur"]').click();
  await page.waitForTimeout(400);
  await shot(page, "blur-default");
  const blurStrength = page.getByRole("textbox", { name: "Strength value" });
  await blurStrength.fill("70");
  await blurStrength.press("Enter");
  const spot = page.getByRole("slider", { name: "Sharp spot (blur center)" });
  await spot.focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(spot).toHaveAttribute("aria-valuetext", "40% across, 60% down");
  await expect(page.getByRole("textbox", { name: "X value" })).toHaveValue("40%");
  const area = await page.locator("[data-emvb-image-blur-area]").boundingBox();
  if (area) {
    await page.mouse.click(area.x + area.width * 0.7, area.y + area.height * 0.3);
  }
  await expect(spot).toHaveAttribute("aria-valuetext", /^(69|70|71)% across, (29|30|31)% down$/);
  // Dragging the spot doesn't flash the original.
  await expect(page.locator('[data-emvb-image-compare][aria-pressed="true"]')).toHaveCount(0);
  await page.waitForTimeout(800);
  await shot(page, "blur");
  expect(await axeProblems(page)).toEqual([]);

  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(300);
  await shot(page, "dark-blur");
  await resetAll(page);
  for (const tool of ["adjust", "curves", "blur", "effects"]) {
    await page.locator(`[data-emvb-image-tool="${tool}"]`).click();
    await page.waitForTimeout(400);
    await shot(page, `dark-${tool}-default`);
  }
  await page.locator('[data-emvb-image-tool="filters"]').click();
  await page.locator('[data-emvb-image-filter="crema"]').click();
  await expect(page.locator('[data-emvb-image-filter="crema"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.waitForTimeout(600);
  await shot(page, "dark-filters-on");
  expect(await axeProblems(page)).toEqual([]);
  await page.emulateMedia({ colorScheme: "light" });

  // Reset all puts the original back.
  await resetAll(page);
  await page.waitForTimeout(800);
  expect((await canvasShot(page)).equals(original)).toBe(true);
  expect(seen.csp).toEqual([]);
});

test("the phone layout shows the tone panels in its sheet", async ({ page }) => {
  const id = await createPage(
    author,
    "Image editor tone phone",
    libraryPage(),
    `ie-tm-${unique()}`,
  );
  await keepPageEditorMounted(page);
  await openImageEditor(page, id);
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready", {
    timeout: 30_000,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(editor(page)).toHaveAttribute("data-layout", "compact");
  const bar = (tool: string) =>
    page.locator(
      `.emvb-ie-compact-tools:not(.emvb-ie-compact-tools-inline) [data-emvb-image-tool="${tool}"]`,
    );
  const inSheet = (tool: string) =>
    page.locator(`[data-emvb-image-sheet] [data-emvb-image-panel="${tool}"]`);
  await bar("adjust").click();
  await expect(inSheet("adjust")).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, "mobile-adjust");
  for (const tool of ["curves", "blur", "filters"]) {
    await page.locator(`[data-emvb-image-sheet] [data-emvb-image-tool="${tool}"]`).click();
    await expect(inSheet(tool)).toBeVisible();
    await page.waitForTimeout(500);
    await shot(page, `mobile-${tool}`);
  }
  await page.getByRole("button", { name: "Crema" }).click();
  await expect(page.getByRole("button", { name: "Crema" })).toHaveAttribute("aria-pressed", "true");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.locator('[data-emvb-image-sheet] [data-emvb-image-tool="curves"]').click();
  await page.waitForTimeout(400);
  await shot(page, "mobile-curves-dark");
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
  await shot(page, "external");
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
