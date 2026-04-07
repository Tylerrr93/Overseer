// ============================================================
//  src/game/content/terrain.ts
//  Visual definitions for every TileType.
//
//  sprite  — hex colour used in the chunk colour-bake (always present,
//             used as fallback while a PNG texture is loading).
//  texture — optional static PNG rendered above the colour bake.
//  animations — optional animated PNG sequence (overrides texture).
//
//  To add art to a tile type:
//    1. Drop "public/assets/ground.png" in the project.
//    2. Set  texture: "assets/ground.png"  on the entry below.
//    3. For animation: animations: { idle: ["assets/ground_1.png", "assets/ground_2.png"] }
// ============================================================

import type { TerrainDef } from "@t/content";

export const TERRAIN_DEFS: TerrainDef[] = [
  {
    id:     "void",
    name:   "Void",
    sprite: "#0a0a0a",
  },
  {
    id:     "ground",
    name:   "Ground",
    sprite: "#1e1e14",
  },
  {
    id:     "rubble",
    name:   "Rubble",
    sprite: "#2e2820",
  },
  {
    id:     "rock",
    name:   "Rock",
    sprite: "#1a1a1a",
  },
  {
    id:     "irradiated",
    name:   "Irradiated",
    sprite: "#1a240a",
  },
  {
    id:     "water",
    name:   "Water",
    sprite: "#0d2a3d",
  },
  {
    id:     "organic",
    name:   "Organic",
    sprite: "#1a2a0d",
  },
  // ── Legacy ore tile types (save compatibility only) ──────────
  { id: "ore_iron",   name: "Iron Ore",   sprite: "#1e1e14" },
  { id: "ore_copper", name: "Copper Ore", sprite: "#1e1e14" },
  { id: "ore_coal",   name: "Coal Ore",   sprite: "#1e1e14" },
];