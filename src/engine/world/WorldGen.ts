// ============================================================
//  src/engine/world/WorldGen.ts
//  Procedural chunk generator — v3 (biomes + roads + structures)
//
//  Noise layer stack (back → front priority):
//
//    macroNoise   (scale 80)  — city/ruins vs rural/wasteland biomes.
//                               Values > CITY_THRESHOLD produce dense
//                               urban zones with roads and structures.
//
//    waterNoise   (scale 20)  — large coherent water bodies (highest
//                               priority — roads and structures never
//                               spawn on water).
//
//    radNoise     (scale 14)  — irradiated crater zones.
//
//    ridgeHighway (scale 50)  — ridge noise that carves long, winding
//                               highway corridors connecting city blobs.
//                               Active across ALL biomes.
//
//    ridgeStreet  (scale 18)  — finer ridge noise for local streets.
//                               Only active inside city biomes.
//
//    baseNoise    (scale 10)  — base terrain shape (rock / rubble /
//                               ground / organic) used as a fallback
//                               inside non-road, non-structure tiles.
//
//  Pass order per chunk:
//    1. Tile pass   — generateTile() applies all noise layers to each tile.
//    2. Structure pass — stamps StructureDef blueprints from the Registry
//                        into city-biome local-maxima, writes DoodadStates.
//    3. Feature pass  — scatters resource nodes, skipping roads/walls/water.
// ============================================================

import type { Chunk, Tile, FeatureState, TileType, DoodadState } from "@t/state";
import { GameConfig } from "@engine/core/GameConfig";
import { registry }   from "@engine/core/Registry";
import { sm }         from "@engine/core/StateManager";
import { bus }        from "@engine/core/EventBus";

// ── Seeded LCG + hash ─────────────────────────────────────────

function lcg(s: number): number {
  return ((Math.imul(1664525, s) + 1013904223) >>> 0) / 0xffffffff;
}

function hashCoord(seed: number, x: number, y: number): number {
  const s = (seed ^ (x * 73856093) ^ (y * 19349663)) >>> 0;
  return lcg(s);
}

/** Simple non-cryptographic string → uint32 hash (djb2 variant). */
function strHash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return h;
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

/**
 * Ridge noise — transforms value noise into sharp linear ridges.
 * Output is 1.0 at the ridge centre and falls toward 0 at the flanks.
 * formula:  1 - |2n - 1|   (spike at n = 0.5 of the underlying noise)
 */
function ridgeNoise(wx: number, wy: number, seed: number, scale: number): number {
  const n = valueNoise(wx, wy, seed, scale);
  return 1.0 - Math.abs(2 * n - 1);
}

// ── Noise seeds & thresholds ──────────────────────────────────
//  Each layer uses a unique bitwise XOR of the world seed so that
//  different resources and biomes never perfectly co-locate.

const SEED_WATER    = 0xAABBCCDD;
const SEED_RAD      = 0xCAFEBABE;
const SEED_MACRO    = 0xDEADBEEF;  // city / rural macro-biome
const SEED_HIGHWAY  = 0x12345678;  // highway ridge corridors
const SEED_STREET   = 0x87654321;  // local-street ridge network

// Noise scales
const SCALE_BASE    = 10;
const SCALE_WATER   = 20;
const SCALE_RAD     = 14;
const SCALE_MACRO   = 80;
const SCALE_HIGHWAY = 50;
const SCALE_STREET  = 18;

// Biome threshold — macroNoise > this is "city / ruins" territory
const CITY_THRESHOLD = 0.52;

// Road thresholds (ridge noise 0–1, higher = narrower corridor)
const HIGHWAY_THRESHOLD        = 0.90;  // all biomes — main arteries
const HIGHWAY_CENTRE_THRESHOLD = 0.93;  // sub-threshold for centre-line tile
const STREET_THRESHOLD         = 0.87;  // city only — local streets

// Tile types that block feature spawning
const ROAD_AND_RUIN_TYPES = new Set<TileType>([
  "asphalt_clean", "asphalt_cracked", "highway_line",
  "ruin_floor",    "ruined_wall",     "water",
]);

// ── Tile generation ───────────────────────────────────────────

function generateTile(wx: number, wy: number, seed: number): Tile {
  const baseNoise    = valueNoise(wx, wy, seed,                    SCALE_BASE);
  const waterNoise   = valueNoise(wx, wy, (seed ^ SEED_WATER) >>> 0, SCALE_WATER);
  const radNoise     = valueNoise(wx, wy, (seed ^ SEED_RAD)   >>> 0, SCALE_RAD);
  const macroNoise   = valueNoise(wx, wy, (seed ^ SEED_MACRO)  >>> 0, SCALE_MACRO);
  const rHighway     = ridgeNoise(wx, wy, (seed ^ SEED_HIGHWAY) >>> 0, SCALE_HIGHWAY);
  const rStreet      = ridgeNoise(wx, wy, (seed ^ SEED_STREET)  >>> 0, SCALE_STREET);

  const isCity = macroNoise > CITY_THRESHOLD;

  // ── Water (highest priority — no roads or structures here) ──
  if (waterNoise < 0.10) {
    return { type: "water", doodadId: null, passable: false };
  }

  // ── Irradiated zones ─────────────────────────────────────────
  if (radNoise > 0.86 && baseNoise > 0.3) {
    return { type: "irradiated", doodadId: null, passable: true };
  }

  // ── Highways (cross all non-water biomes) ────────────────────
  //  Highways override rock / rubble / organic but never water.
  //  Centre tiles get the highway_line tile; flanks get asphalt_clean.
  if (rHighway > HIGHWAY_THRESHOLD) {
    const type: TileType = rHighway > HIGHWAY_CENTRE_THRESHOLD
      ? "highway_line"
      : "asphalt_clean";
    return { type, doodadId: null, passable: true };
  }

  // ── Local streets (city biome only) ──────────────────────────
  if (isCity && rStreet > STREET_THRESHOLD) {
    return { type: "asphalt_cracked", doodadId: null, passable: true };
  }

  // ── City biome terrain ────────────────────────────────────────
  //  More rubble and collapsed structures than the open wasteland.
  //  Higher ground resolves to ruin_floor — the ghostly imprint of
  //  flattened buildings.
  if (isCity) {
    if (baseNoise < 0.20) return { type: "rock",       doodadId: null, passable: true  };
    if (baseNoise < 0.42) return { type: "rubble",     doodadId: null, passable: true  };
    return                       { type: "ruin_floor", doodadId: null, passable: true  };
  }

  // ── Rural / wasteland terrain ─────────────────────────────────
  if (baseNoise < 0.18) return { type: "rock",     doodadId: null, passable: true };
  if (baseNoise < 0.30) return { type: "rubble",   doodadId: null, passable: true };
  if (baseNoise > 0.78) return { type: "organic",  doodadId: null, passable: true };
  return                       { type: "ground",   doodadId: null, passable: true };
}

// ── Structure placement pass ──────────────────────────────────
//
//  Finds local macro-noise peaks inside city biomes and stamps
//  StructureDef blueprints from the Registry onto the tile grid.
//  Pre-placed doodads are written directly into sm.state.doodads
//  using deterministic world-position IDs ("wgen_<wx>_<wy>").
//
//  Rules:
//   • Structures never overlap water tiles or each other.
//   • Structures with requiresRoad: true must have at least one
//     road tile adjacent to their bounding-box perimeter.
//   • Only the top-left tile of a multi-tile doodad carries the
//     doodadId; the engine marks its full footprint as impassable.

function generateStructures(
  cx: number,
  cy: number,
  seed: number,
  tiles: Tile[][],
): DoodadState[] {
  const CS         = GameConfig.CHUNK_SIZE;
  const structDefs = [...registry.allStructures().values()];
  if (structDefs.length === 0) return [];

  const macroSeed  = (seed ^ SEED_MACRO) >>> 0;

  const placed  = new Set<string>();   // "lx,ly" keys already stamped
  const doodads: DoodadState[] = [];

  // ── Step 1: find candidate positions (city-zone local maxima) ─
  //  We sample every STEP tiles and retain local maxima within a
  //  RADIUS neighbourhood.  This keeps candidate density low enough
  //  to avoid over-building while letting 1–2 structures fit per chunk.

  const STEP   = 5;
  const RADIUS = 6;

  type Candidate = { lx: number; ly: number; macroN: number };
  const candidates: Candidate[] = [];

  for (let ly = 0; ly < CS; ly += STEP) {
    for (let lx = 0; lx < CS; lx += STEP) {
      const wx     = cx * CS + lx;
      const wy     = cy * CS + ly;
      const macroN = valueNoise(wx, wy, macroSeed, SCALE_MACRO);

      // Only dense city zones qualify
      if (macroN < CITY_THRESHOLD + 0.06) continue;

      // Skip water tiles
      if (tiles[ly]?.[lx]?.type === "water") continue;

      // Local maximum within RADIUS
      let isMax = true;
      outer:
      for (let dy = -RADIUS; dy <= RADIUS; dy += STEP) {
        for (let dx = -RADIUS; dx <= RADIUS; dx += STEP) {
          if (dx === 0 && dy === 0) continue;
          if (valueNoise(wx + dx, wy + dy, macroSeed, SCALE_MACRO) > macroN) {
            isMax = false;
            break outer;
          }
        }
      }
      if (!isMax) continue;

      candidates.push({ lx, ly, macroN });
    }
  }

  // ── Step 2: place a structure at each candidate ──────────────

  for (const { lx, ly, macroN } of candidates) {
    const wx = cx * CS + lx;
    const wy = cy * CS + ly;

    // Filter eligible structures (tag + minCityNoise gate)
    const eligible = structDefs.filter(d =>
      (d.minCityNoise ?? 0.60) <= macroN,
    );
    if (eligible.length === 0) continue;

    // Deterministic structure selection per candidate
    const pick      = hashCoord((seed ^ 0xABCDABCD) >>> 0, wx, wy);
    const structDef = eligible[Math.floor(pick * eligible.length)]!;

    // Centre structure on candidate
    const originLx = lx - Math.floor(structDef.width  / 2);
    const originLy = ly - Math.floor(structDef.height / 2);

    // Reject if bounding box leaves this chunk
    if (
      originLx < 0 || originLy < 0 ||
      originLx + structDef.width  > CS ||
      originLy + structDef.height > CS
    ) continue;

    // Validate every blueprint tile: no water, no already-placed tile
    let valid = true;
    for (const stile of structDef.tiles) {
      const tlx = originLx + stile.dx;
      const tly = originLy + stile.dy;
      if (placed.has(`${tlx},${tly}`)) { valid = false; break; }
      if (tiles[tly]?.[tlx]?.type === "water") { valid = false; break; }
    }
    if (!valid) continue;

    // Road-adjacency check (perimeter scan)
    if (structDef.requiresRoad) {
      let roadFound = false;
      outerRoad:
      for (let dy = -1; dy <= structDef.height; dy++) {
        for (let dx = -1; dx <= structDef.width; dx++) {
          // Skip interior cells
          if (dy > 0 && dy < structDef.height - 1 &&
              dx > 0 && dx < structDef.width  - 1) continue;
          const tlx = originLx + dx;
          const tly = originLy + dy;
          if (tlx < 0 || tlx >= CS || tly < 0 || tly >= CS) continue;
          const tt = tiles[tly]?.[tlx]?.type;
          if (tt === "asphalt_clean" || tt === "asphalt_cracked" || tt === "highway_line") {
            roadFound = true;
            break outerRoad;
          }
        }
      }
      if (!roadFound) continue;
    }

    // ── Stamp blueprint ─────────────────────────────────────────
    for (const stile of structDef.tiles) {
      const tlx     = originLx + stile.dx;
      const tly     = originLy + stile.dy;
      const isWall  = stile.terrain === "ruined_wall";
      const tileKey = `${tlx},${tly}`;

      tiles[tly]![tlx] = {
        type:     stile.terrain as TileType,
        doodadId: null,
        passable: !isWall,
      };
      placed.add(tileKey);

      // Pre-place doodad at this tile (origin only for multi-tile defs)
      if (stile.doodadId) {
        const doodadDef = registry.findDoodad(stile.doodadId);
        if (!doodadDef) continue;

        const gwx      = cx * CS + tlx;
        const gwy      = cy * CS + tly;
        const doodadId = `wgen_${gwx}_${gwy}`;

        const inventory: (null)[] = doodadDef.slots.map(() => null);

        const doodadState: DoodadState = {
          id:                doodadId,
          defId:             stile.doodadId,
          origin:            { tx: gwx, ty: gwy },
          rotation:          0,
          inventory,
          crafting:          null,
          powered:           false,
          tickAccumulatorMs: 0,
          pinnedRecipeId:    null,
          fuelBurn:          null,
        };

        doodads.push(doodadState);

        tiles[tly]![tlx]!.doodadId = doodadId;
        tiles[tly]![tlx]!.passable  = false;

        // Mark all footprint tiles as impassable
        for (let fdy = 0; fdy < doodadDef.footprint.h; fdy++) {
          for (let fdx = 0; fdx < doodadDef.footprint.w; fdx++) {
            if (fdx === 0 && fdy === 0) continue;  // origin already handled
            const ftlx = tlx + fdx;
            const ftly = tly + fdy;
            if (ftlx < 0 || ftlx >= CS || ftly < 0 || ftly >= CS) continue;
            if (tiles[ftly]?.[ftlx]) {
              tiles[ftly]![ftlx]!.passable = false;
            }
          }
        }
      }
    }
  }

  return doodads;
}

// ── Feature scatter pass ──────────────────────────────────────
//
//  Each registered FeatureDef gets its own seeded noise layer.
//  Features never spawn on road, ruin, or water tiles.
//  Only local maxima produce a deposit centre; nearby tiles are
//  filled into a cluster via distance-based probability.

function generateFeatures(
  cx: number,
  cy: number,
  seed: number,
  tiles: Tile[][],
): Record<string, FeatureState> {
  const CS = GameConfig.CHUNK_SIZE;

  const features: Record<string, FeatureState> = {};

  const featureDefs = [...registry.allFeatures().values()];
  if (featureDefs.length === 0) return features;

  for (let ly = 0; ly < CS; ly++) {
    for (let lx = 0; lx < CS; lx++) {
      const wx = cx * CS + lx;
      const wy = cy * CS + ly;

      // Skip tiles that block feature spawning
      const tileType = tiles[ly]?.[lx]?.type;
      if (tileType && ROAD_AND_RUIN_TYPES.has(tileType)) continue;

      for (const def of featureDefs) {
        const sparsity = def.sparsity;
        const cluster  = def.clusterSize;

        // Unique noise seed per feature type
        const fSeed = (seed ^ strHash(def.id)) >>> 0;
        const n     = valueNoise(wx, wy, fSeed, 6);

        if (n < sparsity) continue;

        // Local maximum check within cluster neighbourhood
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
            if (nlx < 0 || nlx >= CS || nly < 0 || nly >= CS) continue;

            // Skip road / ruin / water tiles inside the cluster too
            const clusterTileType = tiles[nly]?.[nlx]?.type;
            if (clusterTileType && ROAD_AND_RUIN_TYPES.has(clusterTileType)) continue;

            // Distance-based density falloff
            const dist    = Math.sqrt(dx * dx + dy * dy);
            if (dist > cluster) continue;
            const density = 1 - dist / (cluster + 1);
            if (hashCoord(fSeed, wx + dx, wy + dy) > density) continue;

            // First feature wins (no overlapping nodes)
            const key = `${nlx},${nly}`;
            if (features[key]) continue;

            const yield_ = def.infinite ? 0 : Math.round(
              def.baseYield * (0.7 + 0.6 * hashCoord(seed, wx + dx, wy + dy)),
            );

            features[key] = { featureId: def.id, remainingYield: yield_ };
          }
        }
      }
    }
  }

  return features;
}

// ── WorldGen class ────────────────────────────────────────────

export class WorldGen {
  generateChunk(cx: number, cy: number): Chunk {
    const CS   = GameConfig.CHUNK_SIZE;
    const seed = sm.state.worldSeed;

    // ── Pass 1: tile generation (terrain + roads via noise) ──────
    const tiles: Tile[][] = [];
    for (let ty = 0; ty < CS; ty++) {
      tiles[ty] = [];
      for (let tx = 0; tx < CS; tx++) {
        const wx = cx * CS + tx;
        const wy = cy * CS + ty;
        tiles[ty]![tx] = generateTile(wx, wy, seed);
      }
    }

    // ── Pass 2: structure placement ──────────────────────────────
    //  Blueprints are stamped before feature scatter so that features
    //  cannot spawn inside buildings.
    const prePlacedDoodads = generateStructures(cx, cy, seed, tiles);
    for (const ds of prePlacedDoodads) {
      sm.state.doodads[ds.id] = ds;
    }

    // ── Pass 3: feature scatter ───────────────────────────────────
    const features = generateFeatures(cx, cy, seed, tiles);

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
