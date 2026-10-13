import { describe, expect, test } from "bun:test";
import { resolveEmbedUrl } from "./embed-url.ts";

describe("video links typed without https:// (W-448)", () => {
  test("known video hosts embed", () => {
    expect(resolveEmbedUrl("youtube.com/watch?v=dQw4w9WgXcQ")?.kind).toBe("iframe");
    expect(resolveEmbedUrl("youtu.be/dQw4w9WgXcQ")?.kind).toBe("iframe");
    expect(resolveEmbedUrl("vimeo.com/76979871")?.kind).toBe("iframe");
  });
  test("site paths stay video files", () => {
    expect(resolveEmbedUrl("/media/clip.mp4")).toEqual({ kind: "video", src: "/media/clip.mp4" });
    expect(resolveEmbedUrl("youtube-clips/a.mp4")?.kind).toBe("video");
  });
});
