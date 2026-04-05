// ============================================================
//  src/game/ui/ChestUI.ts
// ============================================================

import { sm }           from "@engine/core/StateManager";
import { registry }     from "@engine/core/Registry";
import { bus }          from "@engine/core/EventBus";
import { panelManager } from "@engine/core/PanelManager";
import type { DoodadState } from "@t/state";

const PANEL_NAME = "chest";

// ── Styles ────────────────────────────────────────────────────

const STYLES = `
#chest-ui {
  display: none;
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 101;
  background: rgba(10, 8, 6, 0.97);
  border: 1px solid #5a4a2a;
  border-radius: 4px;
  padding: 16px;
  width: 720px;
  max-width: 96vw;
  font-family: monospace;
  color: #d8c8a0;
  box-shadow: 0 0 48px rgba(200,150,60,0.08);
  user-select: none;
}
#chest-ui.open { display: block; }

#chest-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #3a2a0a;
  cursor: grab;
}
#chest-header:active { cursor: grabbing; }
#chest-header h2 {
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #c8a050;
  margin: 0;
  font-weight: normal;
}
#chest-header span { font-size: 9px; color: #4a3a1a; letter-spacing: 0.1em; }

#chest-body {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 12px;
  align-items: start;
}
.chest-section h3 {
  font-size: 9px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: #6a5a3a;
  margin: 0 0 8px 0;
  font-weight: normal;
}
.chest-grid, .player-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 3px;
}
.cs-slot {
  width: 44px;
  height: 44px;
  background: rgba(255,255,255,0.02);
  border: 1px solid #2a1e0a;
  border-radius: 2px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
  transition: border-color 0.1s, background 0.1s;
  box-sizing: border-box;
}
.cs-slot:hover { border-color: #8a6a2a; background: rgba(200,150,60,0.06); }
.cs-slot.filled { border-color: #4a3a1a; background: rgba(200,150,60,0.04); }
.cs-slot .cs-sprite {
  width: 20px; height: 20px;
  border-radius: 2px;
  margin-bottom: 1px;
  pointer-events: none;
}
.cs-slot .cs-qty {
  position: absolute;
  bottom: 2px; right: 3px;
  font-size: 8px; color: #a08050;
  pointer-events: none;
}
.cs-slot .cs-name {
  font-size: 6px; color: #6a5a3a;
  text-align: center;
  max-width: 40px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  pointer-events: none;
}
.cs-slot .cs-empty { font-size: 7px; color: #2a1e0a; pointer-events: none; }

#chest-transfer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  padding-top: 24px;
}
.xfer-btn {
  background: rgba(200,150,60,0.08);
  border: 1px solid #4a3a1a;
  color: #c8a050;
  font-family: monospace;
  font-size: 9px;
  letter-spacing: 0.1em;
  padding: 6px 10px;
  border-radius: 2px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.1s, border-color 0.1s;
}
.xfer-btn:hover { background: rgba(200,150,60,0.15); border-color: #8a6a2a; }

#chest-footer {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid #3a2a0a;
  font-size: 9px; color: #3a2a0a;
  letter-spacing: 0.1em; text-align: center;
}

#chest-hint {
  position: fixed;
  bottom: 92px; left: 50%;
  transform: translateX(-50%);
  background: rgba(16,12,4,0.88);
  border: 1px solid #4a3a1a;
  border-radius: 3px;
  padding: 5px 14px;
  font-family: monospace;
  font-size: 10px;
  letter-spacing: 0.12em;
  color: #c8a050;
  pointer-events: none;
  display: none;
  z-index: 97;
}
#chest-hint.visible { display: block; }
`;

function injectStyles(): void {
  if (document.getElementById("chest-ui-styles")) return;
  const s = document.createElement("style");
  s.id = "chest-ui-styles";
  s.textContent = STYLES;
  document.head.appendChild(s);
}

// ── ChestUI ───────────────────────────────────────────────────

export class ChestUI {
  private readonly panel:    HTMLElement;
  private readonly header:   HTMLElement;
  private readonly hint:     HTMLElement;
  private readonly chestGrid:  HTMLElement;
  private readonly playerGrid: HTMLElement;
  private isOpen      = false;
  private openDoodad: DoodadState | null = null;
  private dragging    = false;
  private dragOffX    = 0;
  private dragOffY    = 0;
  private positioned  = false;

  /** Periodic refresh while chest is open so belt-delivered items appear. */
  private _refreshInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    injectStyles();

    this.panel = document.createElement("div");
    this.panel.id = "chest-ui";
    this.panel.innerHTML = `
      <div id="chest-header">
        <h2>◫ Storage Chest</h2>
        <span>[ESC] CLOSE · DRAG HEADER TO MOVE</span>
      </div>
      <div id="chest-body">
        <div class="chest-section">
          <h3>Chest Contents</h3>
          <div class="chest-grid" id="chest-slots"></div>
        </div>
        <div id="chest-transfer">
          <button class="xfer-btn" id="btn-take-all">← Take All</button>
          <button class="xfer-btn" id="btn-deposit-all">Deposit All →</button>
        </div>
        <div class="chest-section">
          <h3>Player Inventory</h3>
          <div class="player-grid" id="chest-player-slots"></div>
        </div>
      </div>
      <div id="chest-footer">
        CLICK: move 1  ·  SHIFT+CLICK: move full stack
      </div>
    `;
    document.body.appendChild(this.panel);

    this.header     = this.panel.querySelector("#chest-header")!;
    this.chestGrid  = this.panel.querySelector("#chest-slots")!;
    this.playerGrid = this.panel.querySelector("#chest-player-slots")!;

    this.hint = document.createElement("div");
    this.hint.id = "chest-hint";
    document.body.appendChild(this.hint);

    // ── Bulk transfer buttons ─────────────────────────────────
    this.panel.querySelector("#btn-take-all")!
      .addEventListener("click", (e) => { e.stopPropagation(); this.takeAll(); });
    this.panel.querySelector("#btn-deposit-all")!
      .addEventListener("click", (e) => { e.stopPropagation(); this.depositAll(); });

    // ── Slot click delegation ─────────────────────────────────
    this.chestGrid.addEventListener("click", (e) => {
      if (!this.isOpen) return;
      const el = (e.target as HTMLElement).closest(".cs-slot") as HTMLElement | null;
      if (!el || !el.dataset["slotIdx"]) return;
      e.stopPropagation();
      const idx = Number(el.dataset["slotIdx"]);
      if (e.shiftKey) this.takeStackFromChest(idx);
      else            this.takeOneFromChest(idx);
    });

    this.playerGrid.addEventListener("click", (e) => {
      if (!this.isOpen) return;
      const el = (e.target as HTMLElement).closest(".cs-slot") as HTMLElement | null;
      if (!el || !el.dataset["pslotIdx"]) return;
      e.stopPropagation();
      const idx = Number(el.dataset["pslotIdx"]);
      if (e.shiftKey) this.depositStackFromPlayer(idx);
      else            this.depositOneFromPlayer(idx);
    });

    // ── Stop mouse events from hitting the game canvas ────────
    // NOTE: mouseup is intentionally NOT stopped here.
    // Stopping mouseup prevented the drag-release handler on
    // window from firing, causing the panel to stick to the cursor.
    this.panel.addEventListener("mousedown", e => e.stopPropagation());
    this.panel.addEventListener("click",     e => e.stopPropagation());

    // ── Key bindings ──────────────────────────────────────────
    window.addEventListener("keydown", e => {
      if (!this.isOpen) return;
      if (e.key === "Escape" || e.key === "f" || e.key === "F") {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.close();
      }
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);

    // ── EventBus ─────────────────────────────────────────────
    bus.on("doodad:interact", ({ doodadId, defId }) => {
      const def = registry.findDoodad(defId);
      if (def?.machineTag !== "storage") return;
      const doodad = sm.getDoodad(doodadId);
      if (!doodad) return;
      if (this.isOpen && this.openDoodad?.id === doodadId) {
        this.close();
      } else {
        this.openChest(doodad);
      }
    });

    this.bindDrag();
  }

  // ── Drag ─────────────────────────────────────────────────────

  private bindDrag(): void {
    this.header.addEventListener("mousedown", e => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      this.dragging = true;
      if (!this.positioned) {
        const r = this.panel.getBoundingClientRect();
        this.panel.style.transform = "none";
        this.panel.style.left = `${r.left}px`;
        this.panel.style.top  = `${r.top}px`;
        this.positioned = true;
      }
      const r = this.panel.getBoundingClientRect();
      this.dragOffX = e.clientX - r.left;
      this.dragOffY = e.clientY - r.top;
    });
    window.addEventListener("mousemove", e => {
      if (!this.dragging) return;
      const m = 8, pw = this.panel.offsetWidth, ph = this.panel.offsetHeight;
      this.panel.style.left = `${Math.max(m, Math.min(window.innerWidth  - pw - m, e.clientX - this.dragOffX))}px`;
      this.panel.style.top  = `${Math.max(m, Math.min(window.innerHeight - ph - m, e.clientY - this.dragOffY))}px`;
    });
    // mouseup on window always fires because we no longer stop it
    // at the panel level — this is what fixes the "stuck drag" bug.
    window.addEventListener("mouseup", () => { this.dragging = false; });
  }

  // ── Public ───────────────────────────────────────────────────

  openChest(doodad: DoodadState): void {
    bus.emit("ui:close-panels", { except: PANEL_NAME });
    panelManager.open(PANEL_NAME);
    this.openDoodad = doodad;
    this.isOpen = true;
    this.panel.classList.add("open");
    this.renderChestSlots();
    this.renderPlayerSlots();

    // Refresh slots periodically so belt deliveries and crafting
    // outputs appear without the player needing to close/reopen.
    this._clearRefresh();
    this._refreshInterval = setInterval(() => {
      if (this.isOpen) {
        this.renderChestSlots();
        this.renderPlayerSlots();
      }
    }, 500);
  }

  close(): void {
    panelManager.close(PANEL_NAME);
    this.isOpen = false;
    this.openDoodad = null;
    this.panel.classList.remove("open");
    this._clearRefresh();
  }

  private _clearRefresh(): void {
    if (this._refreshInterval !== null) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
    }
  }

  /** Called by GameLoop each frame — updates hint only. */
  tick(nearbyDoodadId: string | null): void {
    if (this.isOpen) {
      this.hint.classList.remove("visible");
      return;
    }
    if (nearbyDoodadId) {
      const doodad = sm.getDoodad(nearbyDoodadId);
      const def    = doodad ? registry.findDoodad(doodad.defId) : null;
      if (!def || def.machineTag !== "storage") { this.hint.classList.remove("visible"); return; }
      this.hint.textContent = `[F]  OPEN ${def.name.toUpperCase()}`;
      this.hint.classList.add("visible");
    } else {
      this.hint.classList.remove("visible");
    }
  }

  // ── Transfers ────────────────────────────────────────────────

  private takeAll(): void {
    if (!this.openDoodad) return;
    const inv = this.openDoodad.inventory;
    for (let i = 0; i < inv.length; i++) {
      const slot = inv[i];
      if (!slot) continue;
      const overflow = sm.givePlayerItem(slot.itemId, slot.qty);
      const taken = slot.qty - overflow;
      slot.qty -= taken;
      if (slot.qty <= 0) inv[i] = null;
    }
    this.refreshBoth();
  }

  private depositAll(): void {
    if (!this.openDoodad) return;
    const pSlots = sm.state.player.inventory.slots;
    for (let i = 0; i < pSlots.length; i++) {
      const ps = pSlots[i];
      if (!ps) continue;
      const deposited = this.depositItemToChest(ps.itemId, ps.qty);
      ps.qty -= deposited;
      if (ps.qty <= 0) pSlots[i] = null;
    }
    this.refreshBoth();
  }

  private takeOneFromChest(idx: number): void {
    if (!this.openDoodad) return;
    const slot = this.openDoodad.inventory[idx];
    if (!slot) return;
    const overflow = sm.givePlayerItem(slot.itemId, 1);
    if (overflow === 0) {
      slot.qty -= 1;
      if (slot.qty <= 0) this.openDoodad.inventory[idx] = null;
      this.refreshBoth();
    } else {
      bus.emit("ui:notification", { message: "Inventory full!", severity: "warn" });
    }
  }

  private takeStackFromChest(idx: number): void {
    if (!this.openDoodad) return;
    const slot = this.openDoodad.inventory[idx];
    if (!slot) return;
    const overflow = sm.givePlayerItem(slot.itemId, slot.qty);
    const taken = slot.qty - overflow;
    slot.qty -= taken;
    if (slot.qty <= 0) this.openDoodad.inventory[idx] = null;
    this.refreshBoth();
    if (overflow > 0) bus.emit("ui:notification", { message: "Inventory full — partial transfer.", severity: "warn" });
  }

  private depositOneFromPlayer(idx: number): void {
    if (!this.openDoodad) return;
    const ps = sm.state.player.inventory.slots[idx];
    if (!ps) return;
    const deposited = this.depositItemToChest(ps.itemId, 1);
    if (deposited > 0) {
      ps.qty -= 1;
      if (ps.qty <= 0) sm.state.player.inventory.slots[idx] = null;
      this.refreshBoth();
    } else {
      bus.emit("ui:notification", { message: "Chest is full!", severity: "warn" });
    }
  }

  private depositStackFromPlayer(idx: number): void {
    if (!this.openDoodad) return;
    const ps = sm.state.player.inventory.slots[idx];
    if (!ps) return;
    const deposited = this.depositItemToChest(ps.itemId, ps.qty);
    ps.qty -= deposited;
    if (ps.qty <= 0) sm.state.player.inventory.slots[idx] = null;
    this.refreshBoth();
    if (deposited === 0) bus.emit("ui:notification", { message: "Chest is full!", severity: "warn" });
  }

  private depositItemToChest(itemId: string, qty: number): number {
    if (!this.openDoodad) return 0;
    const def = registry.findDoodad(this.openDoodad.defId);
    if (!def) return 0;
    let deposited = 0;
    const slots = this.openDoodad.inventory;
    // Pass 1: stack onto existing
    for (let i = 0; i < def.slots.length && deposited < qty; i++) {
      const sd = def.slots[i];
      if (!sd || sd.role === "output") continue;
      const s = slots[i];
      if (s && s.itemId === itemId) {
        const add = Math.min(sd.capacity - s.qty, qty - deposited);
        s.qty += add; deposited += add;
      }
    }
    // Pass 2: empty slot
    for (let i = 0; i < def.slots.length && deposited < qty; i++) {
      const sd = def.slots[i];
      if (!sd || sd.role === "output") continue;
      if (!slots[i]) {
        const add = Math.min(sd.capacity, qty - deposited);
        slots[i] = { itemId, qty: add }; deposited += add;
      }
    }
    return deposited;
  }

  // ── Rendering ────────────────────────────────────────────────

  private refreshBoth(): void {
    bus.emit("inventory:changed", { entityId: "player" });
    this.renderChestSlots();
    this.renderPlayerSlots();
  }

  private renderChestSlots(): void {
    if (!this.openDoodad) return;
    const def = registry.findDoodad(this.openDoodad.defId);
    if (!def) return;
    this.chestGrid.innerHTML = "";
    for (let i = 0; i < def.slots.length; i++) {
      const stack = this.openDoodad.inventory[i] ?? null;
      const el = document.createElement("div");
      el.className = "cs-slot" + (stack ? " filled" : "");
      el.dataset["slotIdx"] = String(i);
      if (stack) {
        const id = registry.findItem(stack.itemId);
        const color = id?.sprite.startsWith("#") ? id.sprite : "#556";
        const name  = id?.name ?? stack.itemId;
        el.innerHTML = `<div class="cs-sprite" style="background:${color}"></div><div class="cs-name">${name}</div><div class="cs-qty">${stack.qty}</div>`;
        el.title = `${name} ×${stack.qty} | click: take 1 | shift+click: take all`;
      } else {
        el.innerHTML = `<div class="cs-empty">${i + 1}</div>`;
      }
      this.chestGrid.appendChild(el);
    }
  }

  private renderPlayerSlots(): void {
    const slots = sm.state.player.inventory.slots;
    this.playerGrid.innerHTML = "";
    for (let i = 0; i < slots.length; i++) {
      const stack = slots[i] ?? null;
      const el = document.createElement("div");
      el.className = "cs-slot" + (stack ? " filled" : "");
      el.dataset["pslotIdx"] = String(i);
      if (stack) {
        const id = registry.findItem(stack.itemId);
        const color = id?.sprite.startsWith("#") ? id.sprite : "#556";
        const name  = id?.name ?? stack.itemId;
        el.innerHTML = `<div class="cs-sprite" style="background:${color}"></div><div class="cs-name">${name}</div><div class="cs-qty">${stack.qty}</div>`;
        el.title = `${name} ×${stack.qty} | click: deposit 1 | shift+click: deposit all`;
      } else {
        el.innerHTML = `<div class="cs-empty">${i + 1}</div>`;
      }
      this.playerGrid.appendChild(el);
    }
  }
}
