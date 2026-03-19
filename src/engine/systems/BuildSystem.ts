// ============================================================
//  src/engine/systems/BuildSystem.ts
//
//  Responsibilities:
//   • Track mouse → world-space cursor (accounting for camera)
//   • R key → rotate held doodad
//   • Left click → validate + place doodad
//   • Escape / Right-click → exit build mode
//   • Expose canPlace() for the Renderer to colour the ghost
// ============================================================

import { sm }           from "@engine/core/StateManager";
import { panelManager } from "@engine/core/PanelManager";
import { registry }   from "@engine/core/Registry";
import { bus }        from "@engine/core/EventBus";
import { GameConfig } from "@engine/core/GameConfig";
import type { Renderer } from "@engine/rendering/Renderer";
import type { DoodadDef } from "@t/content";
import type { TilePos }   from "@t/state";
import { rotationToDir }  from "@engine/utils/portUtils";

const T  = GameConfig.TILE_SIZE;
const CS = GameConfig.CHUNK_SIZE;

// ── UUID (inline, no dep) ─────────────────────────────────────

function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Rotation helpers ──────────────────────────────────────────

/** Effective footprint dimensions after rotation (0 & 2 = original, 1 & 3 = swapped). */
export function rotatedFootprint(def: DoodadDef, rotation: number): { w: number; h: number } {
  return (rotation % 2 === 0)
    ? { w: def.footprint.w, h: def.footprint.h }
    : { w: def.footprint.h, h: def.footprint.w };
}

/** Convert world-pixel cursor to the top-left tile of the ghost footprint. */
function cursorToOrigin(worldX: number, worldY: number, fw: number, fh: number): TilePos {
  // Centre the ghost on the cursor tile
  const cursorTx = Math.floor(worldX / T);
  const cursorTy = Math.floor(worldY / T);
  return {
    tx: cursorTx - Math.floor(fw / 2),
    ty: cursorTy - Math.floor(fh / 2),
  };
}

// ─────────────────────────────────────────────────────────────

export class BuildSystem {
  /** Cached result of last validation — Renderer reads this. */
  lastPlacementValid = false;

  private renderer: Renderer;

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    this.bindEvents();
  }

  // ── Event bindings ────────────────────────────────────────

  private bindEvents(): void {
    // Mouse move → update world cursor
    window.addEventListener("mousemove", e => this.onMouseMove(e));

    // Left click → place (handled here; gathering is in PlayerSystem)
    window.addEventListener("mousedown", e => {
      if (e.button === 0 && !panelManager.isAnyPanelOpen()) this.onLeftClick();
    });

    // Right click → cancel build mode
    window.addEventListener("contextmenu", e => {
      if (sm.state.player.heldItemId && !panelManager.isAnyPanelOpen()) {
        e.preventDefault();
        this.exitBuildMode();
      }
    });

    window.addEventListener("keydown", e => {
      switch (e.key) {
        case "r":
        case "R":
          if (sm.state.player.heldItemId) {
            sm.state.player.placementRotation =
              (sm.state.player.placementRotation + 1) % 4;
          }
          break;
        case "Escape":
          this.exitBuildMode();
          break;
      }
    });
  }

  // ── Per-frame update ──────────────────────────────────────

  update(_deltaMs: number): void {
    const { heldItemId } = sm.state.player;
    if (!heldItemId) {
      this.lastPlacementValid = false;
      return;
    }
    const def = registry.findDoodad(heldItemId);
    if (!def) { this.lastPlacementValid = false; return; }

    const { cursorWorldPos, placementRotation } = sm.state.player;
    const fp     = rotatedFootprint(def, placementRotation);
    const origin = cursorToOrigin(cursorWorldPos.x, cursorWorldPos.y, fp.w, fp.h);

    this.lastPlacementValid = this.validate(origin, fp.w, fp.h);
  }

  // ── Mouse move ────────────────────────────────────────────

  private onMouseMove(e: MouseEvent): void {
    // Screen-space → world-space (undo the camera translate)
    const worldX = e.clientX + this.renderer.cameraX;
    const worldY = e.clientY + this.renderer.cameraY;
    sm.updateCursorWorld(worldX, worldY);
  }

  // ── Left click → place ────────────────────────────────────

  private onLeftClick(): void {
    const { heldItemId, placementRotation, cursorWorldPos } = sm.state.player;
    if (!heldItemId) return;

    const def = registry.findDoodad(heldItemId);
    if (!def) return;

    const fp     = rotatedFootprint(def, placementRotation);
    const origin = cursorToOrigin(cursorWorldPos.x, cursorWorldPos.y, fp.w, fp.h);

    if (!this.validate(origin, fp.w, fp.h)) {
      bus.emit("ui:notification", { message: "Cannot place here.", severity: "warn" });
      return;
    }

    // Build the instance
    const id = uuidv4();

    // Belts get a dual entry: doodad record (for tile blocking/rendering)
    // + belt record (for logistics simulation).
    if (heldItemId === "belt_straight") {
      sm.addDoodad({
        id,
        defId:             heldItemId,
        origin,
        rotation:          placementRotation,
        inventory:         [],
        crafting:          null,
        powered:           true,
        tickAccumulatorMs: 0,
        pinnedRecipeId:    null,
      });
      sm.addBelt({
        id,
        origin,
        direction: rotationToDir(placementRotation),
        items:     [],
      });
    } else {
      sm.addDoodad({
        id,
        defId:             heldItemId,
        origin,
        rotation:          placementRotation,
        inventory:         def.slots.map(() => null),
        crafting:          null,
        powered:           def.powerDraw === 0,
        tickAccumulatorMs: 0,
        pinnedRecipeId:    null,
      });
    }

    // Link tiles → doodad (prevents overlap)
    this.stampTiles(origin, fp.w, fp.h, id);

    bus.emit("ui:notification", { message: `Placed ${def.name}.`, severity: "info" });
  }

  // ── Validation ────────────────────────────────────────────

  /**
   * Returns true iff the w×h footprint at `origin` can be placed:
   *  1. Every tile is in a generated chunk.
   *  2. Every tile is passable (not water/void).
   *  3. No tile is already occupied by another doodad.
   */
  validate(origin: TilePos, w: number, h: number): boolean {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const tile = this.getTile(origin.tx + dx, origin.ty + dy);
        if (!tile)            return false; // chunk not generated
        if (!tile.passable)   return false; // water / void
        if (tile.doodadId)    return false; // already occupied
      }
    }
    return true;
  }

  // ── Tile stamping ─────────────────────────────────────────

  private stampTiles(origin: TilePos, w: number, h: number, doodadId: string): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const tile = this.getTile(origin.tx + dx, origin.ty + dy);
        if (tile) tile.doodadId = doodadId;
      }
    }
  }

  /** Clear tile links when a doodad is removed (future use). */
  clearTiles(origin: TilePos, w: number, h: number): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const tile = this.getTile(origin.tx + dx, origin.ty + dy);
        if (tile) tile.doodadId = null;
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

  private exitBuildMode(): void {
    sm.state.player.heldItemId = null;
    sm.state.player.placementRotation = 0;
  }
}
