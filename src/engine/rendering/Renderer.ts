// ============================================================
//  src/engine/rendering/Renderer.ts
//  Canvas 2D renderer.  Phase 1 uses coloured rectangles for
//  all sprites; real spritesheets slot in later without
//  changing the interface.
// ============================================================

import { sm } from "@engine/core/StateManager";
import { registry } from "@engine/core/Registry";
import { GameConfig } from "@engine/core/GameConfig";
import type { Tile } from "@t/state";

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

  /** Camera world-space position (top-left of viewport in px). */
  cameraX = 0;
  cameraY = 0;

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

    // Track camera to player
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

          // Frustum cull
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
    const CS = GameConfig.CHUNK_SIZE;

    for (const doodad of Object.values(sm.state.doodads)) {
      const def = registry.findDoodad(doodad.defId);
      if (!def) continue;

      const wx = doodad.origin.tx * T;
      const wy = doodad.origin.ty * T;
      const pw = def.footprint.w * T;
      const ph = def.footprint.h * T;

      if (!this.inView(wx, wy, pw, ph)) continue;

      // Placeholder: colour rect + label
      ctx.fillStyle = def.sprite.startsWith("#") ? def.sprite : "#666";
      ctx.fillRect(wx + 2, wy + 2, pw - 4, ph - 4);

      ctx.strokeStyle = "#aaa";
      ctx.lineWidth = 1;
      ctx.strokeRect(wx + 2, wy + 2, pw - 4, ph - 4);

      // Crafting progress bar
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

  // ── HUD ───────────────────────────────────────────────────

  private renderHUD(): void {
    const { ctx } = this;
    const { x, y } = sm.state.player.pos;

    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(8, 8, 220, 44);
    ctx.fillStyle = "#00e5ff";
    ctx.font = "11px monospace";
    ctx.fillText(`DIGITIZED OVERSEER`, 14, 24);
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
