// ============================================================
//  src/game/ui/ActionBarUI.ts
//
//  Persistent hotbar at the bottom of the screen.
//  Keys 1–9 select building slots; 0 selects Deconstruct mode.
//
//  This is NOT a UIPanel — it is always visible and never
//  intercepted by the PanelManager.  It just sets cursor-mode
//  state; all build/deconstruct logic lives in BuildSystem.
// ============================================================

import { sm }         from "@engine/core/StateManager";
import { registry }   from "@engine/core/Registry";
import { bus }        from "@engine/core/EventBus";
import { CursorMode } from "@t/state";
import type { UIPanel } from "./UIPanel";
import type { DoodadDef, ItemDef } from "@t/content";

// ─────────────────────────────────────────────────────────────
// Slot config.  null = empty.  "deconstruct" = sentinel value.
// ─────────────────────────────────────────────────────────────
const DECONSTRUCT_SENTINEL = "deconstruct";

const DEFAULT_LOADOUT: (string | null)[] = [
  "belt_straight",   // 1
  "basic_smelter",   // 2
  "coal_extractor",  // 3
  "iron_extractor",  // 4
  "power_node",      // 5
  "storage_chest",   // 6
  null,              // 7
  null,              // 8
  null,              // 9
  DECONSTRUCT_SENTINEL, // 0
];

// ── Styles ────────────────────────────────────────────────────

const STYLES = `
#action-bar {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
  background: rgba(6, 10, 14, 0.92);
  border: 1px solid #1e3a4a;
  border-radius: 4px;
  padding: 6px;
  z-index: 90;
  user-select: none;
}

.ab-slot {
  width: 54px;
  height: 54px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid #1a2a3a;
  border-radius: 3px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
  transition: border-color 0.1s, background 0.1s;
  box-sizing: border-box;
}
.ab-slot:hover {
  border-color: #2a5a6a;
  background: rgba(0, 229, 255, 0.05);
}
.ab-slot.active {
  border-color: #00e5ff;
  background: rgba(0, 229, 255, 0.10);
  box-shadow: 0 0 10px rgba(0, 229, 255, 0.2);
}

.ab-slot.drag-over {
  border-color: #00e5ff !important;
  background: rgba(0, 229, 255, 0.15) !important;
  box-shadow: 0 0 8px rgba(0, 229, 255, 0.3);
}

.ab-slot.ab-deconstruct { border-color: #3a1a0a; }
.ab-slot.ab-deconstruct:hover {
  border-color: #8a2a0a;
  background: rgba(255, 60, 20, 0.06);
}
.ab-slot.ab-deconstruct.active {
  border-color: #ff4422;
  background: rgba(255, 60, 20, 0.12);
  box-shadow: 0 0 10px rgba(255, 60, 20, 0.25);
}

.ab-key {
  position: absolute;
  top: 3px;
  left: 5px;
  font-family: monospace;
  font-size: 8px;
  color: #2a5a6a;
  line-height: 1;
  pointer-events: none;
}
.ab-slot.active .ab-key { color: #00e5ff; }
.ab-slot.ab-deconstruct.active .ab-key { color: #ff7755; }

.ab-sprite {
  width: 28px;
  height: 28px;
  border-radius: 2px;
  flex-shrink: 0;
  margin-bottom: 2px;
}

.ab-name {
  font-family: monospace;
  font-size: 6px;
  color: #3a6a7a;
  text-align: center;
  max-width: 50px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
  pointer-events: none;
}
.ab-slot.active .ab-name       { color: #60b0c0; }
.ab-slot.ab-deconstruct .ab-name { color: #7a4a3a; }
.ab-slot.ab-deconstruct.active .ab-name { color: #ff9977; }

.ab-empty {
  font-family: monospace;
  font-size: 10px;
  color: #1a2a3a;
  pointer-events: none;
}

/* ── Stacked UI shortcut buttons (inventory + fabrication) ─────── */
.ab-ui-btns {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-left: 4px;
  flex-shrink: 0;
}

.ab-ui-btn {
  width: 36px;
  /* 2 × 25px + 4px gap = 54px — matches slot height exactly */
  height: 25px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid #1a2a3a;
  border-radius: 3px;
  color: #3a6a7a;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.1s, background 0.1s, color 0.1s;
  box-sizing: border-box;
}
.ab-ui-btn:hover {
  border-color: #2a5a6a;
  background: rgba(0, 229, 255, 0.05);
  color: #00b0c8;
}
.ab-ui-btn.active {
  border-color: #00e5ff;
  background: rgba(0, 229, 255, 0.10);
  color: #00e5ff;
  box-shadow: 0 0 8px rgba(0, 229, 255, 0.18);
}

/* ── Tall icon buttons (power toggle + system menu) ──────────── */
.ab-icon-btn {
  width: 36px;
  height: 54px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid #1a2a2a;
  border-radius: 3px;
  color: #2a5a5a;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: border-color 0.1s, background 0.1s, color 0.1s;
  box-sizing: border-box;
}
.ab-icon-btn + .ab-icon-btn,
.ab-ui-btns + .ab-icon-btn {
  margin-left: 4px;
}
/* First icon button after the slots gets extra left margin */
.ab-slot ~ .ab-icon-btn:first-of-type { margin-left: 8px; }

.ab-icon-btn:hover {
  border-color: #1a4a5a;
  background: rgba(0, 229, 255, 0.06);
  color: #00b0c8;
}
.ab-icon-btn.active {
  border-color: #00e5ff;
  background: rgba(0, 229, 255, 0.13);
  color: #00e5ff;
  box-shadow: 0 0 10px rgba(0, 229, 255, 0.25);
}

/* Legacy alias — keep in case external CSS references it */
.ab-power-btn { /* intentionally empty — replaced by .ab-icon-btn */ }
`;

function injectStyles(): void {
  if (document.getElementById("action-bar-styles")) return;
  const s = document.createElement("style");
  s.id = "action-bar-styles";
  s.textContent = STYLES;
  document.head.appendChild(s);
}

// ── ActionBarUI ───────────────────────────────────────────────

export class ActionBarUI {
  private readonly el:        HTMLElement;
  private readonly slots:     HTMLElement[] = [];
  private readonly loadout:   (string | null)[] = [...DEFAULT_LOADOUT];
  private activeSlot:  number | null = null;
  private powerActive  = false;
  private powerBtn!:   HTMLButtonElement;

  // ── Optional panel refs for shortcut buttons ──────────────
  private inventoryPanel: UIPanel | null = null;
  private buildPanel:     UIPanel | null = null;
  private systemPanel:    UIPanel | null = null;
  private invBtn!:        HTMLButtonElement;
  private buildBtn!:      HTMLButtonElement;
  private systemBtn!:     HTMLButtonElement;

  setInventoryPanel(panel: UIPanel): void { this.inventoryPanel = panel; }
  setBuildPanel(panel: UIPanel):     void { this.buildPanel     = panel; }
  setSystemPanel(panel: UIPanel):    void { this.systemPanel    = panel; }

  constructor() {
    injectStyles();

    this.el = document.createElement("div");
    this.el.id = "action-bar";
    document.body.appendChild(this.el);

    this.buildSlots();
    this.buildPowerButton();
    this.buildUIButtons();
    this.buildSystemButton();
    this.bindKeys();

    // Keep button in sync with whoever emits the event (Alt key, etc.)
    bus.on("power:overlay:toggle", ({ active }) => {
      this.powerActive = active !== undefined ? active : !this.powerActive;
      this.powerBtn.classList.toggle("active", this.powerActive);
    });
  }

  // ── Power button ─────────────────────────────────────────

  private buildPowerButton(): void {
    this.powerBtn = document.createElement("button");
    this.powerBtn.className = "ab-icon-btn";
    this.powerBtn.style.marginLeft = "8px";
    this.powerBtn.title = "Toggle power overlay [Alt]";
    this.powerBtn.textContent = "⚡";
    this.powerBtn.addEventListener("click", () => {
      bus.emit("power:overlay:toggle", {});
    });
    this.el.appendChild(this.powerBtn);
  }

  // ── System / settings button ──────────────────────────────

  private buildSystemButton(): void {
    this.systemBtn = document.createElement("button");
    this.systemBtn.className = "ab-icon-btn";
    this.systemBtn.style.marginLeft = "4px";
    this.systemBtn.title = "System menu";
    this.systemBtn.textContent = "⚙";
    this.systemBtn.style.fontSize = "16px";
    this.systemBtn.addEventListener("click", () => this.systemPanel?.toggle());
    this.el.appendChild(this.systemBtn);
  }

  // ── UI shortcut buttons ───────────────────────────────────

  private buildUIButtons(): void {
    const wrap = document.createElement("div");
    wrap.className = "ab-ui-btns";

    this.invBtn = document.createElement("button");
    this.invBtn.className = "ab-ui-btn";
    this.invBtn.title = "Inventory [E]";
    this.invBtn.textContent = "⬡";
    this.invBtn.addEventListener("click", () => this.inventoryPanel?.toggle());

    this.buildBtn = document.createElement("button");
    this.buildBtn.className = "ab-ui-btn";
    this.buildBtn.title = "Fabrication menu [B]";
    this.buildBtn.textContent = "◈";
    this.buildBtn.addEventListener("click", () => this.buildPanel?.toggle());

    wrap.appendChild(this.invBtn);
    wrap.appendChild(this.buildBtn);
    this.el.appendChild(wrap);
  }

  // ── Visual resolution ─────────────────────────────────────

  /**
   * Given a slot id (doodad ID, item ID, or DECONSTRUCT_SENTINEL),
   * returns the display data to render.  Returns null for empty slots.
   */
  private resolveSlotVisual(
    id: string,
  ): { name: string; sprite: string; texture?: string; description: string } | null {
    if (id === DECONSTRUCT_SENTINEL) return null; // handled separately

    // Try as an inventory item first (e.g. "item_iron_extractor")
    const itemDef: ItemDef | undefined = registry.findItem(id);
    if (itemDef) {
      if (itemDef.placesDoodadId) {
        // Placeable item — mirror the doodad's visuals for consistency
        const doodadDef: DoodadDef | undefined =
          registry.findDoodad(itemDef.placesDoodadId);
        if (doodadDef) {
          const tex = doodadDef.texture ?? doodadDef.animations?.idle?.[0];
          return {
            name:        doodadDef.name,
            sprite:      doodadDef.sprite,
            ...(tex !== undefined && { texture: tex }),
            description: doodadDef.description,
          };
        }
      }
      return { name: itemDef.name, sprite: itemDef.sprite, description: itemDef.description };
    }

    // Try as a direct doodad ID (legacy default-loadout entries)
    const doodadDef: DoodadDef | undefined = registry.findDoodad(id);
    if (doodadDef) {
      const tex = doodadDef.texture ?? doodadDef.animations?.idle?.[0];
      return {
        name:        doodadDef.name,
        sprite:      doodadDef.sprite,
        ...(tex !== undefined && { texture: tex }),
        description: doodadDef.description,
      };
    }

    return null;
  }

  // ── Slot construction ─────────────────────────────────────

  private buildSlots(): void {
    this.el.innerHTML = "";
    this.slots.length = 0;

    for (let i = 0; i < 10; i++) {
      const slotId        = this.loadout[i] ?? null;
      const keyLabel      = i === 9 ? "0" : String(i + 1);
      const isDeconstruct = slotId === DECONSTRUCT_SENTINEL;

      const el = document.createElement("div");
      el.className = "ab-slot" + (isDeconstruct ? " ab-deconstruct" : "");

      // Key label
      const keyEl = document.createElement("span");
      keyEl.className = "ab-key";
      keyEl.textContent = keyLabel;
      el.appendChild(keyEl);

      if (!slotId) {
        const empty = document.createElement("div");
        empty.className = "ab-empty";
        empty.textContent = "—";
        el.appendChild(empty);
        el.title = "Empty slot — drag an item or building here";
      } else if (isDeconstruct) {
        const sprite = document.createElement("div");
        sprite.className = "ab-sprite";
        sprite.style.cssText = [
          "background:#3a1a0a",
          "border:1px dashed #7a3a1a",
          "display:flex",
          "align-items:center",
          "justify-content:center",
          "font-size:15px",
        ].join(";");
        sprite.textContent = "⛏";
        el.appendChild(sprite);

        const name = document.createElement("div");
        name.className = "ab-name";
        name.textContent = "Deconstruct";
        el.appendChild(name);

        el.title = `[${keyLabel}] Deconstruct — hold LMB over a machine to remove it`;
      } else {
        const visual = this.resolveSlotVisual(slotId);

        if (visual?.texture) {
          const img = document.createElement("img");
          img.className = "ab-sprite";
          img.src = visual.texture;
          img.style.cssText = "object-fit:contain;background:transparent;";
          el.appendChild(img);
        } else {
          const sprite = document.createElement("div");
          sprite.className = "ab-sprite";
          sprite.style.background =
            visual?.sprite.startsWith("#") ? visual.sprite : "#3a4a5a";
          el.appendChild(sprite);
        }

        const name = document.createElement("div");
        name.className = "ab-name";
        name.textContent = visual?.name ?? slotId;
        el.appendChild(name);

        el.title = visual
          ? `[${keyLabel}] ${visual.name} — ${visual.description}`
          : slotId;
      }

      // ── Click to select ──────────────────────────────────
      const slotIndex = i;
      el.addEventListener("click", () => this.selectSlot(slotIndex));

      // ── Drop target — accept drags from Inventory / BuildUI ─
      el.addEventListener("dragover", e => {
        e.preventDefault();
        e.dataTransfer!.dropEffect = "link";
        el.classList.add("drag-over");
      });
      el.addEventListener("dragleave", () => {
        el.classList.remove("drag-over");
      });
      el.addEventListener("drop", e => {
        e.preventDefault();
        el.classList.remove("drag-over");
        const id = e.dataTransfer!.getData("text/plain").trim();
        if (!id) return;
        this.loadout[slotIndex] = id;
        // If this slot was active and we're changing its assignment, deselect
        // so BuildSystem picks up the new id on next keypress.
        if (this.activeSlot === slotIndex) this.deselect();
        this.buildSlots();
      });

      this.el.appendChild(el);
      this.slots.push(el);
    }
  }

  // ── Slot selection ────────────────────────────────────────

  private selectSlot(index: number): void {
    const itemId = this.loadout[index] ?? null;

    if (itemId === DECONSTRUCT_SENTINEL) {
      sm.state.player.cursorMode        = CursorMode.Deconstruct;
      sm.state.player.heldItemId        = null;
      sm.state.player.placementRotation = 0;
    } else if (itemId !== null) {
      sm.state.player.cursorMode        = CursorMode.Build;
      sm.state.player.heldItemId        = itemId;
      sm.state.player.placementRotation = 0;
    } else {
      this.deselect();
    }
  }

  deselect(): void {
    sm.state.player.cursorMode        = CursorMode.None;
    sm.state.player.heldItemId        = null;
    sm.state.player.placementRotation = 0;
  }

  // ── Key bindings ──────────────────────────────────────────

  private bindKeys(): void {
    window.addEventListener("keydown", e => {
      // Don't intercept when typing in an actual input
      if ((e.target as HTMLElement).tagName === "INPUT") return;

      switch (e.key) {
        case "1": this.selectSlot(0); break;
        case "2": this.selectSlot(1); break;
        case "3": this.selectSlot(2); break;
        case "4": this.selectSlot(3); break;
        case "5": this.selectSlot(4); break;
        case "6": this.selectSlot(5); break;
        case "7": this.selectSlot(6); break;
        case "8": this.selectSlot(7); break;
        case "9": this.selectSlot(8); break;
        case "0": this.selectSlot(9); break;
        case "Escape":
          this.deselect();
          break;
      }
    });
  }

  // ── Tick (called every frame by GameLoop) ─────────────────

  tick(): void {
    const { cursorMode, heldItemId } = sm.state.player;

    // Sync activeSlot from live game state so external changes
    // (BuildSystem Escape handler, etc.) are reflected instantly.
    if (cursorMode === CursorMode.None) {
      this.activeSlot = null;
    } else if (cursorMode === CursorMode.Deconstruct) {
      this.activeSlot = 9;
    } else if (cursorMode === CursorMode.Build && heldItemId) {
      const idx = this.loadout.indexOf(heldItemId);
      this.activeSlot = idx >= 0 ? idx : null;
    } else {
      this.activeSlot = null;
    }

    // Refresh visual active state on hotbar slots
    for (let i = 0; i < this.slots.length; i++) {
      const el = this.slots[i];
      if (!el) continue;
      el.classList.toggle("active", i === this.activeSlot);
    }

    // Keep UI shortcut buttons in sync with their panel's open state
    this.invBtn?.classList.toggle("active",    this.inventoryPanel?.isCurrentlyOpen() ?? false);
    this.buildBtn?.classList.toggle("active",  this.buildPanel?.isCurrentlyOpen()     ?? false);
    this.systemBtn?.classList.toggle("active", this.systemPanel?.isCurrentlyOpen()    ?? false);
  }
}