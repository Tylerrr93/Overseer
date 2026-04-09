// ============================================================
//  src/game/content/terrain.ts
//  Visual definitions for every TileType.
//
//  sprite  — hex colour used in the chunk colour-bake (always present,
//             used as fallback while a PNG texture is loading).
//  texture — optional static PNG rendered above the colour bake.
//  animations — optional animated PNG sequence (overrides texture).
//  label   — optional 1-2 char ASCII tag drawn as a centred overlay
//             on every tile of this type.  Helps distinguish biomes
//             before real art exists; omit for the most common tiles
//             to avoid visual noise.
//
//  Colour palette rationale (all dark/desaturated, but clearly distinct):
//    ground      warm olive-earth     — neutral base
//    rubble      brighter warm brown  — "broken ground" readable over ground
//    rock        cold blue-grey       — clearly cooler than all warm tones
//    water       deep blue            — unmistakable
//    irradiated  sickly olive-green   — distinct from organic
//    organic     darker forest-green  — distinct from irradiated
//    asphalt_*   cool grey-blue       — road family, slightly blue cast
//    highway_*   yellow-grey          — lighter road with implied markings
//    ruin_floor  warm amber concrete  — warm but lighter than rubble
//    ruined_wall dark brick-red       — redder/darker than all above
// ============================================================

import type { TerrainDef } from "@t/content";

export const TERRAIN_DEFS: TerrainDef[] = [
  {
    id:     "void",
    name:   "Void",
    sprite: "#070707",
    // no label — pure ungenerated space
  },
  {
    id:     "ground",
    name:   "Ground",
    sprite: "#1a1610",   // darker warm olive — the "floor" everything sits above
    // no label — most common tile, labelling would be noisy
  },
  {
    id:     "rubble",
    name:   "Rubble",
    sprite: "#362a18",   // medium warm brown — clearly above ground
    label:  "r",
  },
  {
    id:     "rock",
    name:   "Rock",
    sprite: "#18181e",   // cold near-black — clearly cooler than warm tones
    label:  "R",
  },
  {
    id:     "irradiated",
    name:   "Irradiated",
    sprite: "#1e2e08",   // sickly olive-green
    label:  "!",
  },
  {
    id:     "water",
    name:   "Water",
    sprite: "#0a2038",   // deep unmistakable blue
    label:  "~",
  },
  {
    id:     "organic",
    name:   "Organic",
    sprite: "#0c2008",   // darker forest-green (cooler than irradiated)
    label:  "o",
  },

  // ── Road surfaces ─────────────────────────────────────────────
  //  Roads use a COOL blue-grey family — clearly distinct from the
  //  warm-olive ground and brown rubble around them.
  //  Cracked asphalt is the lightest tile in the game so worn roads
  //  read as bright scars through the dark wasteland.
  {
    id:     "asphalt_clean",
    name:   "Asphalt",
    sprite: "#222236",   // cold blue-grey — clear hue break from warm terrain
    label:  ".",
    // texture: "assets/asphalt_clean.png",
  },
  {
    id:     "asphalt_cracked",
    name:   "Cracked Asphalt",
    sprite: "#3a3828",   // lightest tile — worn pale asphalt, reads as bright road
    label:  ",",
    // texture: "assets/asphalt_cracked.png",
  },
  {
    id:     "highway_line",
    name:   "Highway",
    sprite: "#30301e",   // warm yellow-grey — brighter than asphalt_clean
    label:  "=",
    // texture: "assets/highway_line.png",
  },

  // ── Ruin interiors ────────────────────────────────────────────
  //  Ruin floor is warm amber — clearly warmer AND lighter than ground,
  //  so city blocks read as lighter patches in the dark wasteland.
  //  Ruined wall is distinctly dark-red so structure perimeters are visible.
  {
    id:     "ruin_floor",
    name:   "Ruin Floor",
    sprite: "#3e3020",   // warm amber concrete — lightest warm tile
    label:  "f",
    // texture: "assets/ruin_floor.png",
  },
  {
    id:     "ruined_wall",
    name:   "Ruined Wall",
    sprite: "#321a1a",   // dark brick-red — structure outlines visible from above
    label:  "#",
    // texture: "assets/ruined_wall.png",
  },

  // ── Legacy ore tile types (save compatibility only) ──────────
  { id: "ore_iron",   name: "Iron Ore",   sprite: "#1e1e14" },
  { id: "ore_copper", name: "Copper Ore", sprite: "#1e1e14" },
  { id: "ore_coal",   name: "Coal Ore",   sprite: "#1e1e14" },
];
