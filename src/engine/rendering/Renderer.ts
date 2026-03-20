// ============================================================
//  src/engine/rendering/Renderer.ts
//  Phase 4 update:
//   - Port indicators on all placed doodads (green=out, blue=in)
//   - Ghost shows port indicators + belt direction arrow
//   - Belt chevrons + item interpolation
// ============================================================

import { sm }         from "@engine/core/StateManager";
import { registry }   from "@engine/core/Registry";
import { GameConfig } from "@engine/core/GameConfig";
import type { Tile }  from "@t/state";
import { DIR_DELTA, rotateDir, rotationToDir } from "@engine/utils/portUtils";

export interface IBuildSystem {
  lastPlacementValid: boolean;
  validate(origin: { tx: number; ty: number }, w: number, h: number): boolean;
}

export interface IPowerSystem {
  nodeConnections: { ax: number; ay: number; bx: number; by: number }[];
  attachments:     { mx: number; my: number; nx: number; ny: number; powered: boolean }[];
}

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

// Port indicator colours
const PORT_OUT_COLOR = "rgba(0, 255, 100, 0.85)";
const PORT_IN_COLOR  = "rgba(80, 160, 255, 0.85)";
const PORT_SIZE      = 5;

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx:    CanvasRenderingContext2D;

  cameraX = 0;
  cameraY = 0;

  buildSystem: IBuildSystem | null = null;
  powerSystem: IPowerSystem | null = null;
  /** Show power grid when true (Alt held) or when placing power_node. */
  private showPowerGrid = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get 2D context");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;

    // Track Alt key for power grid overlay
    window.addEventListener("keydown", e => { if (e.key === "Alt") { e.preventDefault(); this.showPowerGrid = true; } });
    window.addEventListener("keyup",   e => { if (e.key === "Alt") this.showPowerGrid = false; });
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
    this.renderBelts();
    this.renderBeltItems();
    this.renderPowerGrid();
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
      // Belts are rendered separately
      if (def.id === "belt_straight") continue;

      const fp = rotatedFP(def.footprint.w, def.footprint.h, doodad.rotation);
      const wx = doodad.origin.tx * T;
      const wy = doodad.origin.ty * T;
      const pw = fp.w * T;
      const ph = fp.h * T;

      if (!this.inView(wx, wy, pw, ph)) continue;

      // Body
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

      // Label
      ctx.fillStyle = "#eee";
      ctx.font = `${Math.max(8, T * 0.28)}px monospace`;
      ctx.fillText(def.name, wx + 4, wy + 13);

      // Port indicators
      this.renderPortIndicators(wx, wy, def.ports, def.footprint.w, def.footprint.h, doodad.rotation, false);
    }
  }

  // ── Port indicators ───────────────────────────────────────

  /**
   * Draws a small colored square on each port edge.
   * Green = output, Blue = input.
   * `ghost` = true renders them semi-transparent.
   */
  private renderPortIndicators(
    originWx: number, originWy: number,
    ports: import("@t/content").DoodadPort[],
    defW: number, defH: number,
    rotation: number,
    ghost: boolean,
  ): void {
    const { ctx } = this;
    ctx.globalAlpha = ghost ? 0.7 : 1.0;

    for (const port of ports) {
      // Rotate port offset
      let rdx: number, rdy: number;
      switch (rotation) {
        case 1:  rdx = defH - 1 - port.dy; rdy = port.dx;              break;
        case 2:  rdx = defW - 1 - port.dx; rdy = defH - 1 - port.dy;   break;
        case 3:  rdx = port.dy;             rdy = defW - 1 - port.dx;   break;
        default: rdx = port.dx;             rdy = port.dy;               break;
      }

      const facingDir = rotateDir(port.dir, rotation);
      const delta = DIR_DELTA[facingDir];

      // Tile world position of port
      const ptWx = originWx + rdx * T;
      const ptWy = originWy + rdy * T;

      // Place indicator on the edge of the tile facing outward
      const ex = ptWx + T / 2 + delta.dx * (T / 2 - PORT_SIZE / 2 - 1);
      const ey = ptWy + T / 2 + delta.dy * (T / 2 - PORT_SIZE / 2 - 1);

      ctx.fillStyle = port.role === "output" ? PORT_OUT_COLOR : PORT_IN_COLOR;
      ctx.fillRect(ex - PORT_SIZE / 2, ey - PORT_SIZE / 2, PORT_SIZE, PORT_SIZE);

      // Arrow pointing in the direction items flow
      this.drawPortArrow(ex, ey, facingDir, port.role === "output", ghost);
    }

    ctx.globalAlpha = 1.0;
  }

  private drawPortArrow(
    cx: number, cy: number,
    dir: import("@t/content").CardinalDir,
    isOutput: boolean,
    ghost: boolean,
  ): void {
    const { ctx } = this;
    const a = 4; // arrow arm length
    // Output: arrow points outward. Input: arrow points inward.
    const d = DIR_DELTA[dir];
    const flip = isOutput ? 1 : -1;

    ctx.strokeStyle = isOutput ? PORT_OUT_COLOR : PORT_IN_COLOR;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = ghost ? 0.6 : 0.95;
    ctx.beginPath();
    // Shaft
    ctx.moveTo(cx - d.dx * a * flip, cy - d.dy * a * flip);
    ctx.lineTo(cx + d.dx * a * flip, cy + d.dy * a * flip);
    // Arrowhead: two lines perpendicular
    const px = d.dy, py = -d.dx; // perpendicular
    ctx.moveTo(cx + d.dx * a * flip, cy + d.dy * a * flip);
    ctx.lineTo(cx + (d.dx - px * 0.5) * a * flip, cy + (d.dy - py * 0.5) * a * flip);
    ctx.moveTo(cx + d.dx * a * flip, cy + d.dy * a * flip);
    ctx.lineTo(cx + (d.dx + px * 0.5) * a * flip, cy + (d.dy + py * 0.5) * a * flip);
    ctx.stroke();
    ctx.globalAlpha = 1.0;
  }

  // ── Belts ─────────────────────────────────────────────────

  private renderBelts(): void {
    const { ctx } = this;

    for (const belt of Object.values(sm.state.belts)) {
      const wx = belt.origin.tx * T;
      const wy = belt.origin.ty * T;
      if (!this.inView(wx, wy, T, T)) continue;

      // Belt base
      ctx.fillStyle = "#3a2e14";
      ctx.fillRect(wx + 1, wy + 1, T - 2, T - 2);

      // Lane stripes
      ctx.fillStyle = "#4a3e1e";
      const isNS = belt.direction === "N" || belt.direction === "S";
      if (isNS) {
        ctx.fillRect(wx + T * 0.3, wy + 1, T * 0.12, T - 2);
        ctx.fillRect(wx + T * 0.58, wy + 1, T * 0.12, T - 2);
      } else {
        ctx.fillRect(wx + 1, wy + T * 0.3, T - 2, T * 0.12);
        ctx.fillRect(wx + 1, wy + T * 0.58, T - 2, T * 0.12);
      }

      // Direction chevron
      this.drawBeltChevron(wx, wy, belt.direction);
    }
  }

  private drawBeltChevron(wx: number, wy: number, dir: import("@t/content").CardinalDir): void {
    const { ctx } = this;
    const cx = wx + T / 2;
    const cy = wy + T / 2;
    const arm = T * 0.2;

    ctx.strokeStyle = "#d4a030";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    switch (dir) {
      case "N": ctx.moveTo(cx - arm, cy + arm); ctx.lineTo(cx, cy - arm); ctx.lineTo(cx + arm, cy + arm); break;
      case "E": ctx.moveTo(cx - arm, cy - arm); ctx.lineTo(cx + arm, cy); ctx.lineTo(cx - arm, cy + arm); break;
      case "S": ctx.moveTo(cx - arm, cy - arm); ctx.lineTo(cx, cy + arm); ctx.lineTo(cx + arm, cy - arm); break;
      case "W": ctx.moveTo(cx + arm, cy - arm); ctx.lineTo(cx - arm, cy); ctx.lineTo(cx + arm, cy + arm); break;
    }
    ctx.stroke();
  }

  // ── Belt items ────────────────────────────────────────────

  private renderBeltItems(): void {
    const { ctx } = this;
    const ITEM_SIZE = T * 0.36;

    for (const belt of Object.values(sm.state.belts)) {
      if (belt.items.length === 0) continue;
      const wx = belt.origin.tx * T;
      const wy = belt.origin.ty * T;
      if (!this.inView(wx, wy, T, T)) continue;

      const delta  = DIR_DELTA[belt.direction];
      const startX = wx + T / 2;
      const startY = wy + T / 2;
      const endX   = startX + delta.dx * T;
      const endY   = startY + delta.dy * T;

      for (const entry of belt.items) {
        const p  = Math.min(entry.progress, 1);
        const ix = startX + (endX - startX) * p;
        const iy = startY + (endY - startY) * p;

        const def   = registry.findItem(entry.stack.itemId);
        const color = def?.sprite.startsWith("#") ? def.sprite : "#aaa";

        ctx.fillStyle = color;
        ctx.fillRect(ix - ITEM_SIZE / 2, iy - ITEM_SIZE / 2, ITEM_SIZE, ITEM_SIZE);
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(ix - ITEM_SIZE / 2, iy - ITEM_SIZE / 2, ITEM_SIZE, ITEM_SIZE);
      }
    }
  }

  // ── Power grid overlay ───────────────────────────────────

  private renderPowerGrid(): void {
    if (!this.powerSystem) return;

    // Show when Alt held OR when placing/hovering a power_node
    const heldId  = sm.state.player.heldItemId;
    const heldDef = heldId ? registry.findDoodad(heldId) : null;
    const holdingNode = heldDef?.id === "power_node";

    if (!this.showPowerGrid && !holdingNode) return;

    const { ctx } = this;

    // Node-to-node connections (same network) — cyan lines
    ctx.strokeStyle = "rgba(0, 229, 255, 0.35)";
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 4]);
    for (const conn of this.powerSystem.nodeConnections) {
      ctx.beginPath();
      ctx.moveTo(conn.ax, conn.ay);
      ctx.lineTo(conn.bx, conn.by);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Machine/generator → node attachment lines
    // Powered = yellow, unpowered = red-orange
    for (const att of this.powerSystem.attachments) {
      ctx.strokeStyle = att.powered
        ? "rgba(255, 220, 0, 0.45)"
        : "rgba(255, 80, 0, 0.35)";
      ctx.lineWidth = 0.75;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(att.mx, att.my);
      ctx.lineTo(att.nx, att.ny);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Power node icons — small diamond
    for (const doodad of Object.values(sm.state.doodads)) {
      const def = registry.findDoodad(doodad.defId);
      if (!def || def.id !== "power_node") continue;
      const wx = (doodad.origin.tx + 0.5) * T;
      const wy = (doodad.origin.ty + 0.5) * T;
      if (!this.inView(wx - T, wy - T, T * 2, T * 2)) continue;

      const r = T * 0.28;
      ctx.fillStyle = "rgba(0, 229, 255, 0.7)";
      ctx.strokeStyle = "rgba(0, 229, 255, 0.9)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(wx,     wy - r);
      ctx.lineTo(wx + r, wy);
      ctx.lineTo(wx,     wy + r);
      ctx.lineTo(wx - r, wy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Radius ring (faint)
      const def2 = registry.getDoodad(doodad.defId);
      const radiusPx = (def2.powerRadius ?? 4) * T;
      ctx.strokeStyle = "rgba(0, 229, 255, 0.08)";
      ctx.lineWidth   = 0.5;
      ctx.beginPath();
      ctx.arc(wx, wy, radiusPx, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Generator status — green glow when active
    for (const doodad of Object.values(sm.state.doodads)) {
      const def = registry.findDoodad(doodad.defId);
      if (!def?.powerGeneration) continue;
      const fp  = def.footprint;
      const wx  = (doodad.origin.tx + fp.w / 2) * T;
      const wy  = (doodad.origin.ty + fp.h / 2) * T;
      const isActive = doodad.fuelBurn !== null &&
                       doodad.fuelBurn !== undefined &&
                       (doodad.fuelBurn as { remainingMs: number }).remainingMs > 0;
      if (!isActive) continue;
      // Pulse ring
      ctx.strokeStyle = "rgba(80, 255, 120, 0.5)";
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.arc(wx, wy, T * 0.6, 0, Math.PI * 2);
      ctx.stroke();
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

  // ── Build mode: grid overlay ──────────────────────────────

  private renderGridOverlay(): void {
    const { ctx } = this;
    const { width: W, height: H } = this.canvas;
    const startX = Math.floor(this.cameraX / T) * T;
    const startY = Math.floor(this.cameraY / T) * T;

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let wx = startX; wx < this.cameraX + W + T; wx += T) {
      ctx.moveTo(wx, this.cameraY); ctx.lineTo(wx, this.cameraY + H);
    }
    for (let wy = startY; wy < this.cameraY + H + T; wy += T) {
      ctx.moveTo(this.cameraX, wy); ctx.lineTo(this.cameraX + W, wy);
    }
    ctx.stroke();
  }

  // ── Build mode: ghost ─────────────────────────────────────

  private renderGhost(): void {
    const { ctx } = this;
    const { heldItemId, placementRotation, cursorWorldPos } = sm.state.player;
    if (!heldItemId) return;

    const def = registry.findDoodad(heldItemId);
    if (!def) return;

    const fp       = rotatedFP(def.footprint.w, def.footprint.h, placementRotation);
    const originTx = Math.floor(cursorWorldPos.x / T) - Math.floor(fp.w / 2);
    const originTy = Math.floor(cursorWorldPos.y / T) - Math.floor(fp.h / 2);
    const wx = originTx * T;
    const wy = originTy * T;
    const pw = fp.w * T;
    const ph = fp.h * T;

    const valid = this.buildSystem?.lastPlacementValid ?? false;

    // Ghost fill
    ctx.fillStyle = valid ? "rgba(0,255,80,0.15)" : "rgba(255,40,40,0.2)";
    ctx.fillRect(wx, wy, pw, ph);

    // Ghost border
    ctx.strokeStyle = valid ? "rgba(0,255,80,0.7)" : "rgba(255,40,40,0.7)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(wx + 0.5, wy + 0.5, pw - 1, ph - 1);

    // Sprite tint
    const spriteColor = def.sprite.startsWith("#") ? def.sprite : "#666";
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = spriteColor;
    ctx.fillRect(wx + 3, wy + 3, pw - 6, ph - 6);
    ctx.globalAlpha = 1;

    // Label
    ctx.fillStyle = valid ? "rgba(0,255,80,0.9)" : "rgba(255,80,80,0.9)";
    ctx.font = "9px monospace";
    ctx.fillText(def.name, wx + 4, wy + 12);

    // Ghost port indicators (shows player where ports will be)
    if (def.ports.length > 0) {
      this.renderPortIndicators(wx, wy, def.ports, def.footprint.w, def.footprint.h, placementRotation, true);
    }

    // Belt ghost: draw the direction chevron so player knows before placing
    if (heldItemId === "belt_straight") {
      const beltDir = rotationToDir(placementRotation);
      this.drawBeltChevron(wx, wy, beltDir);
    }
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
      wx + w > this.cameraX && wy + h > this.cameraY &&
      wx < this.cameraX + W && wy < this.cameraY + H
    );
  }
}
