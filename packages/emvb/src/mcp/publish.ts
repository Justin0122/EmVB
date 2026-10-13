import { z } from "zod";
import { McpToolError } from "./errors.ts";
import type { EmvbPorts } from "./ports.ts";
import { queued } from "./queue.ts";

const off = (what: string) =>
  new McpToolError(
    "PUBLISH_DISABLED",
    `Agents may not publish ${what} on this site. Leave the draft for a person to review, or ask an admin to allow it in Pages VisualBuilder → AI agents.`,
  );

export const PublishPageInput = z.strictObject({
  pageId: z.string().min(1).max(128),
  /** Required: an agent can't publish a draft it hasn't read (plan § 3). */
  expectedRev: z.string().min(1).max(256),
  confirm: z.literal(true),
});
export const PublishPageOutput = z.object({
  pageId: z.string(),
  rev: z.string(),
  summary: z.string(),
});

/** D-055: publishes one page only when the admin allowed agent publishing. */
export async function publishPage(ports: EmvbPorts, input: z.infer<typeof PublishPageInput>) {
  if (!(await ports.settings()).publishPages) throw off("pages");
  return queued(`page:${input.pageId}`, async () => {
    const published = await ports.publishPage(input.pageId, input.expectedRev);
    const summary = `Published page ${input.pageId}`;
    await ports.log({
      target: "page",
      tool: "publish_page",
      pageId: input.pageId,
      rev: published.rev,
      summary,
    });
    return { pageId: input.pageId, rev: published.rev, summary };
  });
}

export const PublishSiteStylesInput = z.strictObject({
  /** The `publishedRevision` from get_site_styles (null when nothing was ever published). */
  expectedPublishedRevision: z.string().max(256).nullable(),
  confirm: z.literal(true),
});
export const PublishSiteStylesOutput = z.object({ revision: z.string(), summary: z.string() });

/** D-055: publishes the style draft only when the admin allowed it. Pages are not republished. */
export async function publishSiteStyles(
  ports: EmvbPorts,
  input: z.infer<typeof PublishSiteStylesInput>,
) {
  if (!(await ports.settings()).publishStyles) throw off("site styles");
  return queued("styles", async () => {
    const published = await ports.publishDesign(input.expectedPublishedRevision);
    const summary = "Published the site styles";
    await ports.log({ target: "styles", tool: "publish_site_styles", summary });
    return { revision: published.revision, summary };
  });
}
