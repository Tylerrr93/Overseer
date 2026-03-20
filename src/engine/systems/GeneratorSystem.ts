// ============================================================
//  src/engine/systems/GeneratorSystem.ts
//
//  Manages fuel burning inside generator doodads.
//  Each frame:
//   - If fuelBurn.remainingMs > 0  → decrement by deltaMs (generator active)
//   - If fuelBurn.remainingMs <= 0 → try to consume next fuel item
//   - No fuel available            → generator becomes inactive
//
//  PowerSystem reads generator activity to compute supply.
// ============================================================

import { sm }       from "@engine/core/StateManager";
import { registry } from "@engine/core/Registry";

/** ms of generator output per unit of each fuel item. */
const FUEL_BURN_MS: Record<string, number> = {
  coal:       5000,  // 5 seconds per coal
  carbon_rod: 12000, // 12 seconds per carbon rod (processed fuel)
};
const DEFAULT_BURN_MS = 5000;

export class GeneratorSystem {
  update(deltaMs: number): void {
    for (const doodad of sm.allDoodads()) {
      const def = registry.findDoodad(doodad.defId);
      if (!def?.powerGeneration || def.powerGeneration <= 0) continue;
      this.tickGenerator(doodad, deltaMs, def);
    }
  }

  private tickGenerator(
    doodad:  ReturnType<typeof sm.allDoodads>[number],
    deltaMs: number,
    def:     ReturnType<typeof registry.findDoodad> & object,
  ): void {
    // ── Active burn: decrement remaining time ─────────────
    if (doodad.fuelBurn && doodad.fuelBurn.remainingMs > 0) {
      doodad.fuelBurn.remainingMs -= deltaMs;
      return; // still burning — nothing else to do this frame
    }

    // ── Burn expired or never started: consume next fuel ──
    const fuelSlotIdx = this.findFuelSlot(doodad, def.slots);
    if (fuelSlotIdx === -1) {
      // No fuel — generator goes dark
      doodad.fuelBurn = null;
      return;
    }

    const slot = doodad.inventory[fuelSlotIdx]!;
    const burnMs = FUEL_BURN_MS[slot.itemId] ?? DEFAULT_BURN_MS;

    // Consume 1 fuel item
    slot.qty -= 1;
    if (slot.qty <= 0) doodad.inventory[fuelSlotIdx] = null;

    doodad.fuelBurn = { remainingMs: burnMs, totalMs: burnMs };
  }

  /** Returns index of first fuel slot that has items, or -1. */
  private findFuelSlot(
    doodad:   ReturnType<typeof sm.allDoodads>[number],
    slotDefs: ReturnType<typeof registry.getDoodad>["slots"],
  ): number {
    for (let i = 0; i < slotDefs.length; i++) {
      const sd = slotDefs[i];
      if (!sd || sd.role !== "fuel") continue;
      const slot = doodad.inventory[i];
      if (slot && slot.qty > 0) return i;
    }
    return -1;
  }

  /** True if the generator is currently producing power this frame. */
  static isActive(doodad: ReturnType<typeof sm.allDoodads>[number]): boolean {
    return doodad.fuelBurn !== null && doodad.fuelBurn.remainingMs > 0;
  }
}
