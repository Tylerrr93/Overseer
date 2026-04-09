// ============================================================
//  src/game/content/features.ts
//  Resource feature definitions — nodes placed on top of terrain
//  by WorldGen.  Extractors read from these instead of tile types.
//
//  Post-apocalyptic setting: the collapse wiped out easy surface ore.
//  Scrap is the only ambient infinite resource.  Iron, copper, and
//  coal are pushed to extreme rarity — the player must explore vast
//  distances to locate a vein, but each vein holds far more ore to
//  compensate for the journey.
// ============================================================

import type { FeatureDef } from "@t/content";

export const FEATURES: FeatureDef[] = [
  // ── Scrap deposit ────────────────────────────────────────────
  //  Common ambient ruins — the bedrock of early-game bootstrapping.
  //  Infinite so the player is never stuck with zero material.
  {
    id:            "scrap_deposit",
    name:          "Scrap Deposit",
    sprite:        "#6a6a5a",
    texture:       "assets/scrap_metal.png",
    yieldsItemId:  "scrap_metal",
    baseYield:     3,        // tiny piles
    infinite:      true,     // ambient ruins — never runs dry
    sparsity:      0.76,     // moderately common — scattered everywhere
    clusterSize:   1,        // single tiles, no cluster
    extractorTag:  "extractor_scrap",
    harvestTimeMs: 1800,
  },

  // ── Iron vein ────────────────────────────────────────────────
  //  Collapsed infrastructure ore.  Extremely rare on the surface;
  //  each find is a major milestone.  Larger yield to reward travel.
  {
    id:            "iron_vein",
    name:          "Iron Vein",
    sprite:        "#7a4a3a",
    yieldsItemId:  "iron_ore",
    baseYield:     1400,     // big haul — worth the expedition
    sparsity:      0.974,    // ~1 vein per very large area
    clusterSize:   2,        // small tight cluster
    extractorTag:  "extractor_iron",
    harvestTimeMs: 2500,
  },

  // ── Copper vein ──────────────────────────────────────────────
  //  Even rarer than iron — critical for electronics.
  //  The player may need to scout 10+ chunks before finding one.
  {
    id:            "copper_vein",
    name:          "Copper Vein",
    sprite:        "#b87333",
    yieldsItemId:  "copper_ore",
    baseYield:     1100,
    sparsity:      0.980,    // rarest ore — extremely precious
    clusterSize:   2,
    extractorTag:  "extractor_copper",
    harvestTimeMs: 2500,
  },

  // ── Coal seam ────────────────────────────────────────────────
  //  Primary fuel source and carbon feedstock.  Still scarce but
  //  slightly more findable than metal ores — the player needs coal
  //  first to power early machinery.
  {
    id:            "coal_seam",
    name:          "Coal Seam",
    sprite:        "#2a2a2a",
    yieldsItemId:  "coal",
    baseYield:     2200,     // large reserves — sustains early industry
    sparsity:      0.968,    // rare but findable before ores
    clusterSize:   3,        // slightly larger patches
    extractorTag:  "extractor_coal",
    harvestTimeMs: 2000,
  },
];
