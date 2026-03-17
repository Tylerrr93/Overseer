// ============================================================
//  src/engine/systems/PlayerSystem.ts
//  Handles keyboard/touch input → player movement.
// ============================================================

import { sm } from "@engine/core/StateManager";

export class PlayerSystem {
  private readonly keys = new Set<string>();

  constructor() {
    window.addEventListener("keydown", e => this.keys.add(e.key));
    window.addEventListener("keyup",   e => this.keys.delete(e.key));
  }

  update(deltaMs: number): void {
    const dt  = deltaMs / 1000; // seconds
    const spd = sm.state.player.speed;
    let { x, y } = sm.state.player.pos;
    let dx = 0, dy = 0;

    if (this.keys.has("ArrowUp")    || this.keys.has("w") || this.keys.has("W")) dy -= 1;
    if (this.keys.has("ArrowDown")  || this.keys.has("s") || this.keys.has("S")) dy += 1;
    if (this.keys.has("ArrowLeft")  || this.keys.has("a") || this.keys.has("A")) dx -= 1;
    if (this.keys.has("ArrowRight") || this.keys.has("d") || this.keys.has("D")) dx += 1;

    // Normalise diagonal
    if (dx !== 0 && dy !== 0) {
      const INV_SQRT2 = 0.7071;
      dx *= INV_SQRT2;
      dy *= INV_SQRT2;
    }

    sm.movePlayer(x + dx * spd * dt, y + dy * spd * dt);
  }

  destroy(): void {
    // Cleanup if needed
  }
}
