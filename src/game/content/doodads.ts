// ============================================================
//  src/game/content/doodads.ts
//  ALL doodad (building) definitions.
//  Add a new building: add one object below.  No engine edits.
// ============================================================

import type { DoodadDef } from "@t/content";

export const DOODADS: DoodadDef[] = [
  // ── Personal Fabricator (player-carried tool, 1×1) ───────
  {
    id:          "personal_fab",
    name:        "Personal Fabricator",
    description: "Your wrist-mounted nano-assembler. Slow, but always with you.",
    sprite:      "#2a4a6a",
    footprint:   { w: 1, h: 1 },
    slots: [
      { role: "input",  capacity: 50 },
      { role: "input",  capacity: 50 },
      { role: "output", capacity: 50 },
    ],
    ports: [
      { dx: 0, dy: 0, dir: "S", role: "output" },
    ],
    machineTag:        "personal_fab",
    interactable:      true,
    powerDraw:         0,
  },

  // ── Basic Smelter (2×2) ──────────────────────────────────
  {
    id:          "basic_smelter",
    name:        "Basic Smelter",
    description: "Coal-fired ore furnace. The first step towards automation.",
    sprite:      "#6a2a0a",
    footprint:   { w: 2, h: 2 },
    slots: [
      { role: "input",  filter: ["ore"], capacity: 100 },
      { role: "input",  filter: ["fuel"], capacity: 100 },
      { role: "output", capacity: 100 },
    ],
    ports: [
      { dx: 0, dy: 0, dir: "W", role: "input" },
      { dx: 0, dy: 1, dir: "W", role: "input" },
      { dx: 1, dy: 0, dir: "E", role: "output" },
    ],
    machineTag:     "smelter",
    interactable:   true,
    powerDraw:      20,
    tickIntervalMs: 500,
    buildTimeMs:    3000,
    cost: [
      { itemId: "scrap_metal", qty: 8 },
      { itemId: "coal",        qty: 2 },
    ],
  },

  // ── Fabricator (3×3) ─────────────────────────────────────
  {
    id:          "fabricator",
    name:        "Fabricator",
    description: "Electric precision assembler. Mid-game workhorse.",
    sprite:      "#2a3a6a",
    footprint:   { w: 3, h: 3 },
    slots: [
      { role: "input",  capacity: 100 },
      { role: "input",  capacity: 100 },
      { role: "input",  capacity: 100 },
      { role: "output", capacity: 100 },
      { role: "output", capacity: 100 },
    ],
    ports: [
      { dx: 0, dy: 0, dir: "N", role: "input" },
      { dx: 1, dy: 0, dir: "N", role: "input" },
      { dx: 2, dy: 0, dir: "N", role: "input" },
      { dx: 0, dy: 2, dir: "S", role: "output" },
      { dx: 2, dy: 2, dir: "S", role: "output" },
    ],
    machineTag:   "fabricator",
    interactable: true,
    powerDraw:    50,
    buildTimeMs:  6000,
    cost: [
      { itemId: "scrap_metal", qty: 12 },
      { itemId: "iron_ore",    qty:  4 },
      { itemId: "copper_ore",  qty:  2 },
    ],
  },

  // ── Carbon Press ──────────────────────────────────────────
  // Converts coal into carbon rods for steel and circuit production.
  {
    id:          "carbon_press",
    name:        "Carbon Press",
    description: "Compresses coal under extreme pressure into carbon rods.",
    sprite:      "#1a1a2a",
    footprint:   { w: 2, h: 1 },
    slots: [
      { role: "input",  filter: ["fuel"], capacity: 100 },
      { role: "output",                   capacity: 100 },
    ],
    ports: [
      { dx: 0, dy: 0, dir: "W", role: "input"  },
      { dx: 1, dy: 0, dir: "E", role: "output" },
    ],
    machineTag:        "carbon_press",
    interactable:      true,
    powerDraw:         20,
    buildTimeMs:       3000,
    deconstructTimeMs: 1500,
    refundFraction:    0.5,
    // Raw scratch cost (replaces legacy buildCost for new build paths)
    cost: [
      { itemId: "scrap_metal", qty: 6 },
      { itemId: "coal",        qty: 2 },
    ],
    // Legacy — kept so old saves that used buildCost still refund correctly
    buildCost: [
      { itemId: "iron_plate", qty: 4 },
      { itemId: "gear",       qty: 1 },
    ],
  },

  // ── Iron Extractor (1×1) ─────────────────────────────────
  {
    id:          "iron_extractor",
    name:        "Iron Extractor",
    description: "Drills iron ore. Requires coal as fuel — load it manually via F. Place on a dark reddish ore_iron tile. Output port faces South by default, rotate with R before placing.",
    sprite:      "#5a4a3a",
    footprint:   { w: 1, h: 1 },
    slots: [
      { role: "fuel",   filter: ["fuel"], capacity: 50 },
      { role: "output", capacity: 100 },
    ],
    ports: [
      { dx: 0, dy: 0, dir: "S", role: "output" },
    ],
    machineTag:    "extractor_iron",
    interactable:  true,
    powerDraw:     0,
    tickIntervalMs: 2000,
    texture:       "assets/extractor_1.png",
    buildTimeMs:   3000,
    cost: [
      { itemId: "scrap_metal", qty: 4 },
      { itemId: "coal",        qty: 1 },
    ],
  },

  // ── Coal Extractor (1×1) ─────────────────────────────────
  {
    id:          "coal_extractor",
    name:        "Coal Extractor",
    showLabel:   false,
    description: "Drills coal ore. Requires coal as fuel — load it manually via F. Place on a grey coal ore tile.",
    sprite:      "#7e7e7e",
    footprint:   { w: 1, h: 1 },
    slots: [
      { role: "fuel",   filter: ["fuel"], capacity: 50 },
      { role: "output", capacity: 100 },
    ],
    ports: [
      { dx: 0, dy: 0, dir: "S", role: "output" },
    ],
    machineTag:    "extractor_coal",
    interactable:  true,
    powerDraw:     20,
    tickIntervalMs: 2000,
    animations: {
      idle:   ["assets/coal_extractor_idle.png"],
      active: ["assets/coal_extractor_1.png", "assets/coal_extractor_2.png"],
    },
    buildTimeMs: 10000,
    cost: [
      { itemId: "scrap_metal", qty: 5 },
      { itemId: "iron_ore",    qty: 2 },
    ],
  },

  // ── Transport Belt (1×1) ─────────────────────────────────
  {
    id:          "belt_straight",
    name:        "Transport Belt",
    description: "Moves items in one direction. Chain them to build logistics lines.",
    sprite:      "#4a3a1a",
    footprint:   { w: 1, h: 1 },
    slots: [],
    ports: [],
    powerDraw:   0,
    // Intentionally cheap — belts are placed in large runs.
    cost: [
      { itemId: "scrap_metal", qty: 1 },
    ],
  },

  // ── Power Node (1×1) ────────────────────────────────────
  {
    id:           "power_node",
    name:         "Power Node",
    description:  "Distributes grid power. Connects to other nodes within 6 tiles; powers machines within 4 tiles.",
    sprite:       "#8a8a1a",
    footprint:    { w: 1, h: 1 },
    slots:        [],
    ports:        [],
    powerDraw:    0,
    powerRadius:  4,
    connectRadius: 6,
    interactable: false,
    buildTimeMs:  1000,
    cost: [
      { itemId: "scrap_metal", qty: 2 },
      { itemId: "copper_ore",  qty: 1 },
    ],
  },

  // ── Coal Generator (2×2) ─────────────────────────────────
  {
    id:          "coal_generator",
    name:        "Coal Generator",
    description: "Burns coal to generate 500W of electricity. Load coal manually via F. Connect to Power Nodes to distribute power.",
    sprite:      "#2a3a1a",
    footprint:   { w: 2, h: 2 },
    slots: [
      { role: "fuel", filter: ["fuel"], capacity: 100 },
    ],
    ports: [
      { dx: 0, dy: 0, dir: "W", role: "input" },
    ],
    machineTag:       "generator",
    interactable:     true,
    powerDraw:        0,
    powerGeneration:  500,
    tickIntervalMs:   500,
    buildTimeMs:      4000,
    cost: [
      { itemId: "scrap_metal", qty: 10 },
      { itemId: "coal",        qty:  4 },
    ],
  },

  // ── Storage Chest (2×2) ──────────────────────────────────
  {
    id:          "storage_chest",
    name:        "Storage Chest",
    description: "Accepts items from belts on all four sides. Large buffer storage.",
    sprite:      "#5a4a2a",
    footprint:   { w: 2, h: 2 },
    slots: [
      // 16 independent stacks — mixed item storage
      { role: "input", capacity: 500 },
      { role: "input", capacity: 500 },
      { role: "input", capacity: 500 },
      { role: "input", capacity: 500 },
      { role: "input", capacity: 500 },
      { role: "input", capacity: 500 },
      { role: "input", capacity: 500 },
      { role: "input", capacity: 500 },
      { role: "input", capacity: 500 },
      { role: "input", capacity: 500 },
      { role: "input", capacity: 500 },
      { role: "input", capacity: 500 },
      { role: "input", capacity: 500 },
      { role: "input", capacity: 500 },
      { role: "input", capacity: 500 },
      { role: "input", capacity: 500 },
    ],
    ports: [
      { dx: 0, dy: 0, dir: "N", role: "input" },  // top-left from north
      { dx: 1, dy: 0, dir: "N", role: "input" },  // top-right from north
      { dx: 0, dy: 0, dir: "W", role: "input" },  // left from west
      { dx: 0, dy: 1, dir: "W", role: "input" },  // bottom-left from west
      { dx: 1, dy: 1, dir: "S", role: "input" },  // bottom-right from south
      { dx: 0, dy: 1, dir: "S", role: "input" },  // bottom-left from south
      { dx: 1, dy: 0, dir: "E", role: "input" },  // top-right from east
      { dx: 1, dy: 1, dir: "E", role: "input" },  // bottom-right from east
    ],
    machineTag:   "storage",
    interactable: true,
    powerDraw:    0,
    buildTimeMs:  2000,
    cost: [
      { itemId: "scrap_metal", qty: 6 },
    ],
  },
];
