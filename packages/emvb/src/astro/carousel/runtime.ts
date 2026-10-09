/**
 * W-314: Carousel arrows. Shows each carousel's Previous and Next buttons, scrolls the track by
 * one slide, and disables a button at its end. Without this script the track still scrolls
 * by swipe, trackpad or keyboard, and the arrows stay hidden.
 */
export function initCarousels(root: ParentNode = document): void {
  for (const carousel of root.querySelectorAll<HTMLElement>("[data-emvb-carousel]")) {
    if (carousel.dataset["emvbCarouselReady"] === "") continue;
    carousel.dataset["emvbCarouselReady"] = "";
    const track = carousel.querySelector<HTMLElement>(":scope > .emvb-carousel-track");
    const prev = carousel.querySelector<HTMLButtonElement>(
      ':scope > [data-emvb-carousel-arrow="prev"]',
    );
    const next = carousel.querySelector<HTMLButtonElement>(
      ':scope > [data-emvb-carousel-arrow="next"]',
    );
    if (!track || !prev || !next) continue;
    const step = () => {
      const slide = track.querySelector<HTMLElement>(":scope > .emvb-carousel-slide");
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return (slide?.getBoundingClientRect().width ?? track.clientWidth) + gap;
    };
    const update = () => {
      const max = track.scrollWidth - track.clientWidth;
      const scrollable = max > 1;
      prev.hidden = !scrollable;
      next.hidden = !scrollable;
      prev.disabled = track.scrollLeft <= 1;
      next.disabled = track.scrollLeft >= max - 1;
    };
    const go = (direction: number) => {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      track.scrollBy({ left: direction * step(), behavior: reduce ? "auto" : "smooth" });
    };
    prev.addEventListener("click", () =>
      go(getComputedStyle(carousel).direction === "rtl" ? 1 : -1),
    );
    next.addEventListener("click", () =>
      go(getComputedStyle(carousel).direction === "rtl" ? -1 : 1),
    );
    track.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  }
}
