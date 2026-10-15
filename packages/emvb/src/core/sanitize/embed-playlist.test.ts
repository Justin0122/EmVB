import { describe, expect, test } from "bun:test";
import { resolveEmbedUrl } from "./embed-url.ts";

describe("YouTube playlists embed as a playlist (W-691)", () => {
  const list = "PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG";
  const playlist = `https://www.youtube-nocookie.com/embed/videoseries?list=${list}`;

  test("an embed/videoseries link keeps its list", () => {
    expect(resolveEmbedUrl(`https://www.youtube.com/embed/videoseries?list=${list}`)).toEqual({
      kind: "iframe",
      src: playlist,
      provider: "youtube",
    });
  });

  test("a playlist page link embeds the playlist, with a start time after the list", () => {
    expect(resolveEmbedUrl(`youtube.com/playlist?list=${list}`)?.src).toBe(playlist);
    expect(resolveEmbedUrl(`https://www.youtube.com/playlist?list=${list}&t=90`)?.src).toBe(
      `${playlist}&start=90`,
    );
  });

  test("a playlist link without a usable list is refused, not a broken player", () => {
    expect(resolveEmbedUrl("https://www.youtube.com/embed/videoseries")).toBeUndefined();
    expect(resolveEmbedUrl('https://www.youtube.com/playlist?list=x"><script>')).toBeUndefined();
  });

  test("a single video still embeds by id", () => {
    expect(resolveEmbedUrl("https://youtu.be/dQw4w9WgXcQ?t=5")?.src).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=5",
    );
  });
});
