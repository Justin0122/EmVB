import { describe, expect, test } from "bun:test";
import golden from "../../../test/fixtures/dynamic-post-golden.json";
import { PostDateNode, PostExcerptNode, type LayoutNode } from "../schema/layout.ts";
import type { ThemePostFields } from "../theme/dynamic.ts";
import { renderDynamicPost } from "./dynamic-post.ts";
import { serialize } from "./vnode.ts";

const post: ThemePostFields = {
  id: "01POST",
  slug: "welcome",
  title: "Welcome",
  excerpt: "Short",
  content: [{ _type: "block", style: "normal", children: [{ _type: "span", text: "Body" }] }],
  featuredImageUrl: "https://example.com/hero.jpg",
  featuredImageAlt: "Hero",
  permalink: "/posts/welcome",
};

const posts: Record<string, ThemePostFields | undefined> = {
  post,
  bare: {
    ...post,
    excerpt: "",
    content: [],
    featuredImageUrl: undefined,
    featuredImageAlt: undefined,
  },
  unsafe: {
    ...post,
    featuredImageUrl: "javascript:alert(1)",
    permalink: "javascript:alert(1)",
    featuredImageAlt: "  ",
  },
  none: undefined,
};

// Golden rows cover every post field against a full post, an empty one, unsafe URLs and no
// post, in both modes, plus the heading-level clamp, decorative images and link options.
describe("post field elements (golden)", () => {
  for (const row of golden) {
    test(`${row.type} ${JSON.stringify(row.props)} with ${row.post} post, ${row.mode}`, () => {
      const node = { id: "node0001", type: row.type, props: row.props } as LayoutNode;
      const vnode = renderDynamicPost(
        node,
        { class: "c" },
        posts[row.post],
        row.mode as "public" | "editor",
      );
      expect(vnode ? serialize(vnode) : null).toBe(row.html);
    });
  }
});

describe("Post Date format and Post Excerpt length (W-177)", () => {
  const html = (type: string, props: Record<string, unknown>, fields: Partial<ThemePostFields>) => {
    const node = { id: "node0001", type, props } as LayoutNode;
    const vnode = renderDynamicPost(node, {}, { ...post, ...fields }, "public");
    return vnode ? serialize(vnode) : null;
  };

  test("a Post Date reads in the chosen format, in UTC; unset stays medium", () => {
    const at = { publishedAt: "2026-10-06T23:30:00.000Z" };
    const dates = [undefined, "short", "long", "full", "numeric"].map(
      (format) => html("post-date", format ? { format } : {}, at)?.match(/>([^<]*)</)?.[1],
    );
    expect(dates).toEqual([
      "Oct 6, 2026",
      "10/6/26",
      "October 6, 2026",
      "Tuesday, October 6, 2026",
      "2026-10-06",
    ]);
    expect(html("post-date", { format: "long" }, at)).toContain(
      'datetime="2026-10-06T23:30:00.000Z"',
    );
  });

  test("a date that can't be read shows as text with no datetime (W-196)", () => {
    expect(html("post-date", {}, { publishedAt: "Spring 2026" })).toBe("<time>Spring 2026</time>");
    expect(html("post-date", {}, { publishedAt: "2026-02-30" })).toBe("<time>2026-02-30</time>");
    expect(html("post-date", {}, { publishedAt: "2026-10-06 12:00" })).toBe(
      '<time datetime="2026-10-06 12:00">Oct 6, 2026</time>',
    );
  });

  test("a Post Date shows the day as written, whatever the offset (W-599)", () => {
    // 22:00 in Toronto is already the 7th in UTC; the post was published on the 6th.
    expect(html("post-date", {}, { publishedAt: "2026-10-06T22:00:00-04:00" })).toBe(
      '<time datetime="2026-10-06T22:00:00-04:00">Oct 6, 2026</time>',
    );
    expect(
      html("post-date", { format: "numeric" }, { publishedAt: "2026-10-07T01:00:00+05:30" }),
    ).toBe('<time datetime="2026-10-07T01:00:00+05:30">2026-10-07</time>');
  });

  test("a Post Excerpt is cut to its word count with an ellipsis, and a short one is kept", () => {
    const excerpt = { excerpt: "One two  three\nfour five" };
    expect(html("post-excerpt", { maxWords: 3 }, excerpt)).toBe("<p>One two three…</p>");
    expect(html("post-excerpt", { maxWords: 5 }, excerpt)).toBe("<p>One two  three\nfour five</p>");
    expect(html("post-excerpt", {}, excerpt)).toBe("<p>One two  three\nfour five</p>");
  });

  test("W-660: a Japanese or Thai excerpt is cut by words, and a blank one renders nothing", () => {
    const ja = { excerpt: "私は東京で新しい仕事を始めました。毎日とても楽しいです。" };
    const cut = html("post-excerpt", { maxWords: 3 }, ja) ?? "";
    expect(cut.endsWith("…</p>")).toBe(true);
    expect(cut.length).toBeLessThan((html("post-excerpt", {}, ja) ?? "").length);
    const th = { excerpt: "สวัสดีครับ วันนี้อากาศดีมาก" };
    expect(html("post-excerpt", { maxWords: 1 }, th)).toBe("<p>สวัสดี…</p>");
    expect(html("post-excerpt", { maxWords: 2 }, { excerpt: "Hello 世界の人々" })).toBe(
      "<p>Hello 世界…</p>",
    );
    expect(html("post-excerpt", {}, { excerpt: "   " })).toBeNull();
  });

  test("the settings are optional props the schema checks", () => {
    const parse = (type: string, props: Record<string, unknown>) =>
      (type === "post-date" ? PostDateNode : PostExcerptNode).safeParse({
        id: "node0001",
        type,
        props,
      }).success;
    expect(parse("post-date", { format: "full" })).toBe(true);
    expect(parse("post-date", { format: "relative" })).toBe(false);
    expect(parse("post-excerpt", { maxWords: 30 })).toBe(true);
    expect(parse("post-excerpt", { maxWords: 0 })).toBe(false);
    expect(parse("post-excerpt", { maxWords: 2.5 })).toBe(false);
  });
});

describe("an untitled post (W-661)", () => {
  const untitled = { ...post, title: "   ", featuredImageAlt: undefined };
  const out = (type: string, mode: "public" | "editor") => {
    const vnode = renderDynamicPost(
      { id: "n0000001", type, props: {} } as never,
      {},
      untitled,
      mode,
    );
    return vnode ? serialize(vnode) : "";
  };
  test("Post Title renders no empty heading publicly and its placeholder in the editor", () => {
    expect(out("post-title", "public")).toBe("");
    expect(out("post-title", "editor")).toBe("<h1>Post Title</h1>");
  });
  test("Post Image falls back to a real name, not blank alt text", () => {
    expect(out("post-image", "public")).toContain('alt="Featured image"');
  });
});

describe("Post Date in the page's language (W-688)", () => {
  const node = { id: "node0001", type: "post-date", props: { format: "long" } } as LayoutNode;
  const at = { ...post, publishedAt: "2026-10-06T12:00:00Z" };
  const text = (lang?: string) => {
    const vnode = renderDynamicPost(node, {}, at, "public", false, lang);
    return vnode ? serialize(vnode).match(/>([^<]*)</)?.[1] : null;
  };

  test("a French page writes the date in French", () => {
    expect(text("fr-CA")).toBe("6 octobre 2026");
    expect(text("de")).toBe("6. Oktober 2026");
  });

  test("no language, or a malformed one, stays English", () => {
    expect(text()).toBe("October 6, 2026");
    expect(text("not a tag!")).toBe("October 6, 2026");
  });
});

describe("clipped free-text dates keep whole characters (W-700)", () => {
  test("a long text date doesn't end in half an emoji", () => {
    const node = { id: "node0001", type: "post-date", props: {} } as LayoutNode;
    const raw = `${"a".repeat(79)}🌸 spring`;
    const vnode = renderDynamicPost(node, {}, { ...post, publishedAt: raw }, "public");
    expect(vnode?.children).toEqual(["a".repeat(79)]);
  });
});
