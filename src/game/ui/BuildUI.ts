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
  max-width: calc(560px * var(--ui-scale));

  /* Override shared cascade hooks for the purple theme */
  --panel-border-color: var(--col-purple-border);
  --panel-accent-color: var(--col-purple-accent);
}

#build-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--gap-md);
}

.build-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--col-purple-border);
  border-radius: calc(3px * var(--ui-scale));
  padding: var(--gap-lg) var(--gap-md) var(--gap-md);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-sm);
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
  width: var(--bc-sprite-size);
  height: var(--bc-sprite-size);
  border-radius: calc(3px * var(--ui-scale));
  flex-shrink: 0;
  pointer-events: none;
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
/*  Sits at the top so it never collides with the chest / doodad  */
/*  interaction hints at the bottom.                              */
#build-mode-hud {
  position: fixed;
  top: calc(12px * var(--ui-scale));
  left: 50%;
  transform: translateX(-50%);
  background: rgba(16, 8, 24, 0.92);
  border: 1px solid #4a2a7a;
  border-radius: calc(3px * var(--ui-scale));
  padding: calc(6px * var(--ui-scale)) calc(18px * var(--ui-scale));
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

/* ── Build cost tooltip ──────────────────────────────────────── */
/*  Follows the mouse cursor; shows each required item in         */
/*  green (affordable) or red (short).                           */
#build-cost-tooltip {
  position: fixed;
  pointer-events: none;
  display: none;
  z-index: 99;
  background: rgba(10, 6, 18, 0.94);
  border: 1px solid #3a1a5a;
  border-radius: calc(3px * var(--ui-scale));
  padding: calc(6px * var(--ui-scale)) calc(10px * var(--ui-scale));
  font-family: monospace;
  font-size: var(--font-xs);
  letter-spacing: 0.08em;
  min-width: calc(130px * var(--ui-scale));
}
#build-cost-tooltip.visible { display: block; }

.bct-label {
  color: #4a2a6a;
  font-size: var(--font-xs);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  margin-bottom: calc(5px * var(--ui-scale));
}

.bct-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: calc(10px * var(--ui-scale));
  line-height: 1.7;
}

.bct-item { color: #9080a8; }

.bct-have {
  font-size: var(--font-xs);
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.bct-have.ok  { color: #40b060; }
.bct-have.err { color: #c04040; }
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
  private readonly grid:         HTMLElement;
  /** Separate screen-fixed element — not part of the panel. */
  private readonly modeHud:      HTMLElement;
  /** Mouse-following cost breakdown tooltip. */
  private readonly costTooltip:  HTMLElement;
  private _mouseX = 0;
  private _mouseY = 0;

  constructor() {
    super({
      id:        "build-ui",
      name:      "build",
      minWidth:  400,
      resizable: true,
    });

    // Default to top-center so it doesn't obscure the play area.
    // UIPanel sets 50%/50% inline; these overrides win because they
    // run after super() and inline specificity is equal (last wins).
    this.el.style.top       = "12px";
    this.el.style.left      = "50%";
    this.el.style.transform = "translateX(-50%)";

    injectStyles();

    // ── Inner HTML ─────────────────────────────────────────────
    //  UIStyleManager's .ui-panel-header / .ui-panel-footer rules
    //  handle the shared chrome; the --panel-* CSS overrides
    //  set on #build-ui ensure purple theming cascades down.
    this.el.innerHTML = `
      <div class="ui-panel-header" id="build-header">
        <h2>◈ Fabrication Menu</h2>
        <span class="hint">B / ESC — CLOSE  ·  DRAG TO MOVE</span>
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

    // ── Cost tooltip (follows mouse cursor) ────────────────────
    this.costTooltip = document.createElement("div");
    this.costTooltip.id = "build-cost-tooltip";
    document.body.appendChild(this.costTooltip);

    window.addEventListener("mousemove", e => {
      this._mouseX = e.clientX;
      this._mouseY = e.clientY;
    });

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

        // Escape: UIPanel base handles close(); onClose() calls updateHud().
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
        ? `<img class="bc-sprite" src="${texture}" draggable="false"
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
        font-size:var(--font-lg);">⛏</div>
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
      this.costTooltip.classList.remove("visible");
      return;
    }

    if (!heldItemId) {
      this.modeHud.classList.remove("visible");
      this.costTooltip.classList.remove("visible");
      return;
    }

    // Resolve doodad from either a direct doodad ID or a placeable item.
    const itemDef   = registry.findItem(heldItemId);
    const doodadDef = itemDef?.placesDoodadId
      ? registry.findDoodad(itemDef.placesDoodadId)
      : registry.findDoodad(heldItemId);

    if (!doodadDef) {
      this.modeHud.classList.remove("visible");
      this.costTooltip.classList.remove("visible");
      return;
    }

    const rotLabel = (["0°", "90°", "180°", "270°"] as const)[placementRotation] ?? "0°";
    this.modeHud.textContent =
      `◈ BUILD MODE  ·  ${doodadDef.name.toUpperCase()}  ·  ROT ${rotLabel}  ·  [R] ROTATE  [ESC/RMB] CANCEL`;
    this.modeHud.classList.add("visible");

    this.updateCostTooltip(heldItemId, itemDef, doodadDef);
  }

  private updateCostTooltip(
    heldItemId: string,
    itemDef:    ReturnType<typeof registry.findItem>,
    doodadDef:  NonNullable<ReturnType<typeof registry.findDoodad>>,
  ): void {
    // Mirror BuildSystem's prefab auto-detection: if the held slot is a raw
    // doodad ID, check whether the player has a prefab item for it.
    const prefabItemId: string | null = itemDef?.placesDoodadId
      ? heldItemId
      : (registry.findItemForDoodad(doodadDef.id)?.id ?? null);

    const hasPrefab = prefabItemId !== null &&
      this._countInInventory(prefabItemId) >= 1;

    const cost: { itemId: string; qty: number }[] = hasPrefab && prefabItemId
      ? [{ itemId: prefabItemId, qty: 1 }]
      : (doodadDef.cost ?? doodadDef.buildCost ?? []);

    if (cost.length === 0) {
      this.costTooltip.classList.remove("visible");
      return;
    }

    // Build rows
    const rows = cost.map(({ itemId, qty }) => {
      const def  = registry.findItem(itemId);
      const name = def?.name ?? itemId;
      const have = this._countInInventory(itemId);
      const ok   = have >= qty;
      const haveStr = ok ? `✓ ${have}` : `✗ ${have}/${qty}`;
      return `
        <div class="bct-row">
          <span class="bct-item">${qty}× ${name}</span>
          <span class="bct-have ${ok ? "ok" : "err"}">${haveStr}</span>
        </div>`;
    }).join("");

    this.costTooltip.innerHTML =
      `<div class="bct-label">Cost</div>${rows}`;

    // Position offset from cursor — 18px right, 8px above so it doesn't
    // sit under the mouse and obscure the tile being targeted.
    const tx = this._mouseX + 18;
    const ty = this._mouseY - this.costTooltip.offsetHeight - 8;
    this.costTooltip.style.left = `${tx}px`;
    this.costTooltip.style.top  = `${Math.max(4, ty)}px`;
    this.costTooltip.classList.add("visible");
  }

  private _countInInventory(itemId: string): number {
    let n = 0;
    for (const slot of sm.state.player.inventory.slots) {
      if (slot?.itemId === itemId) n += slot.qty;
    }
    return n;
  }
}
