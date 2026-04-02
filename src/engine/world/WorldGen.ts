// ============================================================
//  src/engine/world/WorldGen.ts
//  Procedural chunk generator using seeded value noise.
//  Generates on demand as the player explores.
// ============================================================

import type { Chunk, Tile, TileType } from "@t/state";
import { GameConfig } from "@engine/core/GameConfig";
import { sm } from "@engine/core/StateManager";
import { bus } from "@engine/core/EventBus";

// ── Seeded LCG ────────────────────────────────────────────────

function lcg(s: number): number {
  return ((Math.imul(1664525, s) + 1013904223) >>> 0) / 0xffffffff;
}

function hashCoord(seed: number, x: number, y: number): number {
  const s = (seed ^ (x * 73856093) ^ (y * 19349663)) >>> 0;
  return lcg(s);
}

// ── 2D Value Noise (bilinear interpolation) ───────────────────

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(wx: number, wy: number, seed: number, scale: number): number {
  const fx = wx / scale;
  const fy = wy / scale;

  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = x0 + 1;
  const y1 = y0 + 1;

  const tx = smoothstep(fx - x0);
  const ty = smoothstep(fy - y0);

  const v00 = hashCoord(seed, x0, y0);
  const v10 = hashCoord(seed, x1, y0);
  const v01 = hashCoord(seed, x0, y1);
  const v11 = hashCoord(seed, x1, y1);

  const top    = v00 + tx * (v10 - v00);
  const bottom = v01 + tx * (v11 - v01);
  return top + ty * (bottom - top);
}

// ── Tile generation ───────────────────────────────────────────

function generateTile(wx: number, wy: number, seed: number): Tile {
  // Base terrain shape
  const baseNoise  = valueNoise(wx, wy, seed, 8);

  // Water: single large-scale layer — big coherent blobs, rare
  // Scale 18 means blobs are ~18 tiles across, well-connected
  const waterNoise = valueNoise(wx, wy, seed ^ 0xAABBCCDD, 18);

  // Each ore type has its own completely independent noise layer
  // so their patches are spatially decoupled and never touch
  const coalNoise   = valueNoise(wx, wy, seed ^ 0xDEADBEEF, 3);
  const ironNoise   = valueNoise(wx, wy, seed ^ 0xBEEFCAFE, 3);
  const copperNoise = valueNoise(wx, wy, seed ^ 0xFACEFEED, 3);

  // ── Water (highest priority) ───────────────────────────────
  // Single blob threshold — no ribbons, no fragmentation
  if (waterNoise < 0.13) {
    return { type: "water", doodadId: null, passable: false };
  }

  // ── Rubble on low base terrain ─────────────────────────────
  if (baseNoise < 0.12) {
    return { type: "rubble", doodadId: null, passable: true };
  }

  // ── Ore patches (only on solid mid/high terrain) ───────────
  // Independent layers: patches are spatially separate by nature.
  // else-if chain prevents any single tile being two ore types.
  if (baseNoise > 0.25) {
    if      (coalNoise   > 0.83) { return { type: "ore_coal",   doodadId: null, passable: true }; }
    else if (ironNoise   > 0.83) { return { type: "ore_iron",   doodadId: null, passable: true }; }
    else if (copperNoise > 0.83) { return { type: "ore_copper", doodadId: null, passable: true }; }
  }

  // ── Organic on high terrain ────────────────────────────────
  if (baseNoise > 0.72) {
    return { type: "organic", doodadId: null, passable: true };
  }

  return { type: "ground", doodadId: null, passable: true };
}

// ── WorldGen class ────────────────────────────────────────────

export class WorldGen {
  generateChunk(cx: number, cy: number): Chunk {
    const CS = GameConfig.CHUNK_SIZE;
    const seed = sm.state.worldSeed;

    const tiles: Tile[][] = [];
    for (let ty = 0; ty < CS; ty++) {
      tiles[ty] = [];
      for (let tx = 0; tx < CS; tx++) {
        const wx = cx * CS + tx;
        const wy = cy * CS + ty;
        tiles[ty]![tx] = generateTile(wx, wy, seed);
      }
    }

    const chunk: Chunk = { cx, cy, tiles, generated: true };
    sm.setChunk(chunk);
    bus.emit("chunk:generated", { cx, cy });
    return chunk;
  }

  /** Ensure all chunks within radius of a world-pos are generated. */
  ensureChunksAround(worldX: number, worldY: number, radiusChunks: number): void {
    const T = GameConfig.TILE_SIZE;
    const CS = GameConfig.CHUNK_SIZE;
    const cx = Math.floor(worldX / (T * CS));
    const cy = Math.floor(worldY / (T * CS));

    for (let dy = -radiusChunks; dy <= radiusChunks; dy++) {
      for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
        const ccx = cx + dx;
        const ccy = cy + dy;
        if (!sm.getChunk(ccx, ccy)) {
          this.generateChunk(ccx, ccy);
        }
      }
    }
  }
}