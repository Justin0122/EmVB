import { afterEach, describe, expect, test } from "bun:test";
import { initVideos } from "./runtime.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("playing a video from its poster (W-332)", () => {
  test("a click swaps the poster for the player, playing", () => {
    document.body.innerHTML =
      '<div data-emvb-video="iframe" data-emvb-video-src="https://player.vimeo.com/video/1?autoplay=1" data-emvb-video-title="Demo"><img class="emvb-video-poster" src="/p.jpg"><button class="emvb-video-play"></button></div>';
    initVideos();
    document.querySelector<HTMLButtonElement>(".emvb-video-play")?.click();
    const frame = document.querySelector("iframe");
    expect(frame?.getAttribute("src")).toBe("https://player.vimeo.com/video/1?autoplay=1");
    expect(frame?.title).toBe("Demo");
    expect(document.querySelector("img")).toBeNull();
  });

  test("a video file plays with controls", () => {
    document.body.innerHTML =
      '<div data-emvb-video="video" data-emvb-video-src="/clip.mp4"><button class="emvb-video-play"></button></div>';
    initVideos();
    document.querySelector<HTMLButtonElement>(".emvb-video-play")?.click();
    const video = document.querySelector("video");
    expect(video?.getAttribute("src")).toBe("/clip.mp4");
    expect(video?.controls).toBe(true);
  });
});
