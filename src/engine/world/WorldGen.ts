// ============================================================
//  src/engine/world/WorldGen.ts
//  Procedural chunk generator using a seeded LCG RNG.
//  Generates on demand as the player explores.
// ============================================================

import type { Chunk, Tile, TileType } from "@types/state";
import { GameConfig } from "@engine/core/GameConfig";
import { sm } from "@engine/core/StateManager";
import { bus } from "@engine/core/EventBus";

// ── Tiny seeded RNG (LCG) ─────────────────────────────────────

function seededRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// ── Noise helper (value noise, 1-octave) ─────────────────────

function valueFbm(x: number, y: number, seed: number): number {
  const rng = seededRng(seed ^ (x * 73856093) ^ (y * 19349663));
  return rng();
}

// ── Tile generation ───────────────────────────────────────────

function generateTile(wx: number, wy: number, seed: number): Tile {
  const noise = valueFbm(wx, wy, seed);

  let type: TileType;
  let passable = true;

  if (noise < 0.08) {
    type = "water";
    passable = false;
  } else if (noise < 0.22) {
    type = "rubble";
  } else if (noise < 0.65) {
    type = "ground";
  } else if (noise < 0.72) {
    type = "organic";
  } else if (noise < 0.78) {
    type = "ore_coal";
  } else if (noise < 0.84) {
    type = "ore_iron";
  } else if (noise < 0.88) {
    type = "ore_copper";
  } else {
    type = "void";
    passable = false;
  }

  return { type, doodadId: null, passable };
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
