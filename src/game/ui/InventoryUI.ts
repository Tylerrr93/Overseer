// ============================================================
//  src/game/ui/InventoryUI.ts
//  Player inventory overlay.  Toggle with "E".
//
//  Extends UIPanel — no drag logic, no open/close boilerplate.
//  All hardcoded pixel sizes replaced with CSS variables.
//
//  Also implements GatherFeedbackReceiver so PlayerSystem can
//  trigger floating toast notifications without importing this
//  class directly.
// ============================================================

import { UIPanel }      from "./UIPanel";
import { sm }           from "@engine/core/StateManager";
import { registry }     from "@engine/core/Registry";
import { bus }          from "@engine/core/EventBus";

// ── Styles ────────────────────────────────────────────────────
//  Only the visual chrome unique to this panel.
//  Structural layout (position, overflow, resize, z-index) is
//  handled by UIPanel and .ui-panel in UIStyleManager.

const STYLES = `
#inventory-ui {
  background: var(--col-bg);
  box-shadow: var(--panel-shadow-cyan);
  /* --panel-border-color and --panel-accent-color inherit the
     :root defaults (#1e3a4a / #00e5ff) — teal theme is correct. */
}

#inventory-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: var(--gap-sm);
}

.inv-slot {
  width: var(--slot-size);
  height: var(--slot-size);
  background: var(--col-slot-bg);
  border: 1px solid var(--col-slot-border);
  border-radius: calc(3px * var(--ui-scale));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: default;
  transition: border-color 0.1s;
  box-sizing: border-box;
}

.inv-slot:hover       { border-color: var(--col-slot-hover-border); }
.inv-slot.dragging    {
  opacity: 0.45;
  border-color: #00e5ff;
  cursor: grabbing;
}
.inv-slot.filled      {
  border-color: #1e4a5a;
  background: var(--col-slot-filled-bg);
}

.inv-slot .sprite {
  width: var(--sprite-size-lg);
  height: var(--sprite-size-lg);
  border-radius: calc(2px * var(--ui-scale));
  margin-bottom: var(--gap-xs);
  flex-shrink: 0;
  pointer-events: none;
}

.inv-slot .item-qty {
  position: absolute;
  bottom: calc(3px * var(--ui-scale));
  right: calc(5px * var(--ui-scale));
  font-size: var(--font-sm);
  color: #a0c8d0;
  line-height: 1;
  pointer-events: none;
}

.inv-slot .item-name {
  font-size: var(--font-xs);
  color: #4a8a9a;
  text-align: center;
  line-height: 1.2;
  max-width: calc(48px * var(--ui-scale));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 var(--gap-xs);
  pointer-events: none;
}

.inv-slot .empty-label {
  font-size: var(--font-xs);
  color: var(--col-text-mute);
  pointer-events: none;
}

/* ── Floating gather toasts ─────────────────────────────────── */
#gather-toast-container {
  position: fixed;
  bottom: calc(124px * var(--ui-scale));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column-reverse; /* newest at bottom, older rise */
  align-items: center;
  gap: var(--gap-sm);
  pointer-events: none;
  z-index: 99;
}

.gather-toast {
  background: rgba(0, 229, 255, 0.12);
  border: 1px solid rgba(0, 229, 255, 0.28);
  color: var(--col-accent);
  font-family: monospace;
  font-size: var(--font-md);
  letter-spacing: 0.15em;
  padding: calc(5px * var(--ui-scale)) calc(14px * var(--ui-scale));
  border-radius: calc(3px * var(--ui-scale));
  white-space: nowrap;
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
  const s = document.createElement("style");
  s.id = "inventory-ui-styles";
  s.textContent = STYLES;
  document.head.appendChild(s);
}

// ── InventoryUI ───────────────────────────────────────────────

export class InventoryUI extends UIPanel {
  private readonly grid:           HTMLElement;
  private readonly toastContainer: HTMLElement;

  constructor() {
    super({
      id:        "inventory-ui",
      name:      "inventory",
      minWidth:  360,
      resizable: true,
    });

    injectStyles();

    // ── Inner HTML ─────────────────────────────────────────────
    this.el.innerHTML = `
      <div class="ui-panel-header" id="inv-header">
        <h2>⬡ Inventory</h2>
        <span class="hint">[E] CLOSE · DRAG TO MOVE</span>
      </div>
      <div id="inventory-grid"></div>
      <div class="ui-panel-footer">
        SPACE / CLICK — GATHER  ·  E — TOGGLE INVENTORY
      </div>
    `;

    this.grid = this.el.querySelector("#inventory-grid")!;

    // Block game-canvas events while hovering the panel
    this.el.addEventListener("mousedown", e => e.stopPropagation());
    this.el.addEventListener("click",     e => e.stopPropagation());

    // Wire header as drag handle (UIPanel does the rest)
    this.bindDragHandle(this.el.querySelector("#inv-header")!);

    // ── Toast container (separate screen-fixed element) ────────
    this.toastContainer = document.createElement("div");
    this.toastContainer.id = "gather-toast-container";
    document.body.appendChild(this.toastContainer);

    // ── Key bindings ───────────────────────────────────────────
    //  ChestUI / DoodadUI absorb "e" / "E" in capture phase when
    //  they are open, so this listener only fires when those
    //  panels are closed.  No additional guard needed.
    window.addEventListener("keydown", e => {
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        this.toggle();
      }
    });

    // ── EventBus ──────────────────────────────────────────────
    bus.on("inventory:changed", () => {
      if (this.isOpen) this.render();
    });

    // Close when another panel asks all panels to close
    bus.on("ui:close-panels", ({ except }) => {
      if (except !== "inventory") this.close();
    });

    // Populate grid while still hidden so first open is instant
    this.render();
  }

  // ── UIPanel hooks ──────────────────────────────────────────────

  /** Re-render in case inventory changed while panel was closed. */
  protected override onOpen(): void {
    this.render();
  }

  // ── Public API ─────────────────────────────────────────────────

  /** Convenience for external callers (e.g. main.ts debug export). */
  override isCurrentlyOpen(): boolean { return this.isOpen; }

  /**
   * Spawn a floating toast that rises and fades out.
   * Each call creates a fresh element, so rapid gathers stack.
   * Implements GatherFeedbackReceiver (PlayerSystem interface).
   */
  showGatherFeedback(itemName: string, qty: number): void {
    const toast = document.createElement("div");
    toast.className = "gather-toast";
    toast.textContent = `+ ${qty}  ${itemName.toUpperCase()}`;
    this.toastContainer.appendChild(toast);

    // Double-rAF ensures CSS transition fires after element is in DOM
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add("in"));
    });

    setTimeout(() => {
      toast.classList.remove("in");
      toast.classList.add("out");
      toast.addEventListener("transitionend", () => toast.remove(), { once: true });
      // Safety removal if transitionend never fires (hidden tab, etc.)
      setTimeout(() => toast.remove(), 600);
    }, 700);
  }

  // ── Rendering ─────────────────────────────────────────────────

  private render(): void {
    const slots = sm.state.player.inventory.slots;
    this.grid.innerHTML = "";

    for (let i = 0; i < slots.length; i++) {
      const stack = slots[i] ?? null;
      const el = document.createElement("div");
      el.className = "inv-slot" + (stack ? " filled" : "");

      if (stack) {
        const def  = registry.findItem(stack.itemId);
        const name = def?.name ?? stack.itemId;

        // Prefer the doodad's texture for placeable items so the
        // inventory shows the same graphic as the action bar does.
        const doodadDef  = def?.placesDoodadId
          ? registry.findDoodad(def.placesDoodadId)
          : undefined;
        const texture    = doodadDef?.texture ?? doodadDef?.animations?.idle?.[0];
        const color      = def?.sprite.startsWith("#") ? def.sprite : "#556";
        const spriteHtml = texture
          ? `<img class="sprite" src="${texture}" draggable="false"
                  style="object-fit:contain;background:transparent;" />`
          : `<div class="sprite" style="background:${color}"></div>`;

        el.innerHTML = `
          ${spriteHtml}
          <div class="item-name">${name}</div>
          <div class="item-qty">${stack.qty}</div>
        `;
        el.title = `${name} ×${stack.qty}`;

        // ── Drag source ──────────────────────────────────────
        //  All filled slots are draggable.  Dropping on an
        //  ActionBar slot assigns that item (placeable items
        //  will enter item-based placement; others are no-ops).
        el.draggable = true;
        el.style.cursor = "grab";
        el.addEventListener("dragstart", e => {
          e.dataTransfer!.setData("text/plain", stack.itemId);
          e.dataTransfer!.effectAllowed = "link";
          // Small delay so the browser ghost image captures the
          // slot before we could mutate it.
          requestAnimationFrame(() => el.classList.add("dragging"));
        });
        el.addEventListener("dragend", () => {
          el.classList.remove("dragging");
        });
      } else {
        el.innerHTML = `<div class="empty-label">${i + 1}</div>`;
      }

      this.grid.appendChild(el);
    }
  }
}
