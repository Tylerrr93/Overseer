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
  //  Brighter sprite so it reads clearly against dark ground.
  {
    id:            "scrap_deposit",
    name:          "Scrap Deposit",
    sprite:        "#8a8070",   // warmer grey — more visible on dark ground
    texture:       "assets/scrap_metal.png",
    yieldsItemId:  "scrap_metal",
    baseYield:     3,
    infinite:      true,
    sparsity:      0.72,        // generous — ambient ruin litter everywhere
    clusterSize:   2,           // small patches, not lone tiles
    extractorTag:  "extractor_scrap",
    harvestTimeMs: 1800,
  },

  // ── Iron vein ────────────────────────────────────────────────
  //  Scarce but discoverable — expect 1 per 3–4 chunks explored.
  //  Bright rust-orange sprite stands out from terrain.
  {
    id:            "iron_vein",
    name:          "Iron Vein",
    sprite:        "#c4603a",   // vivid rust-orange — clearly visible
    yieldsItemId:  "iron_ore",
    baseYield:     1400,
    sparsity:      0.952,       // rare — roughly 1 per 3 chunks
    clusterSize:   2,
    extractorTag:  "extractor_iron",
    harvestTimeMs: 2500,
  },

  // ── Copper vein ──────────────────────────────────────────────
  //  Rarer than iron.  Vivid verdigris-green so the player can spot
  //  it from a distance when exploring.
  {
    id:            "copper_vein",
    name:          "Copper Vein",
    sprite:        "#4aaa6a",   // vivid teal-green — unmistakable
    yieldsItemId:  "copper_ore",
    baseYield:     1100,
    sparsity:      0.963,       // rarer than iron — ~1 per 5 chunks
    clusterSize:   2,
    extractorTag:  "extractor_copper",
    harvestTimeMs: 2500,
  },

  // ── Coal seam ────────────────────────────────────────────────
  //  The most findable ore — player needs it first to run machinery.
  //  Deep black tile reads distinctly against all terrain types.
  {
    id:            "coal_seam",
    name:          "Coal Seam",
    sprite:        "#404040",   // medium-dark grey — distinct from near-black ground
    yieldsItemId:  "coal",
    baseYield:     2200,
    sparsity:      0.944,       // most common ore — ~1 per 2 chunks
    clusterSize:   3,
    extractorTag:  "extractor_coal",
    harvestTimeMs: 2000,
  },
];
