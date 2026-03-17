// ============================================================
//  src/engine/rendering/Renderer.ts
//  Canvas 2D renderer.
//  Phase 3 additions:
//   - Build mode grid overlay
//   - Placement ghost (green = valid, red = blocked)
// ============================================================

import { sm }       from "@engine/core/StateManager";
import { registry } from "@engine/core/Registry";
import { GameConfig } from "@engine/core/GameConfig";
import type { Tile } from "@t/state";

// BuildSystem is imported as a type-only interface to avoid circular deps.
// Renderer only calls .lastPlacementValid and .validate() on it.
export interface IBuildSystem {
  lastPlacementValid: boolean;
  validate(origin: { tx: number; ty: number }, w: number, h: number): boolean;
}

// rotatedFootprint duplicated here so Renderer has no @engine/systems import
function rotatedFP(w: number, h: number, rot: number) {
  return (rot % 2 === 0) ? { w, h } : { w: h, h: w };
}

const T = GameConfig.TILE_SIZE;

const TILE_COLORS: Record<string, string> = {
  void:       "#0a0a0a",
  ground:     "#2a2a1e",
  rubble:     "#3d3830",
  water:      "#0d2a3d",
  ore_iron:   "#3d2a1e",
  ore_copper: "#3d2a0d",
  ore_coal:   "#1a1a1a",
  organic:    "#1a2a0d",
};

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx:    CanvasRenderingContext2D;

  cameraX = 0;
  cameraY = 0;

  /** Injected by main.ts after BuildSystem is created. */
  buildSystem: IBuildSystem | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get 2D context");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
  }

  resize(w: number, h: number): void {
    this.canvas.width  = w;
    this.canvas.height = h;
  }

  render(): void {
    const { ctx } = this;
    const { width: W, height: H } = this.canvas;

    const px = sm.state.player.pos.x;
    const py = sm.state.player.pos.y;
    this.cameraX = px - W / 2;
    this.cameraY = py - H / 2;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(-this.cameraX, -this.cameraY);

    this.renderTiles();
    this.renderDoodads();
    this.renderPlayer();

    const inBuildMode = sm.state.player.heldItemId !== null;
    if (inBuildMode) {
      this.renderGridOverlay();
      this.renderGhost();
    }

    ctx.restore();

    this.renderHUD();
  }

  // ── Tiles ─────────────────────────────────────────────────

  private renderTiles(): void {
    const { ctx } = this;
    const CS = GameConfig.CHUNK_SIZE;

    for (const chunk of Object.values(sm.state.chunks)) {
      if (!chunk.generated) continue;
      for (let ty = 0; ty < CS; ty++) {
        for (let tx = 0; tx < CS; tx++) {
          const tile: Tile | undefined = chunk.tiles[ty]?.[tx];
          if (!tile) continue;
          const wx = (chunk.cx * CS + tx) * T;
          const wy = (chunk.cy * CS + ty) * T;
          if (!this.inView(wx, wy, T, T)) continue;
          ctx.fillStyle = TILE_COLORS[tile.type] ?? "#ff00ff";
          ctx.fillRect(wx, wy, T, T);
        }
      }
    }
  }

  // ── Doodads ───────────────────────────────────────────────

  private renderDoodads(): void {
    const { ctx } = this;

    for (const doodad of Object.values(sm.state.doodads)) {
      const def = registry.findDoodad(doodad.defId);
      if (!def) continue;

      // Use actual stored rotation for rendering size
      const fp = rotatedFP(def.footprint.w, def.footprint.h, doodad.rotation);
      const wx = doodad.origin.tx * T;
      const wy = doodad.origin.ty * T;
      const pw = fp.w * T;
      const ph = fp.h * T;

      if (!this.inView(wx, wy, pw, ph)) continue;

      ctx.fillStyle = def.sprite.startsWith("#") ? def.sprite : "#666";
      ctx.fillRect(wx + 2, wy + 2, pw - 4, ph - 4);

      ctx.strokeStyle = "#aaa";
      ctx.lineWidth = 1;
      ctx.strokeRect(wx + 2, wy + 2, pw - 4, ph - 4);

      if (doodad.crafting) {
        const recipe = registry.findRecipe(doodad.crafting.recipeId);
        if (recipe) {
          const pct = Math.min(doodad.crafting.elapsedMs / recipe.craftingTime, 1);
          ctx.fillStyle = "#0f0";
          ctx.fillRect(wx + 4, wy + ph - 8, (pw - 8) * pct, 4);
        }
      }

      ctx.fillStyle = "#eee";
      ctx.font = `${Math.max(8, T * 0.3)}px monospace`;
      ctx.fillText(def.name, wx + 4, wy + 14);
    }
  }

  // ── Player ────────────────────────────────────────────────

  private renderPlayer(): void {
    const { ctx } = this;
    const { x, y } = sm.state.player.pos;
    const S = T * 0.8;

    ctx.fillStyle = "#00e5ff";
    ctx.beginPath();
    ctx.arc(x, y, S / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // ── Build Mode: Grid Overlay ──────────────────────────────

  private renderGridOverlay(): void {
    const { ctx } = this;
    const { width: W, height: H } = this.canvas;

    // Compute first visible tile coords in world space
    const startX = Math.floor(this.cameraX / T) * T;
    const startY = Math.floor(this.cameraY / T) * T;

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 0.5;

    ctx.beginPath();
    for (let wx = startX; wx < this.cameraX + W + T; wx += T) {
      ctx.moveTo(wx, this.cameraY);
      ctx.lineTo(wx, this.cameraY + H);
    }
    for (let wy = startY; wy < this.cameraY + H + T; wy += T) {
      ctx.moveTo(this.cameraX,     wy);
      ctx.lineTo(this.cameraX + W, wy);
    }
    ctx.stroke();
  }

  // ── Build Mode: Ghost ─────────────────────────────────────

  private renderGhost(): void {
    const { ctx } = this;
    const { heldItemId, placementRotation, cursorWorldPos } = sm.state.player;
    if (!heldItemId) return;

    const def = registry.findDoodad(heldItemId);
    if (!def) return;

    const fp   = rotatedFP(def.footprint.w, def.footprint.h, placementRotation);
    const originTx = Math.floor(cursorWorldPos.x / T) - Math.floor(fp.w / 2);
    const originTy = Math.floor(cursorWorldPos.y / T) - Math.floor(fp.h / 2);

    const wx = originTx * T;
    const wy = originTy * T;
    const pw = fp.w * T;
    const ph = fp.h * T;

    const valid = this.buildSystem?.lastPlacementValid ?? false;

    // Ghost fill
    ctx.fillStyle = valid
      ? "rgba(0, 255, 80, 0.18)"
      : "rgba(255, 40, 40, 0.22)";
    ctx.fillRect(wx, wy, pw, ph);

    // Ghost border
    ctx.strokeStyle = valid
      ? "rgba(0, 255, 80, 0.7)"
      : "rgba(255, 40, 40, 0.7)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(wx + 0.5, wy + 0.5, pw - 1, ph - 1);

    // Sprite colour tint
    const spriteColor = def.sprite.startsWith("#") ? def.sprite : "#666";
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = spriteColor;
    ctx.fillRect(wx + 3, wy + 3, pw - 6, ph - 6);
    ctx.globalAlpha = 1;

    // Label
    ctx.fillStyle = valid ? "rgba(0,255,80,0.9)" : "rgba(255,80,80,0.9)";
    ctx.font = "9px monospace";
    ctx.fillText(def.name, wx + 4, wy + 12);
  }

  // ── HUD ───────────────────────────────────────────────────

  private renderHUD(): void {
    const { ctx } = this;
    const { x, y } = sm.state.player.pos;

    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(8, 8, 220, 44);
    ctx.fillStyle = "#00e5ff";
    ctx.font = "11px monospace";
    ctx.fillText("DIGITIZED OVERSEER", 14, 24);
    ctx.fillStyle = "#aaa";
    ctx.fillText(`POS  ${Math.round(x)}, ${Math.round(y)}`, 14, 40);
  }

  // ── Helpers ───────────────────────────────────────────────

  private inView(wx: number, wy: number, w: number, h: number): boolean {
    const { width: W, height: H } = this.canvas;
    return (
      wx + w > this.cameraX &&
      wy + h > this.cameraY &&
      wx < this.cameraX + W &&
      wy < this.cameraY + H
    );
  }
}
