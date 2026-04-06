// ============================================================
//  src/engine/systems/TechSystem.ts
//
//  Manages the RAM tech-tree unlock flow.
//
//  canUnlock(techId) — pure predicate; safe to call any time.
//  unlock(techId)    — deducts RAM, merges unlocks into state,
//                      emits events.  Returns true on success.
//
//  This system holds no state of its own; all authoritative data
//  lives in sm.state (GameState).
// ============================================================

import { registry } from "@engine/core/Registry";
import { sm }       from "@engine/core/StateManager";
import { bus }      from "@engine/core/EventBus";

export class TechSystem {
  /**
   * Returns true when all of these are satisfied:
   *   • `techId` exists in the Registry
   *   • the tech has NOT already been unlocked
   *   • the player has at least `tech.cost` RAM
   */
  canUnlock(techId: string): boolean {
    const tech = registry.findTech(techId);
    if (!tech) return false;
    if (sm.state.unlockedTechs.includes(techId)) return false;
    return sm.state.ram >= tech.cost;
  }

  /**
   * Attempts to unlock a technology.
   *
   * On success:
   *   • Deducts `tech.cost` from `sm.state.ram`
   *   • Pushes `techId` into `sm.state.unlockedTechs`
   *   • Merges `tech.unlocksRecipeIds` into `sm.state.unlockedRecipeIds`
   *   • Merges `tech.unlocksDoodadIds` into `sm.state.unlockedDoodadIds`
   *   • Merges `tech.unlocksSystemFlags` into `sm.state.unlockedSystemFlags`
   *   • Emits "tech:unlocked" and "ram:changed" bus events
   *
   * Returns true on success, false if canUnlock() failed.
   */
  unlock(techId: string): boolean {
    if (!this.canUnlock(techId)) return false;

    const tech = registry.getTech(techId);

    sm.state.ram -= tech.cost;
    sm.state.unlockedTechs.push(techId);

    for (const id of tech.unlocksRecipeIds) {
      if (!sm.state.unlockedRecipeIds.includes(id)) {
        sm.state.unlockedRecipeIds.push(id);
      }
    }

    for (const id of tech.unlocksDoodadIds) {
      if (!sm.state.unlockedDoodadIds.includes(id)) {
        sm.state.unlockedDoodadIds.push(id);
      }
    }

    for (const flag of tech.unlocksSystemFlags) {
      if (!sm.state.unlockedSystemFlags.includes(flag)) {
        sm.state.unlockedSystemFlags.push(flag);
      }
    }

    bus.emit("tech:unlocked", { techId });
    bus.emit("ram:changed",   { ram: sm.state.ram });

    console.info(
      `[TechSystem] Unlocked "${tech.name}". ` +
      `RAM remaining: ${sm.state.ram}. ` +
      `Recipes: +${tech.unlocksRecipeIds.length}, ` +
      `Doodads: +${tech.unlocksDoodadIds.length}.`,
    );

    return true;
  }
}
