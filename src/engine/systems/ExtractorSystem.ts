// ============================================================
//  src/engine/systems/ExtractorSystem.ts
//
//  Ticks all placed extractors. Each cycle:
//    1. Check the tile under the extractor matches requiredTile.
//    2. Check there is fuel in the fuel slot (if fuelPerCycle > 0).
//    3. Consume fuel and produce one unit of output.
//
//  Add new extractor types in EXTRACTOR_CONFIG — no engine changes.
// ============================================================

import { sm }              from "@engine/core/StateManager";
import { registry }        from "@engine/core/Registry";
import { GameConfig }      from "@engine/core/GameConfig";
import { getAbsolutePort } from "@engine/utils/portUtils";
import type { DoodadState } from "@t/state";
import type { TileType }    from "@t/state";

interface ExtractorConfig {
  requiredTile:   TileType;
  outputItemId:   string;
  /** How many fuel units consumed per extraction cycle. 0 = no fuel needed. */
  fuelPerCycle:   number;
}

const EXTRACTOR_CONFIG: Record<string, ExtractorConfig> = {
  extractor_iron:   { requiredTile: "ore_iron",   outputItemId: "iron_ore",   fuelPerCycle: 1 },
  extractor_copper: { requiredTile: "ore_copper",  outputItemId: "copper_ore", fuelPerCycle: 1 },
  extractor_coal:   { requiredTile: "ore_coal",    outputItemId: "coal",       fuelPerCycle: 0 },
};

const CS            = GameConfig.CHUNK_SIZE;
const BELT_MAX_ITEMS = 4;

export class ExtractorSystem {
  update(deltaMs: number): void {
    for (const doodad of sm.allDoodads()) {
      const def = registry.findDoodad(doodad.defId);
      if (!def?.machineTag) continue;

      const cfg = EXTRACTOR_CONFIG[def.machineTag];
      if (!cfg) continue;

      this.tickExtractor(doodad, cfg, def.tickIntervalMs ?? 2000, deltaMs);
    }
  }

  // ── Tick ──────────────────────────────────────────────────

  private tickExtractor(
    doodad:   DoodadState,
    cfg:      ExtractorConfig,
    interval: number,
    deltaMs:  number,
  ): void {
    // Belt push runs every frame so items drain continuously
    this.pushToBelt(doodad);

    // Mining fires on the tick interval
    doodad.tickAccumulatorMs += deltaMs;
    if (doodad.tickAccumulatorMs < interval) return;

    while (doodad.tickAccumulatorMs >= interval) {
      doodad.tickAccumulatorMs -= interval;
      this.tryExtract(doodad, cfg);
    }
  }

  private tryExtract(doodad: DoodadState, cfg: ExtractorConfig): void {
    const def = registry.getDoodad(doodad.defId);

    // 1. Check tile under origin is the right ore
    const tile = this.getTile(doodad.origin.tx, doodad.origin.ty);
    if (!tile || tile.type !== cfg.requiredTile) return;

    // 2. Fuel check — find a fuel slot with enough fuel
    if (cfg.fuelPerCycle > 0) {
      const fuelSlotIdx = this.findFuelSlot(doodad, def.slots, cfg.fuelPerCycle);
      if (fuelSlotIdx === -1) return; // stall — no fuel

      // Consume fuel
      const fuelSlot = doodad.inventory[fuelSlotIdx]!;
      fuelSlot.qty -= cfg.fuelPerCycle;
      if (fuelSlot.qty <= 0) doodad.inventory[fuelSlotIdx] = null;
    }

    // 3. Write to output slot
    for (let i = 0; i < def.slots.length; i++) {
      const slotDef = def.slots[i];
      if (!slotDef || slotDef.role !== "output") continue;

      const slot = doodad.inventory[i];
      if (slot === null || slot === undefined) {
        doodad.inventory[i] = { itemId: cfg.outputItemId, qty: 1 };
        return;
      }
      if (slot.itemId === cfg.outputItemId && slot.qty < slotDef.capacity) {
        slot.qty += 1;
        return;
      }
    }
    // Output full — stall (backpressure). Fuel already consumed this cycle.
  }

  // ── Helpers ───────────────────────────────────────────────

  /**
   * Returns the index of the first fuel slot with at least `required` qty.
   * Returns -1 if no fuel available.
   */
  private findFuelSlot(
    doodad:    DoodadState,
    slotDefs:  ReturnType<typeof registry.getDoodad>["slots"],
    required:  number,
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

  // ── Tile lookup ───────────────────────────────────────────

  private getTile(tx: number, ty: number) {
    const cx = Math.floor(tx / CS);
    const cy = Math.floor(ty / CS);
    const chunk = sm.getChunk(cx, cy);
    if (!chunk) return null;
    const lx = ((tx % CS) + CS) % CS;
    const ly = ((ty % CS) + CS) % CS;
    return chunk.tiles[ly]?.[lx] ?? null;
  }
}
