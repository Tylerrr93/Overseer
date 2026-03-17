// ============================================================
//  src/game/content/recipes.ts
//  ALL recipe definitions live here.
//  Add a new recipe: add one object to the array below.
// ============================================================

import type { RecipeDef } from "@t/content";

export const RECIPES: RecipeDef[] = [
  // ── Personal Fabricator (early-game, player-operated) ────

  {
    id:           "smelt_iron_personal",
    name:         "Smelt Iron (Personal)",
    inputs:       [{ itemId: "iron_ore", qty: 2 }, { itemId: "coal", qty: 1 }],
    outputs:      [{ itemId: "iron_plate", qty: 1 }],
    craftingTime: 4000,  // 4 s — intentionally slow to incentivise machines
    machineTag:   "personal_fab",
  },
  {
    id:           "draw_wire_personal",
    name:         "Draw Copper Wire (Personal)",
    inputs:       [{ itemId: "copper_ore", qty: 2 }],
    outputs:      [{ itemId: "copper_wire", qty: 3 }],
    craftingTime: 3000,
    machineTag:   "personal_fab",
  },
  {
    id:           "craft_gear_personal",
    name:         "Craft Gear (Personal)",
    inputs:       [{ itemId: "iron_plate", qty: 2 }],
    outputs:      [{ itemId: "gear", qty: 1 }],
    craftingTime: 5000,
    machineTag:   "personal_fab",
  },

  // ── Basic Smelter (automated) ────────────────────────────

  {
    id:           "smelt_iron",
    name:         "Smelt Iron",
    inputs:       [{ itemId: "iron_ore", qty: 2 }, { itemId: "coal", qty: 1 }],
    outputs:      [{ itemId: "iron_plate", qty: 1 }],
    craftingTime: 2000,  // 2 s — twice as fast as personal
    machineTag:   "smelter",
  },
  {
    id:           "smelt_copper",
    name:         "Smelt Copper",
    inputs:       [{ itemId: "copper_ore", qty: 2 }],
    outputs:      [{ itemId: "copper_wire", qty: 3 }],
    craftingTime: 1500,
    machineTag:   "smelter",
  },
  {
    id:           "smelt_steel",
    name:         "Smelt Steel",
    inputs:       [{ itemId: "iron_plate", qty: 3 }, { itemId: "carbon_rod", qty: 1 }],
    outputs:      [{ itemId: "steel_plate", qty: 2 }],
    craftingTime: 4000,
    machineTag:   "smelter",
  },

  // ── Fabricator (mid-game components) ─────────────────────

  {
    id:           "fab_gear",
    name:         "Fabricate Gear",
    inputs:       [{ itemId: "iron_plate", qty: 2 }],
    outputs:      [{ itemId: "gear", qty: 1 }],
    craftingTime: 1500,
    machineTag:   "fabricator",
  },
  {
    id:           "fab_motor",
    name:         "Fabricate Electric Motor",
    inputs:       [
      { itemId: "copper_wire", qty: 4 },
      { itemId: "iron_plate",  qty: 2 },
      { itemId: "gear",        qty: 1 },
    ],
    outputs:      [{ itemId: "motor", qty: 1 }],
    craftingTime: 6000,
    machineTag:   "fabricator",
  },
  {
    id:           "fab_circuit",
    name:         "Fabricate Circuit Board",
    inputs:       [
      { itemId: "copper_wire", qty: 6 },
      { itemId: "carbon_rod",  qty: 2 },
    ],
    outputs:      [{ itemId: "circuit_board", qty: 1 }],
    craftingTime: 8000,
    machineTag:   "fabricator",
  },
  {
    id:           "fab_ami_core",
    name:         "Fabricate AMI Core",
    inputs:       [
      { itemId: "circuit_board", qty: 4 },
      { itemId: "steel_plate",   qty: 2 },
      { itemId: "copper_wire",   qty: 8 },
    ],
    outputs:      [{ itemId: "ami_core", qty: 1 }],
    craftingTime: 30000, // 30 s — milestone item
    machineTag:   "fabricator",
  },

  // ── Carbon Press ─────────────────────────────────────────

  {
    id:           "press_carbon",
    name:         "Press Carbon Rod",
    inputs:       [{ itemId: "coal", qty: 4 }],
    outputs:      [{ itemId: "carbon_rod", qty: 1 }],
    craftingTime: 3000,
    machineTag:   "carbon_press",
  },
];
