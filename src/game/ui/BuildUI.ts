// ============================================================
//  src/game/ui/BuildUI.ts
//  Doodad selection overlay.  Toggle with "B".
//
//  Extends UIPanel — no drag logic, no open/close boilerplate.
//  All hardcoded pixel sizes replaced with CSS variables.
//
//  The build-mode HUD strip (#build-mode-hud) is a separate
//  screen-fixed element; it is NOT part of the draggable panel.
//  tick() is called every frame by GameLoop to keep it current.
// ============================================================

import { UIPanel }   from "./UIPanel";
import { sm }        from "@engine/core/StateManager";
import { bus }       from "@engine/core/EventBus";
import { registry }  from "@engine/core/Registry";
import { CursorMode } from "@t/state";

// ── Styles ────────────────────────────────────────────────────
//  Visual chrome unique to this panel.
//  Uses --col-purple-* variables for the purple theme and
//  overrides the two panel-level cascade hooks so the shared
//  .ui-panel-header / .ui-panel-footer rules pick up the
//  correct border and accent colour automatically.

const STYLES = `
#build-ui {
  background: var(--col-bg);
  box-shadow: var(--panel-shadow-purple);
  max-width: 560px;

  /* Override shared cascade hooks for the purple theme */
  --panel-border-color: var(--col-purple-border);
  --panel-accent-color: var(--col-purple-accent);
}

#build-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.build-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--col-purple-border);
  border-radius: 3px;
  padding: 8px 6px 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition: border-color 0.1s, background 0.1s;
}

.build-card:hover {
  border-color: #7030c0;
  background: rgba(180, 100, 255, 0.07);
}

.build-card.selected {
  border-color: var(--col-purple-accent);
  background: rgba(180, 100, 255, 0.12);
}

.build-card .bc-sprite {
  width: 36px;
  height: 36px;
  border-radius: 3px;
  flex-shrink: 0;
}

.build-card .bc-name {
  font-size: var(--font-2xs);
  color: #8a78a0;
  text-align: center;
  line-height: 1.3;
}

.build-card .bc-size {
  font-size: var(--font-xs);
  color: var(--col-purple-dim);
}

/* ── Build-mode HUD strip ────────────────────────────────────── */
/*  Lives outside the draggable panel (screen-fixed, z-index 98)  */
#build-mode-hud {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(16, 8, 24, 0.92);
  border: 1px solid #4a2a7a;
  border-radius: 3px;
  padding: 6px 18px;
  font-family: monospace;
  font-size: var(--font-sm);
  letter-spacing: 0.12em;
  color: var(--col-purple-accent);
  pointer-events: none;
  display: none;
  z-index: 98;
  white-space: nowrap;
}
#build-mode-hud.visible { display: block; }
`;

function injectStyles(): void {
  if (document.getElementById("build-ui-styles")) return;
  const s = document.createElement("style");
  s.id = "build-ui-styles";
  s.textContent = STYLES;
  document.head.appendChild(s);
}

// ── BuildUI ───────────────────────────────────────────────────

export class BuildUI extends UIPanel {
  private readonly grid:    HTMLElement;
  /** Separate screen-fixed element — not part of the panel. */
  private readonly modeHud: HTMLElement;

  constructor() {
    super({
      id:        "build-ui",
      name:      "build",
      minWidth:  400,
      resizable: true,
    });

    injectStyles();

    // ── Inner HTML ─────────────────────────────────────────────
    //  UIStyleManager's .ui-panel-header / .ui-panel-footer rules
    //  handle the shared chrome; the --panel-* CSS overrides
    //  set on #build-ui ensure purple theming cascades down.
    this.el.innerHTML = `
      <div class="ui-panel-header" id="build-header">
        <h2>◈ Fabrication Menu</h2>
        <span class="hint">[B] CLOSE · DRAG TO MOVE</span>
      </div>
      <div id="build-grid"></div>
      <div class="ui-panel-footer">
        CLICK TO SELECT · R ROTATE · ESC / RMB CANCEL
      </div>
    `;

    this.grid = this.el.querySelector("#build-grid")!;

    // Block game-canvas events while hovering the panel
    this.el.addEventListener("mousedown", e => e.stopPropagation());
    this.el.addEventListener("click",     e => e.stopPropagation());

    // Wire header as drag handle
    this.bindDragHandle(this.el.querySelector("#build-header")!);

    // ── Build-mode HUD (separate element, not in panel) ────────
    this.modeHud = document.createElement("div");
    this.modeHud.id = "build-mode-hud";
    document.body.appendChild(this.modeHud);

    // ── Key bindings ───────────────────────────────────────────
    window.addEventListener("keydown", e => {
      switch (e.key) {
        case "b":
        case "B":
          e.preventDefault();
          this.toggle();
          break;

        case "r":
        case "R":
          // BuildSystem handles the actual math; we just wait for it to finish and update the HUD text.
          if (sm.state.player.heldItemId) {
            requestAnimationFrame(() => this.updateHud());
          }
          break;

        case "Escape":
          // Close the panel.  BuildSystem's own Escape handler clears
          // heldItemId; updateHud() sees the cleared state immediately
          // because both handlers fire in the same event dispatch.
          this.close();
          this.updateHud();
          break;
      }
    });

    // Right-click may clear build mode (handled by BuildSystem).
    // We only need to refresh the HUD strip on the next frame.
    window.addEventListener("contextmenu", () => {
      requestAnimationFrame(() => this.updateHud());
    });

    // Close when another panel requests all panels to close
    bus.on("ui:close-panels", ({ except }) => {
      if (except !== "build") this.close();
    });
  }

  // ── UIPanel hooks ──────────────────────────────────────────────

  /** Render the doodad card grid each time the panel opens. */
  protected override onOpen(): void {
    this.renderCards();
  }

  /** Keep the HUD strip in sync when the panel closes. */
  protected override onClose(): void {
    this.updateHud();
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Called every frame by GameLoop.
   * Keeps the build-mode HUD strip current without re-rendering
   * the full card grid.
   */
  tick(): void {
    this.updateHud();
  }

  // ── Rendering ─────────────────────────────────────────────────

  private renderCards(): void {
    this.grid.innerHTML = "";
    const currentHeld = sm.state.player.heldItemId;

    // Determine the effective doodad ID for the current held item
    // (it may be an item ID with placesDoodadId, or a direct doodad ID).
    const heldItemDef  = currentHeld ? registry.findItem(currentHeld) : undefined;
    const heldDoodadId = heldItemDef?.placesDoodadId ?? currentHeld ?? null;

    for (const [, def] of registry.allDoodads()) {
      const card  = document.createElement("div");
      const isSelected = def.id === heldDoodadId;
      card.className = "build-card" + (isSelected ? " selected" : "");

      // Prefer texture / animation frame over flat colour
      const color   = def.sprite.startsWith("#") ? def.sprite : "#556";
      const texture = def.texture ?? def.animations?.idle?.[0];
      const fp      = def.footprint;

      const spriteHtml = texture
        ? `<img class="bc-sprite" src="${texture}"
               style="object-fit:contain;background:transparent;" />`
        : `<div class="bc-sprite" style="background:${color}"></div>`;

      card.innerHTML = `
        ${spriteHtml}
        <div class="bc-name">${def.name}</div>
        <div class="bc-size">${fp.w}×${fp.h} · ${def.powerDraw}W</div>
      `;
      card.title = def.description;

      // Click: select this doodad for placement (legacy doodad-ID path)
      card.addEventListener("click", () => {
        sm.state.player.heldItemId        = def.id;
        sm.state.player.placementRotation = 0;
        sm.state.player.cursorMode        = CursorMode.Build;
        this.close();
        this.updateHud();
      });

      // Drag: let the user assign it to an ActionBar slot
      card.draggable = true;
      card.addEventListener("dragstart", e => {
        e.dataTransfer!.setData("text/plain", def.id);
        e.dataTransfer!.effectAllowed = "link";
      });

      this.grid.appendChild(card);
    }

    // ── Deconstruct card ──────────────────────────────────────
    const deconCard = document.createElement("div");
    const deconSelected =
      sm.state.player.cursorMode === CursorMode.Deconstruct;
    deconCard.className = "build-card" + (deconSelected ? " selected" : "");
    deconCard.innerHTML = `
      <div class="bc-sprite" style="
        background:#3a1a0a;
        border:1px dashed #7a3a1a;
        display:flex;align-items:center;justify-content:center;
        font-size:20px;">⛏</div>
      <div class="bc-name">Deconstruct</div>
      <div class="bc-size">Hold LMB</div>
    `;
    deconCard.title = "Hold LMB over any machine to remove it";

    deconCard.addEventListener("click", () => {
      sm.state.player.cursorMode = CursorMode.Deconstruct;
      sm.state.player.heldItemId = null;
      this.close();
      this.updateHud();
    });

    deconCard.draggable = true;
    deconCard.addEventListener("dragstart", e => {
      e.dataTransfer!.setData("text/plain", "deconstruct");
      e.dataTransfer!.effectAllowed = "link";
    });

    this.grid.appendChild(deconCard);
  }

  private updateHud(): void {
    const { heldItemId, placementRotation, cursorMode } = sm.state.player;

    if (cursorMode === CursorMode.Deconstruct) {
      this.modeHud.textContent =
        `⛏ DECONSTRUCT MODE  ·  HOLD LMB OVER MACHINE  ·  [ESC/RMB] CANCEL`;
      this.modeHud.classList.add("visible");
      return;
    }

    if (!heldItemId) {
      this.modeHud.classList.remove("visible");
      return;
    }

    // Resolve doodad name from either a direct doodad ID
    // or an inventory item whose placesDoodadId points at a doodad.
    const itemDef   = registry.findItem(heldItemId);
    const doodadDef = itemDef?.placesDoodadId
      ? registry.findDoodad(itemDef.placesDoodadId)
      : registry.findDoodad(heldItemId);

    if (!doodadDef) {
      this.modeHud.classList.remove("visible");
      return;
    }

    const rotLabel = (["0°", "90°", "180°", "270°"] as const)[placementRotation] ?? "0°";
    this.modeHud.textContent =
      `◈ BUILD MODE  ·  ${doodadDef.name.toUpperCase()}  ·  ROT ${rotLabel}  ·  [R] ROTATE  [ESC/RMB] CANCEL`;
    this.modeHud.classList.add("visible");
  }
}
