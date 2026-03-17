// ============================================================
//  src/engine/core/StateManager.ts
//  Single source of truth for all mutable game state.
//
//  Rules:
//    • Only StateManager mutates GameState.
//    • All mutations go through typed helper methods so the
//      serialisation contract is always maintained.
//    • Systems read state via `sm.state`; they call methods
//      to write it.  They never do `sm.state.foo = bar`.
// ============================================================

import type { GameState, PlayerState, DoodadState, Chunk, ItemStack } from "@t/state";
import { GameConfig } from "./GameConfig";
import { bus } from "./EventBus";

function makeEmptyInventory(slots: number): (ItemStack | null)[] {
  return Array.from({ length: slots }, () => null);
}

function defaultState(): GameState {
  return {
    version: GameConfig.SAVE_VERSION,
    tickCount: 0,
    worldSeed: Math.floor(Math.random() * 0xffffffff),
    player: {
      pos: { x: 0, y: 0 },
      cursorWorldPos: { x: 0, y: 0 },
      speed: GameConfig.PLAYER_SPEED_PX_S,
      inventory: { slots: makeEmptyInventory(GameConfig.PLAYER_INV_SLOTS) },
      heldItemId: null,
      placementRotation: 0,
      health: 100,
      maxHealth: 100,
    },
    chunks: {},
    doodads: {},
    belts: {},
  };
}

export class StateManager {
  state: GameState;

  constructor() {
    this.state = defaultState();
  }

  // ── Persistence ──────────────────────────────────────────

  save(): void {
    try {
      const json = JSON.stringify(this.state);
      localStorage.setItem(GameConfig.SAVE_KEY, json);
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
      const parsed = JSON.parse(raw) as GameState;
      if (parsed.version !== GameConfig.SAVE_VERSION) {
        console.warn("[StateManager] Save version mismatch — starting fresh.");
        return false;
      }
      this.state = parsed;
      // ── Migrate saves from earlier phases ──────────────────
      const p = this.state.player;
      if (!p.cursorWorldPos)               p.cursorWorldPos    = { x: 0, y: 0 };
      if (p.placementRotation === undefined) p.placementRotation = 0;
      if (!this.state.belts)               (this.state as GameState).belts = {};
      // ───────────────────────────────────────────────────────
      console.info("[StateManager] Game loaded.");
      return true;
    } catch (e) {
      console.error("[StateManager] Load failed:", e);
      return false;
    }
  }

  reset(): void {
    this.state = defaultState();
  }

  // ── Chunk helpers ─────────────────────────────────────────

  chunkKey(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  setChunk(chunk: Chunk): void {
    this.state.chunks[this.chunkKey(chunk.cx, chunk.cy)] = chunk;
  }

  getChunk(cx: number, cy: number): Chunk | undefined {
    return this.state.chunks[this.chunkKey(cx, cy)];
  }

  // ── Doodad helpers ────────────────────────────────────────

  addDoodad(doodad: DoodadState): void {
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

  /** Iterate all doodads — returns entries array (snapshot). */
  allDoodads(): DoodadState[] {
    return Object.values(this.state.doodads);
  }

  // ── Belt helpers ──────────────────────────────────────────

  /** Find a belt whose origin tile matches (tx, ty), or undefined. */
  getBeltAt(tx: number, ty: number): import("@t/state").BeltSegment | undefined {
    return Object.values(this.state.belts).find(
      b => b.origin.tx === tx && b.origin.ty === ty
    );
  }

  addBelt(belt: import("@t/state").BeltSegment): void {
    this.state.belts[belt.id] = belt;
  }

  // ── Player helpers ────────────────────────────────────────

  movePlayer(x: number, y: number): void {
    this.state.player.pos.x = x;
    this.state.player.pos.y = y;
    bus.emit("player:moved", { x, y });
  }

  updateCursorWorld(x: number, y: number): void {
    // Guard against stale saves loaded before cursorWorldPos existed
    if (!this.state.player.cursorWorldPos) {
      this.state.player.cursorWorldPos = { x, y };
    } else {
      this.state.player.cursorWorldPos.x = x;
      this.state.player.cursorWorldPos.y = y;
    }
  }

  /** Add items to player inventory. Returns overflow qty. */
  givePlayerItem(itemId: string, qty: number): number {
    return this._insertIntoInventory(this.state.player.inventory.slots, itemId, qty);
  }

  // ── Shared inventory insert/remove ───────────────────────

  /**
   * Tries to insert `qty` of `itemId` into `slots`.
   * Returns how many items could NOT fit (overflow).
   */
  private _insertIntoInventory(
    slots: (ItemStack | null)[],
    itemId: string,
    qty: number
  ): number {
    let remaining = qty;

    // First pass: stack into existing slots
    for (const slot of slots) {
      if (remaining <= 0) break;
      if (slot?.itemId === itemId) {
        const space = 999 - slot.qty;  // 999 as generic max; Registry consulted by callers
        const toAdd = Math.min(space, remaining);
        slot.qty += toAdd;
        remaining -= toAdd;
      }
    }

    // Second pass: fill empty slots
    for (let i = 0; i < slots.length && remaining > 0; i++) {
      if (slots[i] === null) {
        slots[i] = { itemId, qty: Math.min(999, remaining) };
        remaining -= Math.min(999, remaining);
      }
    }

    return remaining; // overflow
  }
}

export const sm = new StateManager();
