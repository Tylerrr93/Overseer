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
import { getAbsolutePort } from "@engine/utils/portUtils";

// Max items on a single belt segment before it's considered full
const BELT_MAX_ITEMS = 4;

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

    // Extractors are handled entirely by ExtractorSystem — skip them here
    // so they don't share tickAccumulatorMs with DoodadSystem's counter.
    if (def.machineTag?.startsWith("extractor_")) return;

    const interval = def.tickIntervalMs ?? GameConfig.DEFAULT_DOODAD_TICK_MS;

    // Belt IO runs every frame regardless of tick interval
    this.pushOutputsToBelts(doodad, def);
    this.pullInputsFromBelts(doodad, def);

    // Tick down fuel fallback burn timer each frame
    if (doodad.fuelBurn && doodad.fuelBurn.remainingMs > 0) {
      doodad.fuelBurn.remainingMs -= deltaMs;
    }

    // Crafting logic only fires on the tick interval
    doodad.tickAccumulatorMs += deltaMs;
    if (doodad.tickAccumulatorMs < interval) return;

    while (doodad.tickAccumulatorMs >= interval) {
      doodad.tickAccumulatorMs -= interval;
      this.runTick(doodad, def, interval);
    }
  }

  private runTick(doodad: DoodadState, def: DoodadDef, tickMs: number): void {
    if (!def.machineTag) return;

    // ── Power / fuel-fallback check ─────────────────────────
    if (def.powerDraw > 0) {
      if (!doodad.powered) {
        // Not on the grid — try fuel fallback.
        // Check any slot whose filter accepts fuel-tagged items.
        if (!this.consumeFuelFallback(doodad, def)) {
          // No fuel either — stall.
          doodad.crafting = null;
          return;
        }
        // Fuel consumed: allow this tick to proceed.
      }
    }

    // ── If a cycle is already in progress, just advance it ──
    // Do NOT call resolveRecipe here — inputs were already consumed
    // at cycle start and are no longer in the slots.
    if (doodad.crafting) {
      const activeRecipe = registry.findRecipe(doodad.crafting.recipeId);
      if (!activeRecipe) {
        // Recipe no longer exists — abort
        doodad.crafting = null;
        return;
      }

      doodad.crafting.elapsedMs += tickMs;

      if (doodad.crafting.elapsedMs >= activeRecipe.craftingTime) {
        if (this.canOutputItems(doodad, def, activeRecipe)) {
          this.writeOutputs(doodad, def, activeRecipe);
          doodad.crafting = null;
          bus.emit("doodad:craft:finish", { doodadId: doodad.id, recipeId: activeRecipe.id });
        }
        // Output full — stall with crafting intact until room opens.
      }
      return;
    }

    // ── No active cycle — try to start a new one ─────────────
    const recipe = this.resolveRecipe(doodad, def);
    if (!recipe) return; // no matching recipe or inputs not ready

    if (!this.canConsumeInputs(doodad, def, recipe)) return;

    // Consume inputs now and lock in the cycle.
    this.consumeInputs(doodad, def, recipe);
    doodad.crafting = { recipeId: recipe.id, elapsedMs: 0 };
    bus.emit("doodad:craft:start", { doodadId: doodad.id, recipeId: recipe.id });

    // Advance by one tick immediately (this tick counts).
    doodad.crafting.elapsedMs += tickMs;

    if (doodad.crafting.elapsedMs >= recipe.craftingTime) {
      if (this.canOutputItems(doodad, def, recipe)) {
        this.writeOutputs(doodad, def, recipe);
        doodad.crafting = null;
        bus.emit("doodad:craft:finish", { doodadId: doodad.id, recipeId: recipe.id });
      }
    }
  }

  // ── Fuel fallback ────────────────────────────────────────

  /**
   * Consumes 1 unit of fuel from the machine's fuel-compatible slot.
   * "Fuel-compatible" = role is "fuel" OR filter includes "fuel".
   * Returns true if fuel was available and consumed.
   */
  private consumeFuelFallback(doodad: DoodadState, def: DoodadDef): boolean {
    // Use fuelBurn to spread one coal item over multiple ticks
    // so a machine doesn't burn 1 coal every 500ms.
    // 1 coal = 5000ms of fallback operation at 500ms/tick = 10 ticks.
    const FALLBACK_BURN_MS = 5000;

    if (doodad.fuelBurn && doodad.fuelBurn.remainingMs > 0) {
      // Still burning from a previous fuel item — allow tick.
      return true;
    }

    // Need to consume a new fuel item.
    for (let i = 0; i < def.slots.length; i++) {
      const sd = def.slots[i];
      if (!sd) continue;
      const isFuelSlot = sd.role === "fuel" ||
        (sd.filter && sd.filter.includes("fuel"));
      if (!isFuelSlot) continue;

      const slot = doodad.inventory[i];
      if (!slot || slot.qty <= 0) continue;

      // Consume 1 fuel item and set burn timer.
      slot.qty -= 1;
      if (slot.qty <= 0) doodad.inventory[i] = null;
      doodad.fuelBurn = { remainingMs: FALLBACK_BURN_MS, totalMs: FALLBACK_BURN_MS };
      return true;
    }
    return false; // no fuel
  }

  // ── Recipe resolution ─────────────────────────────────────

  /**
   * For now: find the first recipe for this machine tag whose
   * inputs match what's in the input slots.
   *
   * Later: expose a UI for the player to pin a recipe.
   */
  private resolveRecipe(doodad: DoodadState, def: DoodadDef): RecipeDef | null {
    // If player has pinned a recipe, only attempt that one.
    // The machine waits (stalls) if inputs aren't ready — no auto-switching.
    if (doodad.pinnedRecipeId) {
      const pinned = registry.findRecipe(doodad.pinnedRecipeId);
      if (pinned && this.canConsumeInputs(doodad, def, pinned)) return pinned;
      return null; // stall until inputs match the pinned recipe
    }

    // Otherwise: auto-select from allowed recipes for this machine.
    let candidates = registry.recipesForMachine(def.machineTag!);
    // Restrict to allowedRecipeIds if the def specifies a subset.
    if (def.allowedRecipeIds && def.allowedRecipeIds.length > 0) {
      const allowed = new Set(def.allowedRecipeIds);
      candidates = candidates.filter(r => allowed.has(r.id));
    }
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

  // ── Belt output pushing ──────────────────────────────────

  /**
   * For each output port on this doodad, check if there's a belt
   * on the adjacent tile. If so, and the belt has room, transfer
   * one item per tick from the output slot to the belt.
   */
  private pushOutputsToBelts(doodad: DoodadState, def: DoodadDef): void {
    // Rate-limit: only push once per doodad tick interval, not every frame.
    // We abuse a separate accumulator stored on the doodad for this.
    // Simple approach: only push when the tick just fired (accumulator was reset).
    // Since pushOutputsToBelts is called every frame but we only want belt
    // transfer at ~2/s, we use the tickAccumulatorMs as a proxy:
    // push whenever the accumulator is near zero (just ticked).
    // Actually simpler: just always allow push but cap belt at BELT_MAX_ITEMS.
    // The belt's own speed (BELT_ITEMS_PER_SECOND) is the real rate limiter.

    for (const port of def.ports) {
      if (port.role !== "output") continue;

      const { adjacentTile } = getAbsolutePort(doodad, port, def.footprint.w, def.footprint.h);
      const belt = sm.getBeltAt(adjacentTile.tx, adjacentTile.ty);
      if (!belt || belt.items.length >= BELT_MAX_ITEMS) continue;

      // Find first output slot with an item
      for (let i = 0; i < def.slots.length; i++) {
        const slotDef = def.slots[i];
        if (!slotDef || slotDef.role !== "output") continue;
        const slot = doodad.inventory[i];
        if (!slot || slot.qty <= 0) continue;

        // Only push if belt entry is clear (no item near progress=0)
        const entryBlocked = belt.items.some(item => item.progress < 0.3);
        if (entryBlocked) break;

        belt.items.push({ stack: { itemId: slot.itemId, qty: 1 }, progress: 0 });
        slot.qty -= 1;
        if (slot.qty === 0) doodad.inventory[i] = null;
        break;
      }
    }
  }

  private pullInputsFromBelts(doodad: DoodadState, def: DoodadDef): void {
    for (const port of def.ports) {
      if (port.role !== "input") continue;

      const { adjacentTile, facingDir } = getAbsolutePort(doodad, port, def.footprint.w, def.footprint.h);
      // The input port faces outward (e.g. "W"). The belt that feeds
      // this port sits on the adjacentTile — one step outside the machine
      // in the port's facing direction.  Items travel in facingDir and
      // arrive at adjacentTile with progress >= 1.
      const belt = sm.getBeltAt(adjacentTile.tx, adjacentTile.ty);
      // Belt must be travelling TOWARD this machine (into the port)
      if (!belt) continue;
      // Belt must travel toward the machine (direction opposite to port's facing)
      const opposites: Record<string, string> = { N:"S", S:"N", E:"W", W:"E" };
      if (belt.direction !== opposites[facingDir]) continue;
      if (!belt || belt.items.length === 0) continue;

      // Only pull items that have reached progress >= 1 (arrived)
      const arrivedIdx = belt.items.findIndex(item => item.progress >= 1);
      if (arrivedIdx === -1) continue;

      const arrived = belt.items[arrivedIdx]!;

      // Find a matching input slot with room
      for (let i = 0; i < def.slots.length; i++) {
        const slotDef = def.slots[i];
        if (!slotDef || slotDef.role !== "input") continue;

        // Check filter
        if (slotDef.filter && slotDef.filter.length > 0) {
          const itemDef = registry.findItem(arrived.stack.itemId);
          const tags = itemDef?.tags ?? [];
          const passes = slotDef.filter.some(f => f === arrived.stack.itemId || tags.includes(f));
          if (!passes) continue;
        }

        const slot = doodad.inventory[i];
        const capacity = slotDef.capacity;

        if (slot === null || slot === undefined) {
          doodad.inventory[i] = { itemId: arrived.stack.itemId, qty: 1 };
          belt.items.splice(arrivedIdx, 1);
          break;
        }
        if (slot.itemId === arrived.stack.itemId && slot.qty < capacity) {
          slot.qty += 1;
          belt.items.splice(arrivedIdx, 1);
          break;
        }
      }
    }
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
