import { afterEach, describe, expect, test } from "bun:test";
import { initCarousels } from "./runtime.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

/** A carousel whose track is `scrollWidth` wide in a `clientWidth` window, slides 200px wide. */
function carousel(scrollWidth: number, clientWidth: number) {
  document.body.innerHTML = `<div data-emvb-carousel=""><div class="emvb-carousel-track"><div class="emvb-carousel-slide"></div><div class="emvb-carousel-slide"></div></div><button data-emvb-carousel-arrow="prev" hidden></button><button data-emvb-carousel-arrow="next" hidden></button></div>`;
  const track = document.querySelector(".emvb-carousel-track") as HTMLElement;
  Object.defineProperty(track, "scrollWidth", { value: scrollWidth });
  Object.defineProperty(track, "clientWidth", { value: clientWidth });
  const slide = document.querySelector(".emvb-carousel-slide") as HTMLElement;
  slide.getBoundingClientRect = () => ({ width: 200 }) as DOMRect;
  const scrolls: number[] = [];
  track.scrollBy = ((options: ScrollToOptions) => {
    scrolls.push(options.left ?? 0);
    track.scrollLeft += options.left ?? 0;
  }) as typeof track.scrollBy;
  const [prev, next] = [...document.querySelectorAll("button")] as HTMLButtonElement[];
  return { track, prev: prev as HTMLButtonElement, next: next as HTMLButtonElement, scrolls };
}

describe("carousel arrows (W-314)", () => {
  test("show when the track scrolls; Previous starts disabled; Next scrolls one slide", () => {
    const { prev, next, scrolls } = carousel(1000, 400);
    initCarousels();
    expect([prev.hidden, next.hidden, prev.disabled, next.disabled]).toEqual([
      false,
      false,
      true,
      false,
    ]);
    next.click();
    expect(scrolls).toEqual([200]);
    // The browser fires scroll as the track moves; Previous turns on.
    document.querySelector(".emvb-carousel-track")?.dispatchEvent(new Event("scroll"));
    expect(prev.disabled).toBe(false);
    prev.click();
    expect(scrolls).toEqual([200, -200]);
  });

  test("stay hidden when every slide fits", () => {
    const { prev, next } = carousel(400, 400);
    initCarousels();
    expect([prev.hidden, next.hidden]).toEqual([true, true]);
  });

  test("a carousel is wired once, even when the script runs twice", () => {
    const { next, scrolls } = carousel(1000, 400);
    initCarousels();
    initCarousels();
    next.click();
    expect(scrolls).toEqual([200]);
  });
});
