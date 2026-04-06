// ============================================================
//  src/engine/systems/PlayerSystem.ts
//  Handles keyboard/mouse input → player movement + gathering.
//
//  Harvest model (v2 — feature-based):
//    • LMB held on a feature tile OR Space bar held starts a timed harvest.
//    • A HarvestProgress entry is written to PlayerState so the Renderer
//      can draw a progress bar over the target tile.
//    • Completing the bar gives 1 unit of the feature's yieldsItemId.
//    • Moving cancels the current harvest.
//    • If LMB/Space is still held after completion, the harvest restarts
//      immediately on the same tile (hold-to-mine loop).
//    • Depletion uses GameConfig.RESOURCE_DEPLETION_ENABLED / featureDef.infinite.
// ============================================================

import { sm }           from "@engine/core/StateManager";
import { registry }     from "@engine/core/Registry";
import { panelManager } from "@engine/core/PanelManager";
import { bus }          from "@engine/core/EventBus";
import { GameConfig }   from "@engine/core/GameConfig";
import { CursorMode }   from "@t/state";
import type { Chunk, FeatureState } from "@t/state";

const DEFAULT_HARVEST_MS = 3000;

/**
 * Keys that are always forwarded to the movement set regardless
 * of whether any UI panel is currently open.
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
  private readonly keys = new Set<string>();
  private mouseHeld     = false;
  private feedbackUI: GatherFeedbackReceiver | null = null;

  constructor() {
    window.addEventListener("keydown", e => {
      if (MOVEMENT_KEYS.has(e.key)) {
        this.keys.add(e.key);
        return;
      }
      // Space triggers harvest regardless of open panels (same as LMB)
      if (e.key === " ") {
        e.preventDefault();
        this.keys.add(e.key);
        if (!sm.state.player.harvestProgress) this.tryStartHarvest();
        return;
      }
      if (panelManager.isAnyPanelOpen()) return;
      this.keys.add(e.key);
    });

    window.addEventListener("keyup", e => this.keys.delete(e.key));

    window.addEventListener("mousedown", e => {
      if (e.button === 0 && (e.target as HTMLElement).tagName === "CANVAS") {
        this.mouseHeld = true;
        this.tryStartHarvest();
      }
    });

    window.addEventListener("mouseup", e => {
      if (e.button === 0) {
        this.mouseHeld = false;
        // Cancel any in-progress harvest
        sm.state.player.harvestProgress = null;
      }
    });
  }

  setFeedbackUI(ui: GatherFeedbackReceiver): void {
    this.feedbackUI = ui;
  }

  update(deltaMs: number): void {
    this.updateMovement(deltaMs);
    this.updateHarvest(deltaMs);
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

  // ── Harvest ───────────────────────────────────────────────

  private updateHarvest(deltaMs: number): void {
    const isActionHeld = this.mouseHeld || this.keys.has(" ");

    // Cancel if action released or wrong cursor mode
    if (!isActionHeld || sm.state.player.cursorMode !== CursorMode.None) {
      sm.state.player.harvestProgress = null;
      return;
    }

    // Space bar start — mousedown already handles LMB start
    if (this.keys.has(" ") && !sm.state.player.harvestProgress) {
      this.tryStartHarvest();
      return;
    }

    const prog = sm.state.player.harvestProgress;
    if (!prog) return;

    // Cancel if the player has drifted off the harvest tile
    const { tx, ty } = this.getTileUnderPlayer();
    if (tx !== prog.tx || ty !== prog.ty) {
      sm.state.player.harvestProgress = null;
      return;
    }

    // Cancel if the feature has disappeared (extractor beat us to it)
    const fi = this.getFeatureAt(prog.tx, prog.ty);
    if (!fi) {
      sm.state.player.harvestProgress = null;
      return;
    }

    prog.elapsedMs += deltaMs;

    if (prog.elapsedMs >= prog.totalMs) {
      this.completeHarvest(prog.tx, prog.ty);
      sm.state.player.harvestProgress = null;

      // Still holding — restart on the same tile if the feature still exists
      if (isActionHeld) {
        this.tryStartHarvest();
      }
    }
  }

  private tryStartHarvest(): void {
    if (sm.state.player.cursorMode !== CursorMode.None) return;

    const { tx, ty } = this.getTileUnderPlayer();
    const fi = this.getFeatureAt(tx, ty);
    if (!fi) return;

    const featureDef = registry.findFeature(fi.featureState.featureId);
    if (!featureDef) return;

    const totalMs = featureDef.harvestTimeMs ?? DEFAULT_HARVEST_MS;
    sm.state.player.harvestProgress = { tx, ty, elapsedMs: 0, totalMs };
  }

  private completeHarvest(tx: number, ty: number): void {
    const fi = this.getFeatureAt(tx, ty);
    if (!fi) return;

    const featureDef = registry.findFeature(fi.featureState.featureId);
    if (!featureDef) return;

    const overflow = sm.givePlayerItem(featureDef.yieldsItemId, 1);
    if (overflow > 0) {
      bus.emit("ui:notification", { message: "Inventory full!", severity: "warn" });
    } else {
      const itemName = featureDef.yieldsItemId.replace(/_/g, " ");
      this.feedbackUI?.showGatherFeedback(itemName, 1);
    }

    // Deplete the node
    if (GameConfig.RESOURCE_DEPLETION_ENABLED && !featureDef.infinite) {
      fi.featureState.remainingYield -= 1;
      if (fi.featureState.remainingYield <= 0) {
        delete fi.chunk.features![fi.localKey];
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────

  private getTileUnderPlayer(): { tx: number; ty: number } {
    const T  = GameConfig.TILE_SIZE;
    const { x, y } = sm.state.player.pos;
    return {
      tx: Math.floor(x / T),
      ty: Math.floor(y / T),
    };
  }

  private getFeatureAt(tx: number, ty: number): {
    chunk:        Chunk;
    localKey:     string;
    featureState: FeatureState;
  } | null {
    const CS = GameConfig.CHUNK_SIZE;
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

  destroy(): void {}
}
