// ============================================================
//  src/engine/core/StateManager.ts
// ============================================================

import { CursorMode }   from "@t/state";
import type { GameState, PlayerState, DoodadState, Chunk, ItemStack } from "@t/state";
import { GameConfig }   from "./GameConfig";
import { bus }          from "./EventBus";

function makeEmptyInventory(slots: number): (ItemStack | null)[] {
  return Array.from({ length: slots }, () => null);
}

function defaultState(): GameState {
  return {
    version:   GameConfig.SAVE_VERSION,
    tickCount: 0,
    worldSeed: Math.floor(Math.random() * 0xffffffff),
    player: {
      pos:               { x: 0, y: 0 },
      cursorWorldPos:    { x: 0, y: 0 },
      speed:             GameConfig.PLAYER_SPEED_PX_S,
      inventory:         { slots: makeEmptyInventory(GameConfig.PLAYER_INV_SLOTS) },
      heldItemId:        null,
      placementRotation: 0,
      health:            100,
      maxHealth:         100,
      cursorMode:        CursorMode.None,
      harvestProgress:   null,
    },
    chunks:  {},
    doodads: {},
    belts:   {},
  };
}

export class StateManager {
  state: GameState;

  constructor() {
    this.state = defaultState();
  }

  // ── Persistence ───────────────────────────────────────────

  save(): void {
    try {
      const json = JSON.stringify(this.state);
      localStorage.setItem(GameConfig.SAVE_KEY,    json);
      localStorage.setItem(GameConfig.SAVE_TS_KEY, String(Date.now()));
      console.info("[StateManager] Game saved.");
    } catch (e) {
      console.error("[StateManager] Save failed:", e);
      bus.emit("ui:notification", { message: "Save failed!", severity: "error" });
    }
  }

  load(): boolean {
    try {
      const raw = localStorage.getItem(GameConfig.SAVE_KEY);
      if (!raw) return false;
      return this._applyRaw(raw);
    } catch (e) {
      console.error("[StateManager] Load failed:", e);
      return false;
    }
  }

  /**
   * Returns the current game state serialized to a JSON string.
   * Does NOT write to localStorage — use save() for persistence.
   */
  exportJSON(): string {
    return JSON.stringify(this.state, null, 2);
  }

  /**
   * Parses a raw JSON string, runs migrations, and replaces the
   * running state.  Also writes to localStorage so a page reload
   * picks it up.  Returns true on success.
   */
  importJSON(raw: string): boolean {
    try {
      const ok = this._applyRaw(raw);
      if (ok) {
        localStorage.setItem(GameConfig.SAVE_KEY,    raw);
        localStorage.setItem(GameConfig.SAVE_TS_KEY, String(Date.now()));
        console.info("[StateManager] Save imported.");
      }
      return ok;
    } catch (e) {
      console.error("[StateManager] Import failed:", e);
      return false;
    }
  }

  /**
   * Removes the save from localStorage and resets to a fresh state.
   * The caller is responsible for triggering a page reload so that
   * all in-memory system state is also cleared.
   */
  wipe(): void {
    localStorage.removeItem(GameConfig.SAVE_KEY);
    localStorage.removeItem(GameConfig.SAVE_TS_KEY);
    this.state = defaultState();
    console.info("[StateManager] Save wiped.");
  }

  reset(): void {
    this.state = defaultState();
  }

  // ── Chunk helpers ──────────────────────────────────────────

  chunkKey(cx: number, cy: number): string { return `${cx},${cy}`; }

  setChunk(chunk: Chunk): void {
    this.state.chunks[this.chunkKey(chunk.cx, chunk.cy)] = chunk;
  }

  getChunk(cx: number, cy: number): Chunk | undefined {
    return this.state.chunks[this.chunkKey(cx, cy)];
  }

  // ── Doodad helpers ─────────────────────────────────────────

  addDoodad(doodad: DoodadState): void {
    doodad.powered  = false;
    doodad.fuelBurn = doodad.fuelBurn ?? null;
    this.state.doodads[doodad.id] = doodad;
    bus.emit("doodad:placed", { doodadId: doodad.id });
  }

  removeDoodad(id: string): void {
    delete this.state.doodads[id];
    bus.emit("doodad:removed", { doodadId: id });
  }

  getDoodad(id: string): DoodadState | undefined {
    return this.state.doodads[id];
  }

  allDoodads(): DoodadState[] {
    return Object.values(this.state.doodads);
  }

  // ── Belt helpers ───────────────────────────────────────────

  getBeltAt(tx: number, ty: number): import("@t/state").BeltSegment | undefined {
    return Object.values(this.state.belts).find(
      b => b.origin.tx === tx && b.origin.ty === ty,
    );
  }

  addBelt(belt: import("@t/state").BeltSegment): void {
    this.state.belts[belt.id] = belt;
  }

  /** Safe to call on non-belt doodads — delete of missing key is a no-op. */
  removeBelt(id: string): void {
    delete this.state.belts[id];
  }

  // ── Player helpers ─────────────────────────────────────────

  movePlayer(x: number, y: number): void {
    this.state.player.pos.x = x;
    this.state.player.pos.y = y;
    bus.emit("player:moved", { x, y });
  }

  updateCursorWorld(x: number, y: number): void {
    if (!this.state.player.cursorWorldPos) {
      this.state.player.cursorWorldPos = { x, y };
    } else {
      this.state.player.cursorWorldPos.x = x;
      this.state.player.cursorWorldPos.y = y;
    }
  }

  givePlayerItem(itemId: string, qty: number): number {
    const overflow = this._insertIntoInventory(
      this.state.player.inventory.slots, itemId, qty,
    );
    if (overflow < qty) {
      bus.emit("inventory:changed", { entityId: "player" });
    }
    return overflow;
  }

  // ── Resource consumption ──────────────────────────────────

  /**
  * Returns true if the player's inventory contains all items
  * in `cost` at the required quantities. Pure read — no mutation.
  */
  canAffordCost(cost: { itemId: string; qty: number }[]): boolean {
    for (const req of cost) {
      let have = 0;
      for (const slot of this.state.player.inventory.slots) {
        if (slot?.itemId === req.itemId) have += slot.qty;
      }
      if (have < req.qty) return false;
    }
    return true;
  }

  /**
  * Deducts `cost` from the player's inventory.
  * Assumes canAffordCost() already returned true — call that
  * first. Returns true on success, false if inventory was
  * somehow insufficient (should never happen if you check first).
  */
  tryConsumePlayerItems(cost: { itemId: string; qty: number }[]): boolean {
    if (!this.canAffordCost(cost)) return false;

    for (const req of cost) {
      let toDeduct = req.qty;
      const slots  = this.state.player.inventory.slots;
      for (let i = 0; i < slots.length && toDeduct > 0; i++) {
        const slot = slots[i];
        if (!slot || slot.itemId !== req.itemId) continue;
        const take  = Math.min(slot.qty, toDeduct);
        slot.qty   -= take;
        toDeduct   -= take;
        if (slot.qty === 0) slots[i] = null;
      }
    }

    bus.emit("inventory:changed", { entityId: "player" });
    return true;
  }

  // ── Private helpers ────────────────────────────────────────

  /**
   * Core deserialization path shared by load() and importJSON().
   * Parses, version-checks, migrates, and applies the state.
   */
  private _applyRaw(raw: string): boolean {
    const parsed = JSON.parse(raw) as GameState;
    if (parsed.version !== GameConfig.SAVE_VERSION) {
      console.warn(
        `[StateManager] Save version mismatch (got ${parsed.version}, ` +
        `expected ${GameConfig.SAVE_VERSION}) — ignoring.`,
      );
      return false;
    }
    this.state = parsed;

    // ── Field migrations ──────────────────────────────────────
    const p = this.state.player;
    if (!p.cursorWorldPos)                p.cursorWorldPos    = { x: 0, y: 0 };
    if (p.placementRotation === undefined) p.placementRotation = 0;
    if (!this.state.belts)                (this.state as GameState).belts = {};

    // Always reset transient input state on load
    p.cursorMode       = CursorMode.None;
    p.heldItemId       = null;
    p.harvestProgress  = null;
    if (p.harvestProgress === undefined) p.harvestProgress = null;

    // Migrate doodad instances
    for (const d of Object.values(this.state.doodads)) {
      if (d.pinnedRecipeId === undefined) d.pinnedRecipeId = null;
      if (d.fuelBurn       === undefined) d.fuelBurn       = null;
      // In-progress constructions don't survive a reload.
      // "building" blueprints become immediately live; "deconstructing" is cancelled.
      delete d.construction;
    }
    // ─────────────────────────────────────────────────────────

    console.info("[StateManager] State applied from save data.");
    return true;
  }

  private _insertIntoInventory(
    slots:  (ItemStack | null)[],
    itemId: string,
    qty:    number,
  ): number {
    let remaining = qty;

    for (const slot of slots) {
      if (remaining <= 0) break;
      if (slot?.itemId === itemId) {
        const space = 999 - slot.qty;
        const toAdd = Math.min(space, remaining);
        slot.qty  += toAdd;
        remaining -= toAdd;
      }
    }

    for (let i = 0; i < slots.length && remaining > 0; i++) {
      if (slots[i] === null) {
        slots[i]   = { itemId, qty: Math.min(999, remaining) };
        remaining -= Math.min(999, remaining);
      }
    }

    return remaining;
  }
}

export const sm = new StateManager();
