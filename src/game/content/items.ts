// ============================================================
//  src/game/content/items.ts
//  ALL item definitions live here.
//  Add a new item: add one object to the array below.
//  Zero engine changes required.
// ============================================================

import type { ItemDef } from "@types/content";

export const ITEMS: ItemDef[] = [
  // ── Raw materials ────────────────────────────────────────
  {
    id:          "scrap_metal",
    name:        "Scrap Metal",
    description: "Twisted salvage from the ruins. The foundation of everything.",
    sprite:      "#8a8a8a",
    stackSize:   100,
    tags:        ["raw", "metal"],
  },
  {
    id:          "iron_ore",
    name:        "Iron Ore",
    description: "Reddish chunks pulled from collapsed infrastructure.",
    sprite:      "#7a4a3a",
    stackSize:   100,
    tags:        ["raw", "ore", "metal"],
  },
  {
    id:          "copper_ore",
    name:        "Copper Ore",
    description: "Oxidised copper deposits, critical for early electronics.",
    sprite:      "#b87333",
    stackSize:   100,
    tags:        ["raw", "ore", "metal"],
  },
  {
    id:          "coal",
    name:        "Coal",
    description: "Dense carbonite. Burns slow and hot.",
    sprite:      "#2a2a2a",
    stackSize:   100,
    tags:        ["raw", "fuel"],
  },
  {
    id:          "organic_matter",
    name:        "Organic Matter",
    description: "Decomposed biomass. Smells awful. Surprisingly useful.",
    sprite:      "#3a4a1a",
    stackSize:   50,
    tags:        ["raw", "organic"],
  },

  // ── Refined materials ────────────────────────────────────
  {
    id:          "iron_plate",
    name:        "Iron Plate",
    description: "Flat-rolled iron. The bedrock of structural fabrication.",
    sprite:      "#9a9a9a",
    stackSize:   100,
    tags:        ["refined", "metal"],
  },
  {
    id:          "copper_wire",
    name:        "Copper Wire",
    description: "Drawn copper filaments. Carries current, carries potential.",
    sprite:      "#d4893a",
    stackSize:   100,
    tags:        ["refined", "metal", "electrical"],
  },
  {
    id:          "steel_plate",
    name:        "Steel Plate",
    description: "Alloyed iron and carbon. The step beyond primitive iron.",
    sprite:      "#b0b8c0",
    stackSize:   50,
    tags:        ["refined", "metal", "advanced"],
  },
  {
    id:          "circuit_board",
    name:        "Circuit Board",
    description: "Rudimentary logic substrate. The seed of intelligence.",
    sprite:      "#1a5a2a",
    stackSize:   50,
    tags:        ["component", "electrical"],
  },
  {
    id:          "carbon_rod",
    name:        "Carbon Rod",
    description: "Compressed coal processed into structural carbon.",
    sprite:      "#3a3a4a",
    stackSize:   50,
    tags:        ["refined", "carbon"],
  },

  // ── Components ───────────────────────────────────────────
  {
    id:          "gear",
    name:        "Gear",
    description: "A precision-cut cog. Motion made manifest.",
    sprite:      "#aaaaaa",
    stackSize:   50,
    tags:        ["component", "mechanical"],
  },
  {
    id:          "motor",
    name:        "Electric Motor",
    description: "Electromagnetic drive unit. Powers extractors and belts.",
    sprite:      "#4a4a8a",
    stackSize:   20,
    tags:        ["component", "electrical", "mechanical"],
  },
  {
    id:          "ami_core",
    name:        "AMI Core",
    description: "Autonomous Machine Intelligence substrate. Awaits a chassis.",
    sprite:      "#00e5ff",
    stackSize:   10,
    tags:        ["component", "advanced", "ami"],
  },
];
