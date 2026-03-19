// ============================================================
//  src/engine/systems/DoodadInteractionSystem.ts
//
//  Finds the nearest interactable doodad each frame.
//  A doodad is interactable if its DoodadDef has interactable:true
//  OR its machineTag is "storage".
//  Pressing F emits "doodad:interact" for UI panels to handle.
// ============================================================

import { sm }           from "@engine/core/StateManager";
import { registry }     from "@engine/core/Registry";
import { bus }          from "@engine/core/EventBus";
import { GameConfig }   from "@engine/core/GameConfig";
import { panelManager } from "@engine/core/PanelManager";

const T = GameConfig.TILE_SIZE;
const INTERACT_RANGE_PX = T * 3.5;

export class DoodadInteractionSystem {
  nearestInteractableId: string | null = null;
  private fPressed = false;

  constructor() {
    window.addEventListener("keydown", e => {
      if (e.key === "f" || e.key === "F") {
        if (panelManager.isAnyPanelOpen()) return;
        e.preventDefault();
        this.fPressed = true;
      }
    });
  }

  update(_deltaMs: number): void {
    this.nearestInteractableId = this.findNearest();

    if (this.fPressed) {
      this.fPressed = false;
      if (this.nearestInteractableId) {
        const doodad = sm.getDoodad(this.nearestInteractableId);
        if (doodad) {
          bus.emit("doodad:interact", { doodadId: doodad.id, defId: doodad.defId });
        }
      }
    }
  }

  private isInteractable(defId: string): boolean {
    const def = registry.findDoodad(defId);
    if (!def) return false;
    // Interactable if flagged explicitly OR is a storage machine
    return def.interactable === true || def.machineTag === "storage";
  }

  private findNearest(): string | null {
    const { x: px, y: py } = sm.state.player.pos;
    let best: string | null = null;
    let bestDist = Infinity;

    for (const doodad of sm.allDoodads()) {
      if (!this.isInteractable(doodad.defId)) continue;

      const def = registry.findDoodad(doodad.defId)!;
      const dcx = (doodad.origin.tx + def.footprint.w / 2) * T;
      const dcy = (doodad.origin.ty + def.footprint.h / 2) * T;
      const dist = Math.hypot(px - dcx, py - dcy);

      if (dist < INTERACT_RANGE_PX && dist < bestDist) {
        bestDist = dist;
        best = doodad.id;
      }
    }
    return best;
  }
}
