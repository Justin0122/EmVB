import * as React from "react";
import { PLUGIN_ID } from "../constants.ts";
import { requestJson, type Fetcher } from "./api.ts";

/**
 * The site's own stylesheet (`emvb({ canvasCss })`), which the canvas adds after EmVB's CSS as
 * the site's pages do. Empty when the site names none or it can't be loaded.
 */
export function useSiteCss(fetcher: Fetcher): string {
  const [css, setCss] = React.useState("");
  React.useEffect(() => {
    let live = true;
    requestJson<{ css?: string }>(fetcher, `/_emdash/api/plugins/${PLUGIN_ID}/canvas-css`)
      .then((body) => live && setCss(typeof body?.css === "string" ? body.css : ""))
      .catch(() => live && setCss(""));
    return () => {
      live = false;
    };
  }, [fetcher]);
  return css;
}
