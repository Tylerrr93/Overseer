// ============================================================
//  src/game/ui/InventoryUI.ts
//  HTML/CSS overlay inventory panel.
//  - Draggable via the header bar
//  - Floating toast notifications that rise and fade
// ============================================================

import { sm }       from "@engine/core/StateManager";
import { registry } from "@engine/core/Registry";
import { bus }         from "@engine/core/EventBus";
import { panelManager } from "@engine/core/PanelManager";

// ── Styles ────────────────────────────────────────────────────

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
  /* No transform once dragged — position set via left/top directly */
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
  cursor: grab;
}

#inventory-header:active {
  cursor: grabbing;
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

/* ── Floating gather toasts ── */
#gather-toast-container {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column-reverse; /* newest at bottom, older drift up */
  align-items: center;
  gap: 4px;
  pointer-events: none;
  z-index: 99;
}

.gather-toast {
  background: rgba(0, 229, 255, 0.12);
  border: 1px solid rgba(0, 229, 255, 0.28);
  color: #00e5ff;
  font-family: monospace;
  font-size: 11px;
  letter-spacing: 0.15em;
  padding: 5px 14px;
  border-radius: 3px;
  white-space: nowrap;

  /* Start just below, invisible */
  opacity: 0;
  transform: translateY(12px);
  transition:
    opacity   0.12s ease-out,
    transform 0.18s ease-out;
}

.gather-toast.in {
  opacity: 1;
  transform: translateY(0);
}

.gather-toast.out {
  opacity: 0;
  transform: translateY(-18px);
  transition:
    opacity   0.35s ease-in,
    transform 0.45s ease-in;
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
  private readonly panel:          HTMLElement;
  private readonly header:         HTMLElement;
  private readonly grid:           HTMLElement;
  private readonly toastContainer: HTMLElement;
  private isOpen   = false;
  private dragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private positioned  = false; // true once user has dragged (bypass centering transform)

  constructor() {
    injectStyles();

    // ── Panel ────────────────────────────────────────────────
    this.panel = document.createElement("div");
    this.panel.id = "inventory-ui";
    this.panel.setAttribute("aria-label", "Inventory");
    this.panel.innerHTML = `
      <div id="inventory-header">
        <h2>⬡ Inventory</h2>
        <span>[E] CLOSE · DRAG TO MOVE</span>
      </div>
      <div id="inventory-grid"></div>
      <div id="inventory-footer">SPACE / CLICK — GATHER  ·  E — TOGGLE INVENTORY</div>
    `;
    document.body.appendChild(this.panel);

    // Prevent clicks from reaching game canvas while panel is open
    this.panel.addEventListener("mousedown", e => e.stopPropagation());
    this.panel.addEventListener("click",     e => e.stopPropagation());

    this.header = this.panel.querySelector("#inventory-header")!;
    this.grid   = this.panel.querySelector("#inventory-grid")!;

    // ── Toast container ──────────────────────────────────────
    this.toastContainer = document.createElement("div");
    this.toastContainer.id = "gather-toast-container";
    document.body.appendChild(this.toastContainer);

    // ── Bindings ─────────────────────────────────────────────
    this.bindDrag();

    window.addEventListener("keydown", e => {
      if (e.key === "e" || e.key === "E") {
        // Block entirely if any other panel is open (chest etc.)
        if (panelManager.isAnyPanelOpen() && panelManager.getActive() !== "inventory") return;
        e.preventDefault();
        this.toggle();
      }
    });

    bus.on("inventory:changed", () => {
      if (this.isOpen) this.render();
    });

    // Close when another panel requests it (e.g. chest opening)
    bus.on("ui:close-panels", ({ except }) => {
      if (except !== "inventory") this.close();
    });

    this.render();
  }

  // ── Drag ─────────────────────────────────────────────────────

  private bindDrag(): void {
    this.header.addEventListener("mousedown", e => {
      // Don't drag on right-click
      if (e.button !== 0) return;
      e.preventDefault();

      this.dragging = true;

      // If panel is still using the CSS centering transform, resolve it to
      // concrete pixel coords first so the drag origin is correct.
      if (!this.positioned) {
        const rect = this.panel.getBoundingClientRect();
        this.panel.style.transform = "none";
        this.panel.style.left = `${rect.left}px`;
        this.panel.style.top  = `${rect.top}px`;
        this.positioned = true;
      }

      const rect = this.panel.getBoundingClientRect();
      this.dragOffsetX = e.clientX - rect.left;
      this.dragOffsetY = e.clientY - rect.top;
    });

    window.addEventListener("mousemove", e => {
      if (!this.dragging) return;

      let newLeft = e.clientX - this.dragOffsetX;
      let newTop  = e.clientY - this.dragOffsetY;

      // Clamp inside viewport with a small margin
      const margin = 8;
      const pw = this.panel.offsetWidth;
      const ph = this.panel.offsetHeight;
      newLeft = Math.max(margin, Math.min(window.innerWidth  - pw - margin, newLeft));
      newTop  = Math.max(margin, Math.min(window.innerHeight - ph - margin, newTop));

      this.panel.style.left = `${newLeft}px`;
      this.panel.style.top  = `${newTop}px`;
    });

    window.addEventListener("mouseup", () => {
      this.dragging = false;
    });
  }

  // ── Public ───────────────────────────────────────────────────

  toggle(): void {
    this.isOpen = !this.isOpen;
    this.panel.classList.toggle("open", this.isOpen);
    if (this.isOpen) {
      panelManager.open("inventory");
      this.render();
    } else {
      panelManager.close("inventory");
    }
  }

  open():  void { if (!this.isOpen) this.toggle(); }
  close(): void { if (this.isOpen)  this.toggle(); }

  isCurrentlyOpen(): boolean { return this.isOpen; }

  /**
   * Spawn a floating toast that rises and fades out.
   * Each call creates a fresh element so rapid gathers
   * stack visually and don't clobber each other.
   */
  showGatherFeedback(itemName: string, qty: number): void {
    const toast = document.createElement("div");
    toast.className = "gather-toast";
    toast.textContent = `+ ${qty}  ${itemName.toUpperCase()}`;
    this.toastContainer.appendChild(toast);

    // Trigger enter animation on next frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add("in"));
    });

    // After 700 ms start exit animation
    setTimeout(() => {
      toast.classList.remove("in");
      toast.classList.add("out");

      // Remove from DOM once transition ends
      toast.addEventListener("transitionend", () => toast.remove(), { once: true });
      // Safety removal in case transitionend never fires (hidden tab, etc.)
      setTimeout(() => toast.remove(), 600);
    }, 700);
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
        const def   = registry.findItem(stack.itemId);
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
