// ============================================================
//  src/game/ui/UIStyleManager.ts
//
//  Injects a single <style> block into <head> containing:
//    • CSS custom properties on :root for scale and palette
//    • Shared structural styles for .ui-panel, .ui-panel-header,
//      and .ui-panel-footer
//
//  Panels override the two "cascade hook" variables on their own
//  root element to theme borders and accent colour without
//  touching shared rules:
//
//    #my-panel {
//      --panel-border-color: var(--col-purple-border);
//      --panel-accent-color: var(--col-purple-accent);
//    }
//
//  Call UIStyleManager.inject() exactly once (UIPanel does this
//  automatically); subsequent calls are no-ops.
// ============================================================

export class UIStyleManager {
  private static injected = false;

  static inject(): void {
    if (this.injected) return;
    this.injected = true;

    const style = document.createElement("style");
    style.id = "ui-style-manager-global";
    style.textContent = `
      /* ── Scale & typography ─────────────────────────────── */
      :root {
        --ui-scale: 1;

        --font-xs:   calc(7px  * var(--ui-scale));
        --font-2xs:  calc(8px  * var(--ui-scale));
        --font-sm:   calc(9px  * var(--ui-scale));
        --font-md:   calc(11px * var(--ui-scale));
        --font-lg:   calc(13px * var(--ui-scale));

        /* ── Global palette ────────────────────────────────── */
        --col-bg:           rgba(8, 12, 16, 0.97);
        --col-border:       #1e3a4a;
        --col-accent:       #00e5ff;
        --col-text:         #c8d8e0;
        --col-text-dim:     #3a6a7a;
        --col-text-mute:    #1e3040;

        /* Inventory slot tokens */
        --col-slot-bg:            rgba(255, 255, 255, 0.03);
        --col-slot-border:        #1a2a34;
        --col-slot-filled-bg:     rgba(0, 229, 255, 0.04);
        --col-slot-hover-border:  #2a5a6a;

        /* Purple accent theme (BuildUI) */
        --col-purple-accent: #b060ff;
        --col-purple-border: #2a1e3a;
        --col-purple-dim:    #4a3a6a;

        /* ── Panel-level cascade hooks ─────────────────────── */
        /*  Override these on the panel's own element to theme  */
        /*  borders, header rule, footer rule, and title colour */
        /*  without touching the shared ruleset below.          */
        --panel-accent-color: var(--col-accent);
        --panel-border-color: var(--col-border);

        /* ── Panel chrome constants ────────────────────────── */
        --panel-radius:        4px;
        --panel-padding:       16px;
        --panel-shadow-cyan:   0 0 40px rgba(0, 229, 255, 0.08);
        --panel-shadow-purple: 0 0 40px rgba(180, 100, 255, 0.07);
      }

      /* ── Base panel shell ───────────────────────────────── */
      /*  UIPanel injects structural inline styles (position,  */
      /*  display, overflow, z-index, transform).  This class  */
      /*  only handles visual chrome that every panel shares.  */
      .ui-panel {
        font-family: monospace;
        color: var(--col-text);
        border-radius: var(--panel-radius);
        padding: var(--panel-padding);
        user-select: none;
        box-sizing: border-box;
        border: 1px solid var(--panel-border-color);
      }

      /* ── Header ─────────────────────────────────────────── */
      .ui-panel-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        padding-bottom: 8px;
        margin-bottom: 12px;
        border-bottom: 1px solid var(--panel-border-color);
        cursor: grab;
      }
      .ui-panel-header.is-dragging { cursor: grabbing; }

      .ui-panel-header h2 {
        font-size: var(--font-md);
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: var(--panel-accent-color);
        margin: 0;
        font-weight: normal;
      }

      .ui-panel-header .hint {
        font-size: var(--font-xs);
        color: var(--col-text-dim);
        letter-spacing: 0.1em;
        flex-shrink: 0;
      }

      /* ── Footer ─────────────────────────────────────────── */
      .ui-panel-footer {
        margin-top: 10px;
        padding-top: 8px;
        border-top: 1px solid var(--panel-border-color);
        font-size: var(--font-xs);
        color: var(--col-text-mute);
        letter-spacing: 0.1em;
        text-align: center;
      }
    `;
    document.head.appendChild(style);
  }
}
