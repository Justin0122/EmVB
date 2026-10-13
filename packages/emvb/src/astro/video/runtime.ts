/**
 * W-332: videos shown as a poster with a play button. A click swaps the poster for the player,
 * playing: the YouTube or Vimeo embed, or the video file. Until then nothing is loaded from the
 * video host.
 */
export function initVideos(root: ParentNode = document): void {
  for (const facade of root.querySelectorAll<HTMLElement>("[data-emvb-video]")) {
    if (facade.dataset["emvbVideoReady"] === "") continue;
    facade.dataset["emvbVideoReady"] = "";
    const play = facade.querySelector<HTMLButtonElement>(".emvb-video-play");
    play?.addEventListener("click", () => {
      const src = facade.dataset["emvbVideoSrc"] ?? "";
      const title = facade.dataset["emvbVideoTitle"] ?? "Video";
      const player =
        facade.dataset["emvbVideo"] === "iframe"
          ? Object.assign(document.createElement("iframe"), {
              src,
              title,
              allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
              referrerPolicy: "strict-origin-when-cross-origin",
            })
          : Object.assign(document.createElement("video"), {
              src,
              title,
              controls: true,
              autoplay: true,
            });
      player.className = "emvb-video-player";
      player.setAttribute("allowfullscreen", "");
      facade.replaceChildren(player);
      facade.removeAttribute("data-emvb-video");
      if (player instanceof HTMLVideoElement) void player.play().catch(() => {});
      else player.focus();
    });
  }
}
