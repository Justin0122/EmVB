import { describe, expect, test } from "bun:test";
import { resizeEmDashImage } from "./images.ts";

describe("EmDash images through Astro's image endpoint (W-333)", () => {
  test("a media library image becomes a WebP copy at that width", () => {
    expect(resizeEmDashImage("/_emdash/api/media/file/01ABC.png", 640)).toBe(
      "/_image?href=%2F_emdash%2Fapi%2Fmedia%2Ffile%2F01ABC.png&w=640&f=webp",
    );
  });

  test("other images, SVGs and odd keys keep their URL", () => {
    for (const src of [
      "/tuwi-logo.svg",
      "https://cdn.example.com/a.jpg",
      "/_emdash/api/media/file/01ABC.svg",
      "/_emdash/api/media/file/../secret.png",
      "/_emdash/api/media/file/a/b.png",
    ]) {
      expect(resizeEmDashImage(src, 640)).toBeNull();
    }
  });
});
