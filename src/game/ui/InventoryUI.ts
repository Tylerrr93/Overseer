// ============================================================
//  src/game/ui/InventoryUI.ts
//  HTML/CSS overlay inventory panel.
//  Subscribes to EventBus — re-renders only when inventory
//  actually changes.  Toggled open/closed with "E".
// ============================================================

import { sm }       from "@engine/core/StateManager";
import { registry } from "@engine/core/Registry";
import { bus }      from "@engine/core/EventBus";

// ── Inject styles once ────────────────────────────────────────

const STYLES = `
#inventory-ui {
  display: none;
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 100;
  background: rgba(8, 12, 16, 0.97);
  border: 1px solid #1e3a4a;
  border-radius: 4px;
  padding: 16px;
  min-width: 360px;
  font-family: monospace;
  color: #c8d8e0;
  box-shadow: 0 0 40px rgba(0, 229, 255, 0.08);
  user-select: none;
}

#inventory-ui.open {
  display: block;
}

#inventory-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 12px;
  border-bottom: 1px solid #1e3a4a;
  padding-bottom: 8px;
}

#inventory-header h2 {
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #00e5ff;
  margin: 0;
  font-weight: normal;
}

#inventory-header span {
  font-size: 9px;
  color: #3a6a7a;
  letter-spacing: 0.1em;
}

#inventory-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
}

.inv-slot {
  width: 52px;
  height: 52px;
  background: rgba(255,255,255,0.03);
  border: 1px solid #1a2a34;
  border-radius: 3px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: default;
  transition: border-color 0.1s;
}

.inv-slot:hover {
  border-color: #2a5a6a;
}

.inv-slot.filled {
  border-color: #1e4a5a;
  background: rgba(0, 229, 255, 0.04);
}

.inv-slot .sprite {
  width: 24px;
  height: 24px;
  border-radius: 2px;
  margin-bottom: 2px;
  flex-shrink: 0;
}

.inv-slot .item-qty {
  position: absolute;
  bottom: 3px;
  right: 5px;
  font-size: 9px;
  color: #a0c8d0;
  line-height: 1;
}

.inv-slot .item-name {
  font-size: 7px;
  color: #4a8a9a;
  text-align: center;
  line-height: 1.2;
  max-width: 48px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 2px;
}

.inv-slot .empty-label {
  font-size: 7px;
  color: #1e3040;
}

#inventory-footer {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #1e3a4a;
  font-size: 9px;
  color: #2a5a6a;
  letter-spacing: 0.1em;
  text-align: center;
}

/* Gather feedback flash */
#gather-indicator {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 229, 255, 0.12);
  border: 1px solid rgba(0, 229, 255, 0.3);
  color: #00e5ff;
  font-family: monospace;
  font-size: 11px;
  letter-spacing: 0.15em;
  padding: 6px 16px;
  border-radius: 3px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s;
  z-index: 99;
}

#gather-indicator.visible {
  opacity: 1;
}
`;

function injectStyles(): void {
  if (document.getElementById("inventory-ui-styles")) return;
  const style = document.createElement("style");
  style.id = "inventory-ui-styles";
  style.textContent = STYLES;
  document.head.appendChild(style);
}

// ── InventoryUI class ─────────────────────────────────────────

export class InventoryUI {
  private readonly panel:     HTMLElement;
  private readonly grid:      HTMLElement;
  private readonly indicator: HTMLElement;
  private isOpen = false;
  private indicatorTimer = 0;

  constructor() {
    injectStyles();

    // ── Panel ────────────────────────────────────────────────
    this.panel = document.createElement("div");
    this.panel.id = "inventory-ui";
    this.panel.setAttribute("aria-label", "Inventory");
    this.panel.innerHTML = `
      <div id="inventory-header">
        <h2>⬡ Inventory</h2>
        <span>[E] CLOSE</span>
      </div>
      <div id="inventory-grid"></div>
      <div id="inventory-footer">SPACE / CLICK — GATHER  ·  E — TOGGLE INVENTORY</div>
    `;
    document.body.appendChild(this.panel);

    this.grid = this.panel.querySelector("#inventory-grid")!;

    // ── Gather indicator ─────────────────────────────────────
    this.indicator = document.createElement("div");
    this.indicator.id = "gather-indicator";
    document.body.appendChild(this.indicator);

    // ── Event bindings ───────────────────────────────────────
    window.addEventListener("keydown", e => {
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        this.toggle();
      }
    });

    // Re-render whenever inventory changes
    bus.on("inventory:changed", () => {
      if (this.isOpen) this.render();
    });

    // Initial render
    this.render();
  }

  // ── Public ───────────────────────────────────────────────────

  toggle(): void {
    this.isOpen = !this.isOpen;
    this.panel.classList.toggle("open", this.isOpen);
    if (this.isOpen) this.render();
  }

  open(): void  { if (!this.isOpen) this.toggle(); }
  close(): void { if (this.isOpen)  this.toggle(); }

  /** Flash a gather notification at the bottom of the screen. */
  showGatherFeedback(itemName: string, qty: number): void {
    this.indicator.textContent = `+ ${qty}  ${itemName.toUpperCase()}`;
    this.indicator.classList.add("visible");
    clearTimeout(this.indicatorTimer);
    this.indicatorTimer = window.setTimeout(() => {
      this.indicator.classList.remove("visible");
    }, 900);
  }

  // ── Rendering ────────────────────────────────────────────────

  private render(): void {
    const slots = sm.state.player.inventory.slots;
    this.grid.innerHTML = "";

    for (let i = 0; i < slots.length; i++) {
      const stack = slots[i] ?? null;
      const el = document.createElement("div");
      el.className = "inv-slot" + (stack ? " filled" : "");

      if (stack) {
        const def = registry.findItem(stack.itemId);
        const color = def?.sprite.startsWith("#") ? def.sprite : "#556";
        const name  = def?.name ?? stack.itemId;

        el.innerHTML = `
          <div class="sprite" style="background:${color}"></div>
          <div class="item-name">${name}</div>
          <div class="item-qty">${stack.qty}</div>
        `;
        el.title = `${name} ×${stack.qty}`;
      } else {
        el.innerHTML = `<div class="empty-label">${i + 1}</div>`;
      }

      this.grid.appendChild(el);
    }
  }
}
