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
  // Ambient ruins scattered everywhere — infinite but low density.
  {
    id:            "scrap_deposit",
    name:          "Scrap Deposit",
    sprite:        "#6a6a5a",
    yieldsItemId:  "scrap_metal",
    baseYield:     0,       // unused — infinite flag overrides
    infinite:      true,
    extractorTag:  "extractor_scrap",
    harvestTimeMs: 1800,    // scrap is easy to salvage by hand
  },

  // ── Iron vein ────────────────────────────────────────────────
  {
    id:            "iron_vein",
    name:          "Iron Vein",
    sprite:        "#7a4a3a",
    yieldsItemId:  "iron_ore",
    baseYield:     400,
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
    extractorTag:  "extractor_copper",
    harvestTimeMs: 2000,
  },

  // ── Coal seam ────────────────────────────────────────────────
  {
    id:            "coal_seam",
    name:          "Coal Seam",
    sprite:        "#2a2a2a",
    yieldsItemId:  "coal",
    baseYield:     600,     // coal is more abundant — primary fuel source
    extractorTag:  "extractor_coal",
    harvestTimeMs: 2000,
  },
];
