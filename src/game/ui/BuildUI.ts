// ============================================================
//  src/game/ui/BuildUI.ts
//  Doodad selection overlay.  Toggle with "B".
//  Clicking a card enters Build Mode (sets heldItemId).
// ============================================================

import { sm }       from "@engine/core/StateManager";
import { bus }      from "@engine/core/EventBus";
import { registry } from "@engine/core/Registry";

// ── Styles ────────────────────────────────────────────────────

const STYLES = `
#build-ui {
  display: none;
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 100;
  background: rgba(8, 12, 16, 0.97);
  border: 1px solid #2a1e3a;
  border-radius: 4px;
  padding: 16px;
  min-width: 400px;
  max-width: 560px;
  font-family: monospace;
  color: #c8d8e0;
  box-shadow: 0 0 40px rgba(180, 100, 255, 0.07);
  user-select: none;
}

#build-ui.open { display: block; }

#build-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 12px;
  border-bottom: 1px solid #2a1e3a;
  padding-bottom: 8px;
  cursor: grab;
}
#build-header:active { cursor: grabbing; }

#build-header h2 {
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #b060ff;
  margin: 0;
  font-weight: normal;
}

#build-header span {
  font-size: 9px;
  color: #4a3a6a;
  letter-spacing: 0.1em;
}

#build-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.build-card {
  background: rgba(255,255,255,0.03);
  border: 1px solid #2a1e3a;
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
  border-color: #b060ff;
  background: rgba(180, 100, 255, 0.12);
}

.build-card .bc-sprite {
  width: 36px;
  height: 36px;
  border-radius: 3px;
  flex-shrink: 0;
}

.build-card .bc-name {
  font-size: 8px;
  color: #8a78a0;
  text-align: center;
  line-height: 1.3;
}

.build-card .bc-size {
  font-size: 7px;
  color: #4a3a6a;
}

#build-footer {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #2a1e3a;
  font-size: 9px;
  color: #3a2a5a;
  letter-spacing: 0.1em;
  text-align: center;
}

/* Build mode HUD strip */
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
  font-size: 10px;
  letter-spacing: 0.12em;
  color: #b060ff;
  pointer-events: none;
  display: none;
  z-index: 98;
  white-space: nowrap;
}
#build-mode-hud.visible { display: block; }
`;

function injectStyles(): void {
  if (document.getElementById("build-ui-styles")) return;
  const style = document.createElement("style");
  style.id = "build-ui-styles";
  style.textContent = STYLES;
  document.head.appendChild(style);
}

// ── BuildUI class ─────────────────────────────────────────────

export class BuildUI {
  private readonly panel:    HTMLElement;
  private readonly header:   HTMLElement;
  private readonly grid:     HTMLElement;
  private readonly modeHud:  HTMLElement;
  private isOpen      = false;
  private dragging    = false;
  private dragOffX    = 0;
  private dragOffY    = 0;
  private positioned  = false;

  constructor() {
    injectStyles();

    // ── Panel ────────────────────────────────────────────────
    this.panel = document.createElement("div");
    this.panel.id = "build-ui";
    this.panel.innerHTML = `
      <div id="build-header">
        <h2>◈ Fabrication Menu</h2>
        <span>[B] CLOSE · DRAG TO MOVE</span>
      </div>
      <div id="build-grid"></div>
      <div id="build-footer">CLICK TO SELECT · R ROTATE · ESC / RMB CANCEL</div>
    `;
    document.body.appendChild(this.panel);

    this.header = this.panel.querySelector("#build-header")!;
    this.grid   = this.panel.querySelector("#build-grid")!;

    // ── Build mode HUD ────────────────────────────────────────
    this.modeHud = document.createElement("div");
    this.modeHud.id = "build-mode-hud";
    document.body.appendChild(this.modeHud);

    // ── Bindings ─────────────────────────────────────────────
    this.bindDrag();

    window.addEventListener("keydown", e => {
      if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        this.toggle();
      }
      // Keep HUD in sync when rotation changes
      if ((e.key === "r" || e.key === "R") && sm.state.player.heldItemId) {
        this.updateHud();
      }
      if (e.key === "Escape") {
        this.close();
        this.updateHud();
      }
    });

    // Update HUD when right-click clears build mode
    window.addEventListener("contextmenu", () => {
      requestAnimationFrame(() => this.updateHud());
    });

    // Close when another panel opens
    bus.on("ui:close-panels", ({ except }) => {
      if (except !== "build") this.close();
    });
  }

  // ── Drag (same pattern as InventoryUI) ───────────────────────

  private bindDrag(): void {
    this.header.addEventListener("mousedown", e => {
      if (e.button !== 0) return;
      e.preventDefault();
      this.dragging = true;

      if (!this.positioned) {
        const rect = this.panel.getBoundingClientRect();
        this.panel.style.transform = "none";
        this.panel.style.left = `${rect.left}px`;
        this.panel.style.top  = `${rect.top}px`;
        this.positioned = true;
      }

      const rect = this.panel.getBoundingClientRect();
      this.dragOffX = e.clientX - rect.left;
      this.dragOffY = e.clientY - rect.top;
    });

    window.addEventListener("mousemove", e => {
      if (!this.dragging) return;
      const margin = 8;
      const pw = this.panel.offsetWidth;
      const ph = this.panel.offsetHeight;
      const left = Math.max(margin, Math.min(window.innerWidth  - pw - margin, e.clientX - this.dragOffX));
      const top  = Math.max(margin, Math.min(window.innerHeight - ph - margin, e.clientY - this.dragOffY));
      this.panel.style.left = `${left}px`;
      this.panel.style.top  = `${top}px`;
    });

    window.addEventListener("mouseup", () => { this.dragging = false; });
  }

  // ── Public ───────────────────────────────────────────────────

  toggle(): void {
    this.isOpen = !this.isOpen;
    this.panel.classList.toggle("open", this.isOpen);
    if (this.isOpen) this.render();
  }

  open():  void { if (!this.isOpen) this.toggle(); }
  close(): void { if (this.isOpen)  this.toggle(); }

  /** Called every frame by GameLoop so the HUD stays current. */
  tick(): void {
    this.updateHud();
  }

  // ── Rendering ────────────────────────────────────────────────

  private render(): void {
    this.grid.innerHTML = "";
    const currentHeld = sm.state.player.heldItemId;

    for (const [, def] of registry.allDoodads()) {
      const card = document.createElement("div");
      card.className = "build-card" + (def.id === currentHeld ? " selected" : "");

      const color = def.sprite.startsWith("#") ? def.sprite : "#556";
      const fp    = def.footprint;

      card.innerHTML = `
        <div class="bc-sprite" style="background:${color}"></div>
        <div class="bc-name">${def.name}</div>
        <div class="bc-size">${fp.w}×${fp.h} · ${def.powerDraw}W</div>
      `;
      card.title = def.description;

      card.addEventListener("click", () => {
        sm.state.player.heldItemId       = def.id;
        sm.state.player.placementRotation = 0;
        this.close();
        this.updateHud();
      });

      this.grid.appendChild(card);
    }
  }

  private updateHud(): void {
    const { heldItemId, placementRotation } = sm.state.player;
    if (!heldItemId) {
      this.modeHud.classList.remove("visible");
      return;
    }
    const def = registry.findDoodad(heldItemId);
    if (!def) { this.modeHud.classList.remove("visible"); return; }

    const rotLabel = ["0°", "90°", "180°", "270°"][placementRotation] ?? "0°";
    this.modeHud.textContent =
      `◈ BUILD MODE  ·  ${def.name.toUpperCase()}  ·  ROT ${rotLabel}  ·  [R] ROTATE  [ESC/RMB] CANCEL`;
    this.modeHud.classList.add("visible");
  }
}
