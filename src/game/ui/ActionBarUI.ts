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
import { CursorMode } from "@t/state";

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
  private readonly el:      HTMLElement;
  private readonly slots:   HTMLElement[] = [];
  private readonly loadout: (string | null)[] = [...DEFAULT_LOADOUT];
  private activeSlot: number | null = null;

  constructor() {
    injectStyles();

    this.el = document.createElement("div");
    this.el.id = "action-bar";
    document.body.appendChild(this.el);

    this.buildSlots();
    this.bindKeys();
  }

  // ── Slot construction ─────────────────────────────────────

  private buildSlots(): void {
    this.el.innerHTML = "";
    this.slots.length = 0;

    for (let i = 0; i < 10; i++) {
      const itemId       = this.loadout[i] ?? null;
      const keyLabel     = i === 9 ? "0" : String(i + 1);
      const isDeconstruct = itemId === DECONSTRUCT_SENTINEL;

      const el = document.createElement("div");
      el.className = "ab-slot" + (isDeconstruct ? " ab-deconstruct" : "");

      // Key label
      const keyEl = document.createElement("span");
      keyEl.className = "ab-key";
      keyEl.textContent = keyLabel;
      el.appendChild(keyEl);

      if (!itemId) {
        const empty = document.createElement("div");
        empty.className = "ab-empty";
        empty.textContent = "—";
        el.appendChild(empty);
        el.title = "Empty slot";
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

        el.title = "[0] Deconstruct — hold LMB over a machine to remove it";
      } else {
        const def   = registry.findDoodad(itemId);
        const color = def?.sprite.startsWith("#") ? def.sprite : "#3a4a5a";

        const sprite = document.createElement("div");
        sprite.className = "ab-sprite";
        sprite.style.background = color;
        el.appendChild(sprite);

        const name = document.createElement("div");
        name.className = "ab-name";
        name.textContent = def?.name ?? itemId;
        el.appendChild(name);

        el.title = def ? `[${keyLabel}] ${def.name} — ${def.description}` : itemId;
      }

      const slotIndex = i;
      el.addEventListener("click", () => this.selectSlot(slotIndex));
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

    // Refresh visual active state
    for (let i = 0; i < this.slots.length; i++) {
      const el = this.slots[i];
      if (!el) continue;
      el.classList.toggle("active", i === this.activeSlot);
    }
  }
}