// ============================================================
//  src/engine/systems/ExtractorSystem.ts
//
//  Ticks all placed extractors.  Each cycle:
//    1. Find the FeatureState at the extractor's origin tile.
//    2. Verify the feature's extractorTag matches this machine.
//    3. Check power / fuel (same hybrid logic as before).
//    4. Produce one unit of the feature's yieldsItemId.
//    5. If RESOURCE_DEPLETION_ENABLED, decrement remainingYield;
//       delete the feature from the chunk map when it hits 0.
//       Infinite features (def.infinite === true) are never deleted.
// ============================================================

import { sm }         from "@engine/core/StateManager";
import { registry }   from "@engine/core/Registry";
import { GameConfig } from "@engine/core/GameConfig";
import { getAbsolutePort } from "@engine/utils/portUtils";
import type { DoodadState } from "@t/state";

// machineTags handled by this system
const EXTRACTOR_TAGS = new Set([
  "extractor_scrap",
  "extractor_iron",
  "extractor_copper",
  "extractor_coal",
]);

/** Fuel units consumed per extraction cycle (0 = no fuel needed). */
const FUEL_PER_CYCLE: Record<string, number> = {
  extractor_scrap:   0,
  extractor_iron:    1,
  extractor_copper:  1,
  extractor_coal:    1,
};

const CS             = GameConfig.CHUNK_SIZE;
const BELT_MAX_ITEMS = 4;

export class ExtractorSystem {
  /**
   * Per-doodad fuel tick counters — tracks how many extraction ticks have
   * fired since the last fuel consumption.  In-memory only; resets on reload
   * (a few free cycles on load is harmless).
   */
  private readonly fuelCounters = new Map<string, number>();

  update(deltaMs: number): void {
    for (const doodad of sm.allDoodads()) {
      const def = registry.findDoodad(doodad.defId);
      if (!def?.machineTag) continue;
      if (!EXTRACTOR_TAGS.has(def.machineTag)) continue;

      this.tickExtractor(
        doodad,
        def.machineTag,
        FUEL_PER_CYCLE[def.machineTag] ?? 0,
        def.fuelEveryNTicks ?? 1,
        def.tickIntervalMs ?? 2000,
        deltaMs,
      );
    }
  }

  // ── Tick ──────────────────────────────────────────────────

  private tickExtractor(
    doodad:        DoodadState,
    machineTag:    string,
    fuelPerCycle:  number,
    fuelEveryNTicks: number,
    interval:      number,
    deltaMs:       number,
  ): void {
    if (doodad.construction?.mode === "building") return;

    // Belt push runs every frame so items drain continuously
    this.pushToBelt(doodad);

    // Mining fires on the tick interval
    doodad.tickAccumulatorMs += deltaMs;
    if (doodad.tickAccumulatorMs < interval) return;

    while (doodad.tickAccumulatorMs >= interval) {
      doodad.tickAccumulatorMs -= interval;
      this.tryExtract(doodad, machineTag, fuelPerCycle, fuelEveryNTicks);
    }
  }

  private tryExtract(
    doodad:          DoodadState,
    machineTag:      string,
    fuelPerCycle:    number,
    fuelEveryNTicks: number,
  ): void {
    const def = registry.getDoodad(doodad.defId);

    // ── Fuel rhythm counter ───────────────────────────────────
    // Increment per extraction attempt; only consume fuel every N ticks.
    const prevCount      = this.fuelCounters.get(doodad.id) ?? 0;
    const newCount       = prevCount + 1;
    const consumeFuel    = newCount >= fuelEveryNTicks;
    this.fuelCounters.set(doodad.id, consumeFuel ? 0 : newCount);

    // 1. Find the feature at the extractor's origin tile
    const featureInfo = this.getFeatureAt(doodad.origin.tx, doodad.origin.ty);
    if (!featureInfo) return;

    const { chunk, localKey, featureState } = featureInfo;
    const featureDef = registry.findFeature(featureState.featureId);
    if (!featureDef) return;

    // 2. Check this extractor can mine this feature type
    if (featureDef.extractorTag !== undefined && featureDef.extractorTag !== machineTag) return;

    // 3. Power / fuel check — hybrid logic with fuelEveryNTicks throttle
    if (def.powerDraw > 0) {
      if (!doodad.powered) {
        // Off-grid: require fuel every N ticks
        if (fuelPerCycle > 0 && consumeFuel) {
          const fuelIdx = this.findFuelSlot(doodad, def.slots, fuelPerCycle);
          if (fuelIdx === -1) return;
          const fuelSlot = doodad.inventory[fuelIdx]!;
          fuelSlot.qty -= fuelPerCycle;
          if (fuelSlot.qty <= 0) doodad.inventory[fuelIdx] = null;
        }
      }
      // else: grid-powered — no fuel consumed
    } else if (fuelPerCycle > 0 && consumeFuel) {
      // Always fuel-driven (powerDraw === 0), every N ticks
      const fuelIdx = this.findFuelSlot(doodad, def.slots, fuelPerCycle);
      if (fuelIdx === -1) return;
      const fuelSlot = doodad.inventory[fuelIdx]!;
      fuelSlot.qty -= fuelPerCycle;
      if (fuelSlot.qty <= 0) doodad.inventory[fuelIdx] = null;
    }

    // 4. Write to output slot
    const outputItemId = featureDef.yieldsItemId;
    let produced = false;
    for (let i = 0; i < def.slots.length; i++) {
      const slotDef = def.slots[i];
      if (!slotDef || slotDef.role !== "output") continue;

      const slot = doodad.inventory[i];
      if (slot === null || slot === undefined) {
        doodad.inventory[i] = { itemId: outputItemId, qty: 1 };
        produced = true;
        break;
      }
      if (slot.itemId === outputItemId && slot.qty < slotDef.capacity) {
        slot.qty += 1;
        produced = true;
        break;
      }
    }

    if (!produced) return; // Output full — backpressure; don't deplete

    // 5. Deplete feature (unless infinite or depletion disabled)
    if (GameConfig.RESOURCE_DEPLETION_ENABLED && !featureDef.infinite) {
      featureState.remainingYield -= 1;
      if (featureState.remainingYield <= 0) {
        delete chunk.features![localKey];
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────

  private findFuelSlot(
    doodad:   DoodadState,
    slotDefs: ReturnType<typeof registry.getDoodad>["slots"],
    required: number,
  ): number {
    for (let i = 0; i < slotDefs.length; i++) {
      const sd = slotDefs[i];
      if (!sd || sd.role !== "fuel") continue;
      const slot = doodad.inventory[i];
      if (slot && slot.qty >= required) return i;
    }
    return -1;
  }

  // ── Belt push ─────────────────────────────────────────────

  private pushToBelt(doodad: DoodadState): void {
    const def = registry.getDoodad(doodad.defId);

    for (const port of def.ports) {
      if (port.role !== "output") continue;

      const { adjacentTile } = getAbsolutePort(doodad, port, def.footprint.w, def.footprint.h);
      const belt = sm.getBeltAt(adjacentTile.tx, adjacentTile.ty);
      if (!belt || belt.items.length >= BELT_MAX_ITEMS) continue;

      const entryBlocked = belt.items.some(item => item.progress < 0.3);
      if (entryBlocked) continue;

      for (let i = 0; i < def.slots.length; i++) {
        const slotDef = def.slots[i];
        if (!slotDef || slotDef.role !== "output") continue;
        const slot = doodad.inventory[i];
        if (!slot || slot.qty <= 0) continue;

        belt.items.push({ stack: { itemId: slot.itemId, qty: 1 }, progress: 0 });
        slot.qty -= 1;
        if (slot.qty === 0) doodad.inventory[i] = null;
        break;
      }
    }
  }

  // ── Feature lookup ────────────────────────────────────────

  private getFeatureAt(tx: number, ty: number): {
    chunk:      import("@t/state").Chunk;
    localKey:   string;
    featureState: import("@t/state").FeatureState;
  } | null {
    const cx = Math.floor(tx / CS);
    const cy = Math.floor(ty / CS);
    const chunk = sm.getChunk(cx, cy);
    if (!chunk?.features) return null;

    const lx  = ((tx % CS) + CS) % CS;
    const ly  = ((ty % CS) + CS) % CS;
    const key = `${lx},${ly}`;
    const fs  = chunk.features[key];
    if (!fs) return null;

    return { chunk, localKey: key, featureState: fs };
  }
}
