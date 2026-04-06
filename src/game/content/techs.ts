// ============================================================
//  src/game/content/techs.ts
//  ALL tech tree definitions.
//  Add a new technology: add one object to TECHS below.
//  Zero engine changes required.
//
//  Cost unit: RAM Allocation (sm.state.ram).
//  Unlocked techs are persisted in sm.state.unlockedTechs.
// ============================================================

import type { TechDef } from "@t/content";

export const TECHS: TechDef[] = [
  // ── Tier 1 — no prerequisites ─────────────────────────────

  {
    id:          "carbon_processing",
    name:        "Carbon Processing",
    description:
      "Compress coal under extreme pressure to produce structural carbon rods — " +
      "the foundation of steel alloys and advanced circuit substrates.",
    cost:                20,
    tier:                1,
    preReqTechIds:       [],
    unlocksRecipeIds:    ["press_carbon"],
    unlocksDoodadIds:    ["carbon_press"],
    unlocksSystemFlags:  [],
  },

  // ── Tier 2 — requires Carbon Processing ──────────────────

  {
    id:          "precision_fabrication",
    name:        "Precision Fabrication",
    description:
      "Automated micro-assembly of complex mechanical and electronic components. " +
      "Enables the Fabricator and the full suite of mid-game parts: gears, motors, " +
      "circuit boards, steel smelting, and AMI Core synthesis.",
    cost:                50,
    tier:                2,
    preReqTechIds:       ["carbon_processing"],
    unlocksRecipeIds:    [
      "fab_gear",
      "fab_motor",
      "fab_circuit",
      "fab_ami_core",
      "smelt_steel",
    ],
    unlocksDoodadIds:    ["fabricator"],
    unlocksSystemFlags:  [],
  },
];
