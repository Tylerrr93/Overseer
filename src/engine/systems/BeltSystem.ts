// ============================================================
//  src/engine/systems/BeltSystem.ts
//
//  Each frame, advances all items on all belts.
//  When an item reaches progress=1 it tries to hand off to the
//  next belt segment. If blocked it stalls at progress=1.
//
//  Backpressure propagates naturally: a stalled belt at the end
//  of a chain prevents items from advancing off the previous
//  belt, which stalls that belt, and so on upstream.
// ============================================================

import { sm }         from "@engine/core/StateManager";
import { GameConfig } from "@engine/core/GameConfig";
import { DIR_DELTA }  from "@engine/utils/portUtils";
import type { BeltSegment } from "@t/state";

const BELT_MAX_ITEMS = 4;

export class BeltSystem {
  update(deltaMs: number): void {
    // Process belts as a snapshot — avoid mutating while iterating
    const belts = Object.values(sm.state.belts);

    for (const belt of belts) {
      this.advanceBelt(belt, deltaMs);
    }
  }

  private advanceBelt(belt: BeltSegment, deltaMs: number): void {
    const speed = GameConfig.BELT_ITEMS_PER_SECOND * deltaMs / 1000;

    for (let i = belt.items.length - 1; i >= 0; i--) {
      const item = belt.items[i];
      if (!item) continue;

      // Don't advance if a previous item in front is blocking
      // Items are stored in travel order: index 0 = entry, last = exit
      // We iterate from last (exit end) backwards so front items resolve first
      const isAtExit = item.progress >= 1;

      if (!isAtExit) {
        item.progress = Math.min(1, item.progress + speed);
      }

      // Try to hand off if at the exit
      if (item.progress >= 1) {
        const delta = DIR_DELTA[belt.direction];
        const nextTx = belt.origin.tx + delta.dx;
        const nextTy = belt.origin.ty + delta.dy;
        const nextBelt = sm.getBeltAt(nextTx, nextTy);

        if (nextBelt && nextBelt.items.length < BELT_MAX_ITEMS) {
          // Hand off: remove from this belt, add to next
          belt.items.splice(i, 1);
          nextBelt.items.unshift({ stack: item.stack, progress: 0 });
        } else {
          // Stall: clamp at exactly 1
          item.progress = 1;
        }
      }
    }
  }
}
