// ============================================================
//  src/engine/systems/PlayerSystem.ts
//  Handles keyboard/mouse input → player movement + gathering.
//
//  Uses a GatherFeedback interface so the engine doesn't
//  import from @game — dependency stays one-way.
// ============================================================

import { sm }           from "@engine/core/StateManager";
import { panelManager } from "@engine/core/PanelManager";
import { bus }        from "@engine/core/EventBus";
import { GameConfig } from "@engine/core/GameConfig";
import type { TileType } from "@t/state";

// ── Tile → item mapping ───────────────────────────────────────

const TILE_TO_ITEM: Partial<Record<TileType, string>> = {
  ore_iron:   "iron_ore",
  ore_copper: "copper_ore",
  ore_coal:   "coal",
  organic:    "organic_matter",
  rubble:     "scrap_metal",
};

const GATHER_COOLDOWN_MS = 600;

/**
 * Keys that are always forwarded to the movement set regardless
 * of whether any UI panel is currently open.  This lets the player
 * navigate the world while viewing the inventory, build menu, etc.
 */
const MOVEMENT_KEYS = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "w", "W", "a", "A", "s", "S", "d", "D",
]);

/** Minimal interface — avoids importing the concrete InventoryUI class. */
export interface GatherFeedbackReceiver {
  showGatherFeedback(itemName: string, qty: number): void;
}

// ─────────────────────────────────────────────────────────────

export class PlayerSystem {
  private readonly keys    = new Set<string>();
  private gatherCooldownMs = 0;
  private feedbackUI: GatherFeedbackReceiver | null = null;

  constructor() {
    window.addEventListener("keydown", e => {
      // Movement keys always work — the player should be able to
      // navigate the world even while an inventory / build panel
      // is open.  All other keys (Space gather, build shortcuts,
      // etc.) remain gated by the panel check below.
      if (MOVEMENT_KEYS.has(e.key)) {
        this.keys.add(e.key);
        return;
      }

      // Non-movement keys are consumed by open panels.
      if (panelManager.isAnyPanelOpen()) return;

      this.keys.add(e.key);
      if (e.key === " ") e.preventDefault();
    });

    window.addEventListener("keyup", e => this.keys.delete(e.key));

    window.addEventListener("mousedown", e => {
      if (e.button === 0 && (e.target as HTMLElement).tagName === "CANVAS") this.tryGather();
    });
    
  }

  /** Wire up any object that can show gather feedback. */
  setFeedbackUI(ui: GatherFeedbackReceiver): void {
    this.feedbackUI = ui;
  }

  update(deltaMs: number): void {
    this.updateMovement(deltaMs);
    this.updateGather(deltaMs);
  }

  // ── Movement ─────────────────────────────────────────────

  private updateMovement(deltaMs: number): void {
    const dt  = deltaMs / 1000;
    const spd = sm.state.player.speed;
    const { x, y } = sm.state.player.pos;
    let dx = 0, dy = 0;

    if (this.keys.has("ArrowUp")    || this.keys.has("w") || this.keys.has("W")) dy -= 1;
    if (this.keys.has("ArrowDown")  || this.keys.has("s") || this.keys.has("S")) dy += 1;
    if (this.keys.has("ArrowLeft")  || this.keys.has("a") || this.keys.has("A")) dx -= 1;
    if (this.keys.has("ArrowRight") || this.keys.has("d") || this.keys.has("D")) dx += 1;

    if (dx !== 0 && dy !== 0) {
      const INV_SQRT2 = 0.7071;
      dx *= INV_SQRT2;
      dy *= INV_SQRT2;
    }

    sm.movePlayer(x + dx * spd * dt, y + dy * spd * dt);
  }

  // ── Gather ───────────────────────────────────────────────

  private updateGather(deltaMs: number): void {
    if (this.gatherCooldownMs > 0) {
      this.gatherCooldownMs -= deltaMs;
    }
    if (this.keys.has(" ") && this.gatherCooldownMs <= 0) {
      this.tryGather();
    }
  }

  private tryGather(): void {
    if (this.gatherCooldownMs > 0) return;

    const tile = this.getTileUnderPlayer();
    if (!tile) return;

    const itemId = TILE_TO_ITEM[tile.type];
    if (!itemId) return;

    const overflow = sm.givePlayerItem(itemId, 1);
    if (overflow > 0) {
      bus.emit("ui:notification", { message: "Inventory full!", severity: "warn" });
    } else {
      // inventory:changed is now emitted inside givePlayerItem(); the
      // feedback toast is still shown here for the gather animation.
      const itemName = itemId.replace(/_/g, " ");
      this.feedbackUI?.showGatherFeedback(itemName, 1);
    }

    this.gatherCooldownMs = GATHER_COOLDOWN_MS;
  }

  // ── Tile lookup ───────────────────────────────────────────

  private getTileUnderPlayer() {
    const T  = GameConfig.TILE_SIZE;
    const CS = GameConfig.CHUNK_SIZE;

    const { x, y } = sm.state.player.pos;
    const tx = Math.floor(x / T);
    const ty = Math.floor(y / T);
    const cx = Math.floor(tx / CS);
    const cy = Math.floor(ty / CS);

    const chunk = sm.getChunk(cx, cy);
    if (!chunk) return null;

    const lx = ((tx % CS) + CS) % CS;
    const ly = ((ty % CS) + CS) % CS;

    return chunk.tiles[ly]?.[lx] ?? null;
  }

  destroy(): void {}
}
