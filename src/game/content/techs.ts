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

  {
    id:          "copper_extraction",
    name:        "Copper Extraction",
    description:
      "Retrofit an extractor chassis for copper-vein drilling. " +
      "Copper is essential for wiring, motors, and circuit boards — " +
      "automating its collection is the first step toward scaled production.",
    cost:                15,
    tier:                1,
    preReqTechIds:       [],
    unlocksRecipeIds:    [],
    unlocksDoodadIds:    ["copper_extractor"],
    unlocksSystemFlags:  [],
  },

  {
    id:          "grid_optimization",
    name:        "Grid Optimization",
    description:
      "High-efficiency power distribution using tuned resonance coils. " +
      "Unlocks the Power Relay — a single node that covers twice the area " +
      "of a standard power node, reducing wiring overhead across the factory.",
    cost:                25,
    tier:                1,
    preReqTechIds:       [],
    unlocksRecipeIds:    [],
    unlocksDoodadIds:    ["power_relay"],
    unlocksSystemFlags:  [],
  },

  // ── Tier 2 — require one tier-1 tech ─────────────────────

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

  {
    id:          "automated_processing",
    name:        "Automated Processing",
    description:
      "Reconfigure the Fabricator for bulk raw-material conversion. " +
      "Enables fabricator recipes for iron plates and copper wire — " +
      "faster output ratios than the Basic Smelter, freeing it for steel work.",
    cost:                40,
    tier:                2,
    preReqTechIds:       ["copper_extraction"],
    unlocksRecipeIds:    ["fab_copper_wire", "fab_iron_plate"],
    unlocksDoodadIds:    [],
    unlocksSystemFlags:  [],
  },

  {
    id:          "grid_expansion",
    name:        "Grid Expansion",
    description:
      "Capacitor-bank substations that anchor power to large industrial zones. " +
      "Unlocks the Substation — a 2×2 hub with a 12-tile power radius and " +
      "16-tile connect range, eliminating relay chains in dense factory cores.",
    cost:                35,
    tier:                2,
    preReqTechIds:       ["grid_optimization"],
    unlocksRecipeIds:    [],
    unlocksDoodadIds:    ["substation"],
    unlocksSystemFlags:  [],
  },

  // ── Tier 3 — require two tier-2 techs ────────────────────

  {
    id:          "advanced_electronics",
    name:        "Advanced Electronics",
    description:
      "Miniaturised sensor arrays and programmable logic controllers. " +
      "The foundation of autonomous machine networks, drone coordination, " +
      "and the next generation of AMI cognitive architecture.",
    cost:                80,
    tier:                3,
    preReqTechIds:       ["precision_fabrication", "automated_processing"],
    unlocksRecipeIds:    [],
    unlocksDoodadIds:    [],
    unlocksSystemFlags:  ["advanced_electronics"],
  },

  {
    id:          "industrial_scale",
    name:        "Industrial Scale",
    description:
      "Bulk-throughput logistics and heavy power infrastructure. " +
      "Combines automated processing with grid mastery to unlock " +
      "the next tier of factory expansion — larger machines, higher densities.",
    cost:                70,
    tier:                3,
    preReqTechIds:       ["automated_processing", "grid_expansion"],
    unlocksRecipeIds:    [],
    unlocksDoodadIds:    [],
    unlocksSystemFlags:  ["industrial_scale"],
  },
];
