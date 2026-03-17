// ============================================================
//  src/engine/systems/ExtractorSystem.ts
//
//  Ticks all placed extractors. On each tick interval, if the
//  tile beneath the extractor matches the extractor's ore type
//  and the output slot has room, one unit is produced.
//
//  Designed to be extended: add new machineTag entries to
//  EXTRACTOR_CONFIG without touching engine code.
// ============================================================

import { sm }                 from "@engine/core/StateManager";
import { registry }             from "@engine/core/Registry";
import { GameConfig }           from "@engine/core/GameConfig";
import { getAbsolutePort }      from "@engine/utils/portUtils";
import type { DoodadState } from "@t/state";
import type { TileType }    from "@t/state";

// ── Config table ──────────────────────────────────────────────
// machineTag → { requiredTile, outputItemId }
// Add new extractor types here; no engine changes needed.

interface ExtractorConfig {
  requiredTile: TileType;
  outputItemId: string;
}

const EXTRACTOR_CONFIG: Record<string, ExtractorConfig> = {
  extractor_iron:   { requiredTile: "ore_iron",   outputItemId: "iron_ore"   },
  extractor_copper: { requiredTile: "ore_copper",  outputItemId: "copper_ore" },
  extractor_coal:   { requiredTile: "ore_coal",    outputItemId: "coal"       },
};

const CS = GameConfig.CHUNK_SIZE;

// ─────────────────────────────────────────────────────────────

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
    doodad: DoodadState,
    cfg:    ExtractorConfig,
    interval: number,
    deltaMs:  number,
  ): void {
    doodad.tickAccumulatorMs += deltaMs;
    if (doodad.tickAccumulatorMs < interval) return;

    while (doodad.tickAccumulatorMs >= interval) {
      doodad.tickAccumulatorMs -= interval;
      this.tryExtract(doodad, cfg);
    }

    // Push to adjacent belt every frame (belt backpressure gates the rate)
    this.pushToBelt(doodad);
  }

  private tryExtract(doodad: DoodadState, cfg: ExtractorConfig): void {
    // 1. Power check
    if (!doodad.powered) return;

    // 2. Check tile under extractor origin
    const tile = this.getTile(doodad.origin.tx, doodad.origin.ty);
    if (!tile || tile.type !== cfg.requiredTile) return;

    // 3. Find the first output slot with room
    const def = registry.getDoodad(doodad.defId);
    for (let i = 0; i < def.slots.length; i++) {
      const slotDef = def.slots[i];
      if (!slotDef || slotDef.role !== "output") continue;

      const slot = doodad.inventory[i];
      const capacity = slotDef.capacity;

      if (slot === null || slot === undefined) {
        doodad.inventory[i] = { itemId: cfg.outputItemId, qty: 1 };
        return;
      }
      if (slot.itemId === cfg.outputItemId && slot.qty < capacity) {
        slot.qty += 1;
        return;
      }
    }
    // Output slot full — stall (backpressure)
  }

  // ── Belt push ─────────────────────────────────────────────

  private pushToBelt(doodad: DoodadState): void {
    const def = registry.getDoodad(doodad.defId);
    const BELT_MAX_ITEMS = 4;

    for (const port of def.ports) {
      if (port.role !== "output") continue;

      const { adjacentTile } = getAbsolutePort(doodad, port, def.footprint.w, def.footprint.h);
      const belt = sm.getBeltAt(adjacentTile.tx, adjacentTile.ty);
      if (!belt || belt.items.length >= BELT_MAX_ITEMS) continue;

      // Don't push if belt entry is occupied
      const entryBlocked = belt.items.some(item => item.progress < 0.3);
      if (entryBlocked) continue;

      // Pull from output slot
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

  // ── Helpers ───────────────────────────────────────────────

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
