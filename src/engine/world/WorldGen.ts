// ============================================================
//  src/engine/world/WorldGen.ts
//  Procedural chunk generator using seeded value noise.
//  Generates on demand as the player explores.
//
//  v2 (feature system):
//    - Base terrain is desolate: ground, rock, rubble, irradiated, water.
//    - No ore tiles are generated.  Resource nodes are placed as
//      FeatureState entries on top of the terrain in a separate pass.
//    - Feature IDs are strings from the game content layer; WorldGen
//      only knows them via the Registry so the engine boundary holds.
// ============================================================

import type { Chunk, Tile, TileType, FeatureState } from "@t/state";
import { GameConfig } from "@engine/core/GameConfig";
import { registry }   from "@engine/core/Registry";
import { sm }         from "@engine/core/StateManager";
import { bus }        from "@engine/core/EventBus";

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

// ── Base terrain generation ───────────────────────────────────
//  All terrain is post-apocalyptic desolation.
//  No ore tile types are ever written here — those live in features.

function generateTile(wx: number, wy: number, seed: number): Tile {
  // Large-scale shape noise — landscape height analogue
  const baseNoise  = valueNoise(wx, wy, seed, 10);

  // Water bodies: large coherent blobs
  const waterNoise = valueNoise(wx, wy, seed ^ 0xAABBCCDD, 20);

  // Irradiated zones: mid-scale patches
  const radNoise   = valueNoise(wx, wy, seed ^ 0xCAFEBABE, 14);

  // Water (highest priority — rare, large pools)
  if (waterNoise < 0.10) {
    return { type: "water", doodadId: null, passable: false };
  }

  // Irradiated craters / hot zones — impassable in spirit but still walkable
  if (radNoise > 0.86 && baseNoise > 0.3) {
    return { type: "irradiated", doodadId: null, passable: true };
  }

  // Exposed bedrock / collapsed structures
  if (baseNoise < 0.18) {
    return { type: "rock", doodadId: null, passable: true };
  }

  // Rubble fields — low terrain
  if (baseNoise < 0.30) {
    return { type: "rubble", doodadId: null, passable: true };
  }

  // Sparse organic growth on higher ground
  if (baseNoise > 0.78) {
    return { type: "organic", doodadId: null, passable: true };
  }

  // Everything else: blasted ground
  return { type: "ground", doodadId: null, passable: true };
}

// ── Feature scatter pass ──────────────────────────────────────
//
//  Each registered FeatureDef gets its own seeded noise layer.
//  Tiles that cross RESOURCE_SPARSITY threshold become the centre
//  of a small deposit cluster (radius ≤ RESOURCE_CLUSTER_SIZE).
//
//  We iterate every tile in the chunk and check its world-noise
//  value.  The cluster logic works by comparing the tile against
//  the peak noise in its neighbourhood — only the local maximum
//  actually spawns the feature (prevents solid walls of nodes).

function generateFeatures(
  cx: number,
  cy: number,
  seed: number,
): Record<string, FeatureState> {
  const CS       = GameConfig.CHUNK_SIZE;
  const sparsity = GameConfig.RESOURCE_SPARSITY;
  const cluster  = GameConfig.RESOURCE_CLUSTER_SIZE;
  const baseYield = GameConfig.RESOURCE_BASE_YIELD;

  const features: Record<string, FeatureState> = {};

  // Build a stable list of feature defs so the iteration order is
  // deterministic (Map.values() order matches insertion order in V8).
  const featureDefs = [...registry.allFeatures().values()];
  if (featureDefs.length === 0) return features;

  for (let ly = 0; ly < CS; ly++) {
    for (let lx = 0; lx < CS; lx++) {
      const wx = cx * CS + lx;
      const wy = cy * CS + ly;

      for (const def of featureDefs) {
        // Each feature uses a unique noise seed derived from its id hash
        // so different resource types never perfectly overlap.
        const fSeed = (seed ^ strHash(def.id)) >>> 0;
        const n = valueNoise(wx, wy, fSeed, 6);

        if (n < sparsity) continue;

        // Local maximum check — only place if this tile is the peak
        // within a cluster × cluster neighbourhood.
        let isLocalMax = true;
        outerLoop:
        for (let dy = -cluster; dy <= cluster; dy++) {
          for (let dx = -cluster; dx <= cluster; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (valueNoise(wx + dx, wy + dy, fSeed, 6) > n) {
              isLocalMax = false;
              break outerLoop;
            }
          }
        }
        if (!isLocalMax) continue;

        // Scatter cluster tiles around the peak
        for (let dy = -cluster; dy <= cluster; dy++) {
          for (let dx = -cluster; dx <= cluster; dx++) {
            const nlx = lx + dx;
            const nly = ly + dy;
            // Only write tiles that belong to this chunk
            if (nlx < 0 || nlx >= CS || nly < 0 || nly >= CS) continue;

            // Distance-based probability: tiles near the centre are
            // always placed; outer ring tiles use a per-tile hash coin flip.
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > cluster) continue;
            const density = 1 - dist / (cluster + 1);
            if (hashCoord(fSeed, wx + dx, wy + dy) > density) continue;

            // Skip if another (higher-priority) feature already claimed the tile
            const key = `${nlx},${nly}`;
            if (features[key]) continue;

            const yield_ = def.infinite ? 0 : Math.round(
              baseYield * (0.7 + 0.6 * hashCoord(seed, wx + dx, wy + dy)),
            );

            features[key] = { featureId: def.id, remainingYield: yield_ };
          }
        }
      }
    }
  }

  return features;
}

/** Simple non-cryptographic string → uint32 hash (djb2 variant). */
function strHash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return h;
}

// ── WorldGen class ────────────────────────────────────────────

export class WorldGen {
  generateChunk(cx: number, cy: number): Chunk {
    const CS   = GameConfig.CHUNK_SIZE;
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

    const features = generateFeatures(cx, cy, seed);

    const chunk: Chunk = { cx, cy, tiles, generated: true, features };
    sm.setChunk(chunk);
    bus.emit("chunk:generated", { cx, cy });
    return chunk;
  }

  /** Ensure all chunks within radius of a world-pos are generated. */
  ensureChunksAround(worldX: number, worldY: number, radiusChunks: number): void {
    const T  = GameConfig.TILE_SIZE;
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
