// ============================================================
//  src/engine/systems/DoodadSystem.ts
//
//  Responsible for ticking every placed Doodad each frame.
//  A "tick" runs doodad logic at a throttled interval
//  (not every frame) for performance and game-feel reasons.
//
//  Tick lifecycle per Doodad:
//    1. Accumulate delta time.
//    2. When accumulated ≥ tickInterval → run logic.
//    3. Logic:  a) Select recipe (if machine)
//               b) Check power
//               c) Check input slots
//               d) Advance crafting progress
//               e) On completion: consume inputs, write outputs
//               f) Emit events
// ============================================================

import type { DoodadState, ItemStack } from "@t/state";
import type { DoodadDef, RecipeDef, SlotDef } from "@t/content";
import { registry } from "@engine/core/Registry";
import { sm } from "@engine/core/StateManager";
import { bus } from "@engine/core/EventBus";
import { GameConfig } from "@engine/core/GameConfig";

export class DoodadSystem {
  /**
   * Called every frame by the Game Loop.
   * `deltaMs` — elapsed ms since last frame.
   */
  update(deltaMs: number): void {
    for (const doodad of sm.allDoodads()) {
      this.tickDoodad(doodad, deltaMs);
    }
  }

  // ── Core tick ─────────────────────────────────────────────

  private tickDoodad(doodad: DoodadState, deltaMs: number): void {
    const def = registry.getDoodad(doodad.defId);
    const interval = def.tickIntervalMs ?? GameConfig.DEFAULT_DOODAD_TICK_MS;

    doodad.tickAccumulatorMs += deltaMs;
    if (doodad.tickAccumulatorMs < interval) return;

    // Consume accumulated time in discrete ticks
    while (doodad.tickAccumulatorMs >= interval) {
      doodad.tickAccumulatorMs -= interval;
      this.runTick(doodad, def, interval);
    }
  }

  private runTick(doodad: DoodadState, def: DoodadDef, tickMs: number): void {
    // Non-machine doodads (belts, power poles) are handled by
    // their own dedicated systems; skip here.
    if (!def.machineTag) return;

    // 1. Ensure we have a recipe selected.
    const recipe = this.resolveRecipe(doodad, def);
    if (!recipe) {
      doodad.crafting = null;
      return;
    }

    // 2. Power check.
    if (def.powerDraw > 0 && !doodad.powered) {
      doodad.crafting = null;
      return;
    }

    // 3. Check input availability (only when starting a new cycle).
    if (!doodad.crafting) {
      if (!this.canConsumeInputs(doodad, def, recipe)) return;
      // Lock inputs into the internal buffer (consume them now,
      // so two ticks don't double-consume).
      this.consumeInputs(doodad, def, recipe);
      doodad.crafting = { recipeId: recipe.id, elapsedMs: 0 };
      bus.emit("doodad:craft:start", { doodadId: doodad.id, recipeId: recipe.id });
    }

    // 4. Advance crafting progress.
    doodad.crafting.elapsedMs += tickMs;

    // 5. Completion check.
    if (doodad.crafting.elapsedMs >= recipe.craftingTime) {
      if (this.canOutputItems(doodad, def, recipe)) {
        this.writeOutputs(doodad, def, recipe);
        doodad.crafting = null;
        bus.emit("doodad:craft:finish", { doodadId: doodad.id, recipeId: recipe.id });
      }
      // If output slots are full, stall — crafting stays "done"
      // until room opens up. This is intentional backpressure.
    }
  }

  // ── Recipe resolution ─────────────────────────────────────

  /**
   * For now: find the first recipe for this machine tag whose
   * inputs match what's in the input slots.
   *
   * Later: expose a UI for the player to pin a recipe.
   */
  private resolveRecipe(doodad: DoodadState, def: DoodadDef): RecipeDef | null {
    const candidates = registry.recipesForMachine(def.machineTag!);
    for (const recipe of candidates) {
      if (this.canConsumeInputs(doodad, def, recipe)) return recipe;
    }
    return null;
  }

  // ── Input / Output helpers ────────────────────────────────

  private inputSlotIndices(def: DoodadDef): number[] {
    return def.slots.map((s, i) => ({ s, i }))
      .filter(({ s }) => s.role === "input")
      .map(({ i }) => i);
  }

  private outputSlotIndices(def: DoodadDef): number[] {
    return def.slots.map((s, i) => ({ s, i }))
      .filter(({ s }) => s.role === "output")
      .map(({ i }) => i);
  }

  /** True if input slots collectively contain all required ingredients. */
  private canConsumeInputs(doodad: DoodadState, def: DoodadDef, recipe: RecipeDef): boolean {
    const inputIndices = this.inputSlotIndices(def);
    for (const req of recipe.inputs) {
      let remaining = req.qty;
      for (const idx of inputIndices) {
        const slot = doodad.inventory[idx];
        if (slot?.itemId === req.itemId) {
          remaining -= slot.qty;
        }
      }
      if (remaining > 0) return false;
    }
    return true;
  }

  /** Deduct recipe inputs from input slots. Assumes canConsumeInputs passed. */
  private consumeInputs(doodad: DoodadState, def: DoodadDef, recipe: RecipeDef): void {
    const inputIndices = this.inputSlotIndices(def);
    for (const req of recipe.inputs) {
      let toDeduct = req.qty;
      for (const idx of inputIndices) {
        const slot = doodad.inventory[idx];
        if (!slot || slot.itemId !== req.itemId) continue;
        const take = Math.min(slot.qty, toDeduct);
        slot.qty -= take;
        toDeduct -= take;
        if (slot.qty === 0) doodad.inventory[idx] = null;
        if (toDeduct === 0) break;
      }
    }
  }

  /** True if output slots have room for all recipe outputs. */
  private canOutputItems(doodad: DoodadState, def: DoodadDef, recipe: RecipeDef): boolean {
    const outputIndices = this.outputSlotIndices(def);
    for (const out of recipe.outputs) {
      let toPlace = out.qty;
      for (const idx of outputIndices) {
        const slot = doodad.inventory[idx];
        const slotDef = def.slots[idx];
        if (slot === null || slot === undefined) {
          toPlace -= out.qty;
          break;
        }
        if (slotDef && slot.itemId === out.itemId) {
          const space = slotDef.capacity - slot.qty;
          toPlace -= Math.min(space, toPlace);
        }
        if (toPlace <= 0) break;
      }
      if (toPlace > 0) return false;
    }
    return true;
  }

  /** Write recipe outputs into output slots. Assumes canOutputItems passed. */
  private writeOutputs(doodad: DoodadState, def: DoodadDef, recipe: RecipeDef): void {
    const outputIndices = this.outputSlotIndices(def);
    for (const out of recipe.outputs) {
      let remaining = out.qty;
      for (const idx of outputIndices) {
        if (remaining <= 0) break;
        const slotDef = def.slots[idx];
        const slot = doodad.inventory[idx];
        if (slot === null || slot === undefined) {
          doodad.inventory[idx] = { itemId: out.itemId, qty: remaining };
          remaining = 0;
        } else if (slotDef && slot.itemId === out.itemId) {
          const space = slotDef.capacity - slot.qty;
          const add = Math.min(space, remaining);
          slot.qty += add;
          remaining -= add;
        }
      }
    }
  }
}
