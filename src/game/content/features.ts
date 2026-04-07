// ============================================================
//  src/game/content/features.ts
//  Resource feature definitions — nodes placed on top of terrain
//  by WorldGen.  Extractors read from these instead of tile types.
//
//  Post-apocalyptic Bobiverse setting: resources are scarce,
//  spread thin, and most are finite.  Scrap is the only infinite
//  source (ambient ruins everywhere).
// ============================================================

import type { FeatureDef } from "@t/content"; 

export const FEATURES: FeatureDef[] = [
  // ── Scrap deposit ────────────────────────────────────────────
  // Common ambient ruins — small piles, found everywhere.
  {
    id:            "scrap_deposit",
    name:          "Scrap Deposit",
    sprite:        "#6a6a5a",
    texture:       "assets/scrap_metal.png",
    yieldsItemId:  "scrap_metal",
    baseYield:     3,       // tiny piles — bootstrapping material only
    sparsity:      0.78,    // very common
    clusterSize:   1,       // single tiles, no cluster
    extractorTag:  "extractor_scrap",
    harvestTimeMs: 1800,
  },

  // ── Iron vein ────────────────────────────────────────────────
  {
    id:            "iron_vein",
    name:          "Iron Vein",
    sprite:        "#7a4a3a",
    yieldsItemId:  "iron_ore",
    baseYield:     400,
    sparsity:      0.92,    // moderately rare
    clusterSize:   3,
    extractorTag:  "extractor_iron",
    harvestTimeMs: 2000,
  },

  // ── Copper vein ──────────────────────────────────────────────
  {
    id:            "copper_vein",
    name:          "Copper Vein",
    sprite:        "#b87333",
    yieldsItemId:  "copper_ore",
    baseYield:     350,
    sparsity:      0.94,    // rarer than iron
    clusterSize:   2,
    extractorTag:  "extractor_copper",
    harvestTimeMs: 2000,
  },

  // ── Coal seam ────────────────────────────────────────────────
  {
    id:            "coal_seam",
    name:          "Coal Seam",
    sprite:        "#2a2a2a",
    yieldsItemId:  "coal",
    baseYield:     600,     // larger reserves — primary fuel source
    sparsity:      0.90,    // more common than ore veins
    clusterSize:   4,       // bigger patches
    extractorTag:  "extractor_coal",
    harvestTimeMs: 2000,
  },
];
