/** Styles for the full-screen image editor (W-482). Kumo tokens only, so dark mode follows. */
export const IMAGE_EDITOR_CSS = `
.emvb-image-editor-popup.emvb-image-editor-popup {
  padding: 0; display: flex; overflow: hidden;
  width: 100vw; height: 100dvh; max-width: none; max-height: none;
  border-radius: 0; border: 0; inset: 0; translate: none; top: 0; left: 0;
}
.emvb-image-editor {
  --emvb-ie-rail: 76px;
  --emvb-ie-panel: 300px;
  --emvb-ie-stage: color-mix(in oklab, var(--color-kumo-recessed) 70%, var(--color-kumo-base));
  --emvb-ie-check: color-mix(in oklab, var(--color-kumo-line) 45%, transparent);
  flex: 1; min-width: 0; min-height: 0;
  display: grid;
  grid-template-columns: var(--emvb-ie-rail) var(--emvb-ie-panel) minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr) auto;
  grid-template-areas: "top top top" "rail panel stage" "status status status";
  color: var(--text-color-kumo-default); background: var(--color-kumo-base);
  font-size: 13px; line-height: 18px;
}
.emvb-image-editor-top {
  grid-area: top; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px;
  padding: 10px 16px; border-bottom: 1px solid var(--color-kumo-hairline);
  background: var(--emvb-glass-elevated, var(--color-kumo-elevated));
}
.emvb-image-editor-heading { display: flex; align-items: center; gap: 12px; min-width: 0; }
.emvb-image-editor-mark {
  flex: none; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 9px;
  color: var(--color-kumo-brand);
  background: color-mix(in oklab, var(--color-kumo-brand) 12%, var(--color-kumo-base));
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--color-kumo-brand) 22%, transparent);
}
.emvb-image-editor-mark svg { width: 20px; height: 20px; }
.emvb-image-editor-titles { display: flex; flex-direction: column; min-width: 0; }
.emvb-image-editor-title { margin: 0; font-size: 15px; line-height: 20px; font-weight: 600; }
.emvb-image-editor-subtitle {
  margin: 0; font-size: 12px; line-height: 16px; color: var(--text-color-kumo-subtle);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums;
}
.emvb-image-editor-tools {
  display: flex; align-items: center; gap: 2px; padding: 3px;
  border-radius: 10px; background: var(--color-kumo-base); box-shadow: var(--emvb-elevation-s);
}
.emvb-image-editor-divider { width: 1px; height: 18px; margin: 0 4px; background: var(--color-kumo-hairline); }
.emvb-image-editor-tools [aria-pressed="true"] { background: color-mix(in oklab, var(--color-kumo-brand) 14%, transparent); color: var(--color-kumo-brand); }
.emvb-image-editor-actions { display: flex; justify-content: flex-end; gap: 8px; }

.emvb-image-editor-rail {
  grid-area: rail; padding: 10px 8px; border-right: 1px solid var(--color-kumo-hairline);
  background: color-mix(in oklab, var(--color-kumo-recessed) 45%, var(--color-kumo-base));
}
.emvb-image-editor-rail [role="tablist"] { display: flex; flex-direction: column; gap: 4px; }
.emvb-image-editor-tool {
  display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100%;
  padding: 9px 4px 7px; border: 0; border-radius: 8px; background: transparent;
  color: var(--text-color-kumo-subtle); font: inherit; font-size: 11px; line-height: 14px; font-weight: 500; cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}
.emvb-image-editor-tool-icon { display: grid; place-items: center; width: 22px; height: 22px; }
.emvb-image-editor-tool-icon svg { width: 20px; height: 20px; }
.emvb-image-editor-tool:hover { background: var(--color-kumo-tint); color: var(--text-color-kumo-default); }
.emvb-image-editor-tool[aria-selected="true"] {
  color: var(--color-kumo-brand);
  background: color-mix(in oklab, var(--color-kumo-brand) 12%, var(--color-kumo-base));
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--color-kumo-brand) 25%, transparent);
}
.emvb-image-editor-tool:focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: 1px; }

.emvb-image-editor-panel {
  grid-area: panel; display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow: auto;
  padding: 18px 18px 20px; border-right: 1px solid var(--color-kumo-hairline);
}
.emvb-image-editor-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.emvb-image-editor-panel-head h3 { margin: 0; font-size: 14px; line-height: 20px; font-weight: 600; }
.emvb-image-editor-soon {
  display: inline-flex; align-items: center; height: 20px; padding: 0 8px; border-radius: 9999px;
  font-size: 11px; font-weight: 500; color: var(--text-color-kumo-subtle);
  background: var(--color-kumo-tint); box-shadow: inset 0 0 0 1px var(--color-kumo-hairline);
}
.emvb-image-editor-hints { margin: 4px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.emvb-image-editor-hints li {
  display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px;
  background: color-mix(in oklab, var(--color-kumo-elevated) 60%, var(--color-kumo-base));
  box-shadow: inset 0 0 0 1px var(--color-kumo-hairline);
}
.emvb-image-editor-hint-icon { display: grid; place-items: center; flex: none; width: 24px; height: 24px; border-radius: 6px; color: var(--color-kumo-brand); background: color-mix(in oklab, var(--color-kumo-brand) 10%, transparent); }
.emvb-image-editor-hint-icon svg { width: 14px; height: 14px; }
.emvb-image-editor-note {
  margin-top: auto; display: flex; flex-direction: column; gap: 2px; padding: 12px; border-radius: 8px;
  font-size: 12px; line-height: 16px; color: var(--text-color-kumo-subtle);
  background: color-mix(in oklab, var(--color-kumo-brand) 6%, var(--color-kumo-base));
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--color-kumo-brand) 18%, transparent);
}
.emvb-image-editor-note strong { color: var(--text-color-kumo-default); font-weight: 600; }

.emvb-image-editor-stage {
  grid-area: stage; position: relative; min-width: 0; min-height: 0; display: grid; place-items: center; padding: 32px;
  background-color: var(--emvb-ie-stage);
  background-image: radial-gradient(circle at 1px 1px, var(--emvb-ie-check) 1px, transparent 0);
  background-size: 18px 18px;
}
.emvb-image-editor-frame {
  position: relative; display: grid; place-items: center; max-width: 100%; max-height: 100%; min-width: 0; min-height: 0;
  width: 100%; height: 100%;
}
.emvb-image-editor-canvas, .emvb-image-editor-original {
  grid-area: 1 / 1; display: block; max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain;
  border-radius: 4px;
  background-color: #fff;
  background-image: linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%);
  background-size: 16px 16px; background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  box-shadow: 0 0 0 1px var(--color-kumo-hairline), 0 12px 32px -8px var(--color-kumo-shadow-drop), 0 2px 6px var(--color-kumo-shadow-edge);
}
.emvb-image-editor-canvas[hidden] { display: none; }
.emvb-image-editor-frame[data-comparing] .emvb-image-editor-canvas { visibility: hidden; }
.emvb-image-editor-badge {
  position: absolute; top: 12px; left: 50%; translate: -50% 0; height: 24px; padding: 0 10px; border-radius: 9999px;
  display: inline-flex; align-items: center; font-size: 12px; font-weight: 600;
  color: var(--color-kumo-base); background: color-mix(in oklab, var(--text-color-kumo-default) 82%, transparent);
}
.emvb-image-editor-overlay {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
  color: var(--text-color-kumo-subtle);
}
.emvb-image-editor-spinner { width: 26px; height: 26px; border-radius: 9999px; border: 2px solid var(--color-kumo-line); border-top-color: var(--color-kumo-brand); animation: emvb-ie-spin 0.8s linear infinite; }
@keyframes emvb-ie-spin { to { transform: rotate(360deg); } }
.emvb-image-editor-error {
  position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; max-width: 420px; padding: 28px 28px 24px;
  text-align: center; border-radius: 12px; background: var(--color-kumo-base); box-shadow: var(--emvb-elevation-m);
}
.emvb-image-editor-error h3 { margin: 4px 0 0; font-size: 15px; line-height: 20px; font-weight: 600; }
.emvb-image-editor-error p { margin: 0; color: var(--text-color-kumo-subtle); }
.emvb-image-editor-error-icon { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; color: var(--text-color-kumo-danger); background: color-mix(in oklab, var(--text-color-kumo-danger) 10%, transparent); }
.emvb-image-editor-error-icon svg { width: 26px; height: 26px; }
.emvb-image-editor-error-actions { margin-top: 8px; display: flex; gap: 8px; }

.emvb-image-editor-status {
  grid-area: status; display: flex; align-items: center; justify-content: space-between; gap: 16px;
  height: 32px; padding: 0 16px; border-top: 1px solid var(--color-kumo-hairline);
  font-size: 12px; color: var(--text-color-kumo-subtle); background: var(--color-kumo-base);
}
.emvb-image-editor-mode { display: inline-flex; align-items: center; gap: 6px; }
.emvb-image-editor-mode svg { width: 14px; height: 14px; }
.emvb-image-editor-mode[data-emvb-image-mode="worker"] svg { color: var(--color-kumo-brand); }
.emvb-image-editor-keys kbd {
  display: inline-block; min-width: 18px; padding: 0 4px; margin: 0 1px; border-radius: 4px; text-align: center;
  font: 11px/16px var(--font-mono); background: var(--color-kumo-tint); box-shadow: inset 0 -1px 0 var(--color-kumo-line);
}
@media (max-width: 860px) {
  .emvb-image-editor { --emvb-ie-panel: 240px; }
  .emvb-image-editor-keys { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .emvb-image-editor-spinner { animation: none; }
  .emvb-image-editor-tool { transition: none; }
}
`;
