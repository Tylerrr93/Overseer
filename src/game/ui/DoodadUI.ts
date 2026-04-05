// ============================================================
//  src/game/ui/DoodadUI.ts
//
//  Opens when the player presses F near any interactable doodad
//  (other than storage chests, which use ChestUI).
// ============================================================

import { sm }           from "@engine/core/StateManager";
import { registry }     from "@engine/core/Registry";
import { bus }          from "@engine/core/EventBus";
import { panelManager } from "@engine/core/PanelManager";
import type { DoodadState } from "@t/state";
import type { RecipeDef }   from "@t/content";

const PANEL_NAME = "doodad";

// ── Styles ────────────────────────────────────────────────────

const STYLES = `
#doodad-ui {
  display: none;
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 101;
  background: rgba(8, 10, 14, 0.97);
  border: 1px solid #2a3a5a;
  border-radius: 4px;
  padding: 16px;
  width: 680px;
  max-width: 96vw;
  font-family: monospace;
  color: #c0d0e8;
  box-shadow: 0 0 48px rgba(60, 120, 255, 0.07);
  user-select: none;
}
#doodad-ui.open { display: block; }

#doodad-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #1e2a3a;
  cursor: grab;
}
#doodad-header:active { cursor: grabbing; }
#doodad-header h2 {
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #60a0ff;
  margin: 0;
  font-weight: normal;
}
#doodad-header span { font-size: 9px; color: #2a3a5a; letter-spacing: 0.1em; }

#doodad-body {
  display: grid;
  grid-template-columns: 1fr 180px;
  gap: 14px;
}

#doodad-machine { display: flex; flex-direction: column; gap: 10px; }

.slot-group { }
.slot-group-label {
  font-size: 8px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: #3a5a8a;
  margin-bottom: 5px;
}
.slot-row { display: flex; flex-wrap: wrap; gap: 3px; }

.dd-slot {
  width: 46px; height: 46px;
  border-radius: 2px;
  border: 1px solid #1a2a3a;
  background: rgba(255,255,255,0.02);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
  transition: border-color 0.1s, background 0.1s;
  box-sizing: border-box;
}
.dd-slot:hover { border-color: #4a7aaa; background: rgba(60,120,255,0.06); }
.dd-slot.filled { border-color: #2a4a7a; background: rgba(60,120,255,0.04); }
.dd-slot.output { border-color: #1a3a1a; }
.dd-slot.output.filled { border-color: #2a6a2a; background: rgba(0,200,80,0.04); }
.dd-slot.fuel { border-color: #3a2a1a; }
.dd-slot.fuel.filled { border-color: #6a4a1a; background: rgba(200,120,0,0.04); }
.dd-slot .dd-sprite {
  width: 22px; height: 22px;
  border-radius: 2px;
  margin-bottom: 1px;
  pointer-events: none;
}
.dd-slot .dd-qty {
  position: absolute;
  bottom: 2px; right: 3px;
  font-size: 8px; color: #6090c0;
  pointer-events: none;
}
.dd-slot .dd-name {
  font-size: 6px; color: #3a5a8a;
  text-align: center; max-width: 42px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  pointer-events: none;
}
.dd-slot .dd-empty { font-size: 8px; color: #1a2a3a; pointer-events: none; }
.dd-slot .dd-role-tag {
  position: absolute;
  top: 2px; left: 3px;
  font-size: 6px;
  pointer-events: none;
  opacity: 0.6;
}

#doodad-progress {
  background: rgba(255,255,255,0.03);
  border: 1px solid #1a2a3a;
  border-radius: 2px;
  padding: 8px;
}
#doodad-progress-label {
  font-size: 9px; color: #4a6a9a;
  margin-bottom: 5px; letter-spacing: 0.1em;
}
#doodad-progress-bar-bg {
  height: 6px;
  background: rgba(255,255,255,0.05);
  border-radius: 3px;
  overflow: hidden;
}
#doodad-progress-bar {
  height: 100%;
  background: #3a8a3a;
  border-radius: 3px;
  width: 0%;
  transition: width 0.1s linear;
}
#doodad-progress-idle {
  font-size: 8px; color: #2a3a4a;
  text-align: center; padding: 2px 0;
}

#doodad-recipes { }
.recipe-label {
  font-size: 8px; letter-spacing: 0.15em;
  text-transform: uppercase; color: #3a5a8a;
  margin-bottom: 5px;
}
.recipe-list { display: flex; flex-direction: column; gap: 2px; }
.recipe-btn {
  background: rgba(255,255,255,0.02);
  border: 1px solid #1a2a3a;
  color: #7090b0;
  font-family: monospace;
  font-size: 8px;
  letter-spacing: 0.08em;
  padding: 5px 7px;
  border-radius: 2px;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s, border-color 0.1s, color 0.1s;
}
.recipe-btn:hover { background: rgba(60,120,255,0.08); border-color: #3a6aaa; color: #a0c0e0; }
.recipe-btn.active {
  background: rgba(60,120,255,0.14);
  border-color: #60a0ff;
  color: #c0d8ff;
}
.recipe-btn.auto-active {
  border-color: #2a4a2a;
  background: rgba(0,200,80,0.06);
  color: #80c080;
}
.recipe-io {
  font-size: 6px; color: #3a5060; margin-top: 2px;
  pointer-events: none;
}

#doodad-player { }
#doodad-player h3 {
  font-size: 8px; letter-spacing: 0.15em;
  text-transform: uppercase; color: #3a5a8a;
  margin: 0 0 5px 0; font-weight: normal;
}
#doodad-player-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 3px;
}

#doodad-footer {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #1a2a3a;
  font-size: 9px; color: #1a2a3a;
  letter-spacing: 0.08em; text-align: center;
}
#doodad-hint {
  position: fixed;
  bottom: 92px; left: 50%;
  transform: translateX(-50%);
  background: rgba(8,10,20,0.9);
  border: 1px solid #2a3a5a;
  border-radius: 3px;
  padding: 5px 14px;
  font-family: monospace;
  font-size: 10px;
  letter-spacing: 0.12em;
  color: #60a0ff;
  pointer-events: none;
  display: none;
  z-index: 97;
}
#doodad-hint.visible { display: block; }
`;

function injectStyles(): void {
  if (document.getElementById("doodad-ui-styles")) return;
  const s = document.createElement("style");
  s.id = "doodad-ui-styles";
  s.textContent = STYLES;
  document.head.appendChild(s);
}

// ── DoodadUI ──────────────────────────────────────────────────

export class DoodadUI {
  private readonly panel:       HTMLElement;
  private readonly header:      HTMLElement;
  private readonly hint:        HTMLElement;
  private isOpen      = false;
  private openDoodad: DoodadState | null = null;
  private dragging    = false;
  private dragOffX    = 0;
  private dragOffY    = 0;
  private positioned  = false;
  private progressInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    injectStyles();

    this.panel = document.createElement("div");
    this.panel.id = "doodad-ui";
    this.panel.innerHTML = `
      <div id="doodad-header">
        <h2 id="doodad-title">◈ Machine</h2>
        <span>[ESC] CLOSE · DRAG TO MOVE</span>
      </div>
      <div id="doodad-body">
        <div id="doodad-machine">
          <div class="slot-group" id="dg-inputs"></div>
          <div class="slot-group" id="dg-fuel"></div>
          <div class="slot-group" id="dg-outputs"></div>
          <div id="doodad-progress">
            <div id="doodad-progress-label">CRAFTING</div>
            <div id="doodad-progress-bar-bg">
              <div id="doodad-progress-bar"></div>
            </div>
            <div id="doodad-progress-idle"></div>
          </div>
          <div id="doodad-recipes">
            <div class="recipe-label">Recipe</div>
            <div class="recipe-list" id="dg-recipe-list"></div>
          </div>
        </div>
        <div id="doodad-player">
          <h3>Inventory</h3>
          <div id="doodad-player-grid"></div>
        </div>
      </div>
      <div id="doodad-footer">
        INPUT/FUEL: click deposit 1 · shift+click deposit stack &nbsp;|&nbsp; OUTPUT: click take
      </div>
    `;
    document.body.appendChild(this.panel);
    this.header = this.panel.querySelector("#doodad-header")!;

    this.hint = document.createElement("div");
    this.hint.id = "doodad-hint";
    document.body.appendChild(this.hint);

    // ── Slot delegation ───────────────────────────────────────
    this.panel.querySelector("#dg-inputs")!
      .addEventListener("click", e => this.onMachineSlotClick(e as MouseEvent, "input"));
    this.panel.querySelector("#dg-fuel")!
      .addEventListener("click", e => this.onMachineSlotClick(e as MouseEvent, "fuel"));
    this.panel.querySelector("#dg-outputs")!
      .addEventListener("click", e => this.onOutputSlotClick(e as MouseEvent));
    this.panel.querySelector("#doodad-player-grid")!
      .addEventListener("click", e => this.onPlayerSlotClick(e as MouseEvent));

    // ── Mouse / key isolation ─────────────────────────────────
    // NOTE: mouseup is intentionally NOT stopped here.
    // Stopping mouseup at the panel level prevented the drag-release
    // handler on window from firing, causing the panel to stick to
    // the cursor until the mouse left the panel boundary.
    this.panel.addEventListener("mousedown", e => e.stopPropagation());
    this.panel.addEventListener("click",     e => e.stopPropagation());

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
      if (!def || def.machineTag === "storage") return;
      if (!def.interactable) return;
      const doodad = sm.getDoodad(doodadId);
      if (!doodad) return;
      if (this.isOpen && this.openDoodad?.id === doodadId) {
        this.close();
      } else {
        this.openDoodad2(doodad);
      }
    });

    bus.on("ui:close-panels", ({ except }) => {
      if (except !== PANEL_NAME) this.close();
    });

    this.bindDrag();
  }

  // ── Drag ─────────────────────────────────────────────────────

  private bindDrag(): void {
    this.header.addEventListener("mousedown", e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
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

  private openDoodad2(doodad: DoodadState): void {
    bus.emit("ui:close-panels", { except: PANEL_NAME });
    panelManager.open(PANEL_NAME);
    this.openDoodad = doodad;
    this.isOpen = true;
    this.panel.classList.add("open");
    this.renderAll();

    // Refresh both progress bar AND slot contents at 100ms so
    // crafting output, belt-fed inputs, and fuel consumption are
    // always visible while the panel is open.
    if (this.progressInterval) clearInterval(this.progressInterval);
    this.progressInterval = setInterval(() => {
      if (this.isOpen && this.openDoodad) {
        this.renderProgress();
        this.renderMachineSlots();
      }
    }, 100);
  }

  close(): void {
    panelManager.close(PANEL_NAME);
    this.isOpen = false;
    this.openDoodad = null;
    this.panel.classList.remove("open");
    if (this.progressInterval) { clearInterval(this.progressInterval); this.progressInterval = null; }
  }

  /** Called by GameLoop — updates hint only. */
  tick(nearbyId: string | null): void {
    if (this.isOpen) { this.hint.classList.remove("visible"); return; }
    if (!nearbyId) { this.hint.classList.remove("visible"); return; }

    const doodad = sm.getDoodad(nearbyId);
    const def    = doodad ? registry.findDoodad(doodad.defId) : null;
    if (!def || def.machineTag === "storage") { this.hint.classList.remove("visible"); return; }

    this.hint.textContent = `[F]  OPEN ${def.name.toUpperCase()}`;
    this.hint.classList.add("visible");
  }

  // ── Slot click handlers ───────────────────────────────────────

  private onMachineSlotClick(e: MouseEvent, _role: "input" | "fuel"): void {
    if (!this.openDoodad) return;
    const el = (e.target as HTMLElement).closest(".dd-slot") as HTMLElement | null;
    if (!el || !el.dataset["slotIdx"]) return;
    const idx = Number(el.dataset["slotIdx"]);
    if (e.shiftKey) this.takeStackFromMachine(idx);
    else            this.takeOneFromMachine(idx);
  }

  private onOutputSlotClick(e: MouseEvent): void {
    if (!this.openDoodad) return;
    const el = (e.target as HTMLElement).closest(".dd-slot") as HTMLElement | null;
    if (!el || !el.dataset["slotIdx"]) return;
    const idx = Number(el.dataset["slotIdx"]);
    if (e.shiftKey) this.takeStackFromMachine(idx);
    else            this.takeOneFromMachine(idx);
  }

  private onPlayerSlotClick(e: MouseEvent): void {
    if (!this.openDoodad) return;
    const el = (e.target as HTMLElement).closest(".dd-slot") as HTMLElement | null;
    if (!el || !el.dataset["pslotIdx"]) return;
    const idx = Number(el.dataset["pslotIdx"]);
    if (e.shiftKey) this.depositStackFromPlayer(idx);
    else            this.depositOneFromPlayer(idx);
  }

  // ── Transfers ────────────────────────────────────────────────

  private takeOneFromMachine(slotIdx: number): void {
    if (!this.openDoodad) return;
    const slot = this.openDoodad.inventory[slotIdx];
    if (!slot) return;
    const overflow = sm.givePlayerItem(slot.itemId, 1);
    if (overflow === 0) {
      slot.qty -= 1;
      if (slot.qty <= 0) this.openDoodad.inventory[slotIdx] = null;
      this.refresh();
    } else {
      bus.emit("ui:notification", { message: "Inventory full!", severity: "warn" });
    }
  }

  private takeStackFromMachine(slotIdx: number): void {
    if (!this.openDoodad) return;
    const slot = this.openDoodad.inventory[slotIdx];
    if (!slot) return;
    const overflow = sm.givePlayerItem(slot.itemId, slot.qty);
    const taken = slot.qty - overflow;
    slot.qty -= taken;
    if (slot.qty <= 0) this.openDoodad.inventory[slotIdx] = null;
    this.refresh();
  }

  private depositOneFromPlayer(playerSlotIdx: number): void {
    if (!this.openDoodad) return;
    const pSlot = sm.state.player.inventory.slots[playerSlotIdx];
    if (!pSlot) return;
    const deposited = this.depositToMachine(pSlot.itemId, 1);
    if (deposited > 0) {
      pSlot.qty -= deposited;
      if (pSlot.qty <= 0) sm.state.player.inventory.slots[playerSlotIdx] = null;
      this.refresh();
    } else {
      bus.emit("ui:notification", { message: "No matching slot!", severity: "warn" });
    }
  }

  private depositStackFromPlayer(playerSlotIdx: number): void {
    if (!this.openDoodad) return;
    const pSlot = sm.state.player.inventory.slots[playerSlotIdx];
    if (!pSlot) return;
    const deposited = this.depositToMachine(pSlot.itemId, pSlot.qty);
    pSlot.qty -= deposited;
    if (pSlot.qty <= 0) sm.state.player.inventory.slots[playerSlotIdx] = null;
    this.refresh();
  }

  private depositToMachine(itemId: string, qty: number): number {
    if (!this.openDoodad) return 0;
    const def = registry.findDoodad(this.openDoodad.defId);
    if (!def) return 0;
    const itemDef = registry.findItem(itemId);
    const tags    = itemDef?.tags ?? [];
    let deposited = 0;

    const targetRoles = new Set<string>(["input", "fuel"]);

    // Pass 1: stack onto existing
    for (let i = 0; i < def.slots.length && deposited < qty; i++) {
      const sd = def.slots[i];
      if (!sd || !targetRoles.has(sd.role)) continue;
      if (sd.filter && sd.filter.length > 0) {
        if (!sd.filter.some(f => f === itemId || tags.includes(f))) continue;
      }
      const s = this.openDoodad.inventory[i];
      if (s && s.itemId === itemId) {
        const add = Math.min(sd.capacity - s.qty, qty - deposited);
        if (add > 0) { s.qty += add; deposited += add; }
      }
    }
    // Pass 2: empty slots
    for (let i = 0; i < def.slots.length && deposited < qty; i++) {
      const sd = def.slots[i];
      if (!sd || !targetRoles.has(sd.role)) continue;
      if (sd.filter && sd.filter.length > 0) {
        if (!sd.filter.some(f => f === itemId || tags.includes(f))) continue;
      }
      if (!this.openDoodad.inventory[i]) {
        const add = Math.min(sd.capacity, qty - deposited);
        this.openDoodad.inventory[i] = { itemId, qty: add };
        deposited += add;
      }
    }
    return deposited;
  }

  // ── Rendering ────────────────────────────────────────────────

  private refresh(): void {
    bus.emit("inventory:changed", { entityId: "player" });
    this.renderMachineSlots();
    this.renderPlayerSlots();
    this.renderProgress();
  }

  private renderAll(): void {
    if (!this.openDoodad) return;
    const def = registry.findDoodad(this.openDoodad.defId);
    if (!def) return;

    (this.panel.querySelector("#doodad-title") as HTMLElement).textContent =
      `◈ ${def.name}`;

    this.renderMachineSlots();
    this.renderProgress();
    this.renderRecipes();
    this.renderPlayerSlots();
  }

  private renderMachineSlots(): void {
    if (!this.openDoodad) return;
    const def = registry.findDoodad(this.openDoodad.defId);
    if (!def) return;

    const inputEl  = this.panel.querySelector("#dg-inputs")!;
    const fuelEl   = this.panel.querySelector("#dg-fuel")!;
    const outputEl = this.panel.querySelector("#dg-outputs")!;

    const byRole: Record<string, number[]> = { input: [], fuel: [], output: [], internal: [] };
    def.slots.forEach((s, i) => byRole[s.role]?.push(i));

    this.renderSlotGroup(inputEl,  byRole["input"]  ?? [], "input",  "INPUT SLOTS");
    this.renderSlotGroup(fuelEl,   byRole["fuel"]   ?? [], "fuel",   "FUEL SLOTS");
    this.renderSlotGroup(outputEl, byRole["output"] ?? [], "output", "OUTPUT SLOTS");

    (fuelEl   as HTMLElement).style.display = (byRole["fuel"]?.length   ?? 0) > 0 ? "" : "none";
    (inputEl  as HTMLElement).style.display = (byRole["input"]?.length  ?? 0) > 0 ? "" : "none";
    (outputEl as HTMLElement).style.display = (byRole["output"]?.length ?? 0) > 0 ? "" : "none";
  }

  private renderSlotGroup(
    container: Element,
    indices: number[],
    role: string,
    label: string,
  ): void {
    if (!this.openDoodad) return;
    const def = registry.findDoodad(this.openDoodad.defId);
    if (!def) return;

    container.innerHTML = `<div class="slot-group-label">${label}</div><div class="slot-row" id="row-${role}"></div>`;
    const row = container.querySelector(`#row-${role}`)!;

    for (const i of indices) {
      const stack   = this.openDoodad.inventory[i] ?? null;
      const slotDef = def.slots[i];
      const el = document.createElement("div");
      el.className = `dd-slot ${role}` + (stack ? " filled" : "");
      el.dataset["slotIdx"] = String(i);

      if (stack) {
        const id    = registry.findItem(stack.itemId);
        const color = id?.sprite.startsWith("#") ? id.sprite : "#556";
        const name  = id?.name ?? stack.itemId;
        el.innerHTML = `
          <div class="dd-sprite" style="background:${color}"></div>
          <div class="dd-name">${name}</div>
          <div class="dd-qty">${stack.qty}</div>
        `;
        el.title = `${name} ×${stack.qty} | click: take 1 | shift+click: take all`;
      } else {
        const filterHint = slotDef?.filter?.join(", ") ?? "any";
        el.innerHTML = `<div class="dd-empty">—</div>`;
        el.title = `Empty ${role} slot (accepts: ${filterHint})`;
      }
      row.appendChild(el);
    }
  }

  private renderProgress(): void {
    if (!this.openDoodad) return;
    const def    = registry.findDoodad(this.openDoodad.defId);
    const bar    = this.panel.querySelector("#doodad-progress-bar") as HTMLElement;
    const label  = this.panel.querySelector("#doodad-progress-label") as HTMLElement;
    const idle   = this.panel.querySelector("#doodad-progress-idle") as HTMLElement;
    const wrap   = this.panel.querySelector("#doodad-progress") as HTMLElement;

    if (!def?.machineTag) { wrap.style.display = "none"; return; }
    wrap.style.display = "";

    const c = this.openDoodad.crafting;
    if (c) {
      const recipe = registry.findRecipe(c.recipeId);
      const pct    = recipe ? Math.min((c.elapsedMs / recipe.craftingTime) * 100, 100) : 0;
      bar.style.width  = `${pct}%`;
      label.textContent = `CRAFTING: ${recipe?.name ?? c.recipeId}`;
      idle.textContent  = "";
    } else {
      bar.style.width   = "0%";
      label.textContent = "CRAFTING";
      const pinned = this.openDoodad.pinnedRecipeId;
      idle.textContent  = pinned ? "WAITING FOR INPUTS…" : "IDLE";
    }
  }

  private renderRecipes(): void {
    if (!this.openDoodad) return;
    const def = registry.findDoodad(this.openDoodad.defId);
    const container = this.panel.querySelector("#doodad-recipes") as HTMLElement;
    const list      = this.panel.querySelector("#dg-recipe-list")!;

    if (!def?.machineTag) { container.style.display = "none"; return; }

    let recipes = registry.recipesForMachine(def.machineTag);
    if (def.allowedRecipeIds && def.allowedRecipeIds.length > 0) {
      const allowed = new Set(def.allowedRecipeIds);
      recipes = recipes.filter(r => allowed.has(r.id));
    }

    if (recipes.length === 0) { container.style.display = "none"; return; }
    container.style.display = "";

    list.innerHTML = "";

    const autoBtn = document.createElement("button");
    const isPinned = !!this.openDoodad.pinnedRecipeId;
    autoBtn.className = "recipe-btn" + (!isPinned ? " auto-active" : "");
    autoBtn.textContent = "◎  Auto-select";
    autoBtn.addEventListener("click", e => {
      e.stopPropagation();
      if (this.openDoodad) {
        this.openDoodad.pinnedRecipeId = null;
        this.renderRecipes();
        this.renderProgress();
      }
    });
    list.appendChild(autoBtn);

    for (const recipe of recipes) {
      const btn = this.buildRecipeButton(recipe);
      list.appendChild(btn);
    }
  }

  private buildRecipeButton(recipe: RecipeDef): HTMLElement {
    const btn = document.createElement("button");
    const isActive = this.openDoodad?.pinnedRecipeId === recipe.id;
    btn.className = "recipe-btn" + (isActive ? " active" : "");

    const inputStr  = recipe.inputs.map(i  => `${i.qty}×${i.itemId.replace(/_/g," ")}`).join(" + ");
    const outputStr = recipe.outputs.map(o => `${o.qty}×${o.itemId.replace(/_/g," ")}`).join(" + ");
    const timeStr   = (recipe.craftingTime / 1000).toFixed(1);

    btn.innerHTML = `
      <div>${recipe.name}</div>
      <div class="recipe-io">${inputStr} → ${outputStr}  (${timeStr}s)</div>
    `;
    btn.title = recipe.name;

    btn.addEventListener("click", e => {
      e.stopPropagation();
      if (!this.openDoodad) return;
      this.openDoodad.pinnedRecipeId = isActive ? null : recipe.id;
      this.renderRecipes();
      this.renderProgress();
    });
    return btn;
  }

  private renderPlayerSlots(): void {
    const grid  = this.panel.querySelector("#doodad-player-grid")!;
    const slots = sm.state.player.inventory.slots;
    grid.innerHTML = "";

    for (let i = 0; i < slots.length; i++) {
      const stack = slots[i] ?? null;
      const el    = document.createElement("div");
      el.className = "dd-slot" + (stack ? " filled" : "");
      el.dataset["pslotIdx"] = String(i);

      if (stack) {
        const id    = registry.findItem(stack.itemId);
        const color = id?.sprite.startsWith("#") ? id.sprite : "#556";
        const name  = id?.name ?? stack.itemId;
        el.innerHTML = `
          <div class="dd-sprite" style="background:${color}"></div>
          <div class="dd-name">${name}</div>
          <div class="dd-qty">${stack.qty}</div>
        `;
        el.title = `${name} ×${stack.qty} | click: deposit 1 | shift+click: deposit all`;
      } else {
        el.innerHTML = `<div class="dd-empty">${i + 1}</div>`;
      }
      grid.appendChild(el);
    }
  }
}
