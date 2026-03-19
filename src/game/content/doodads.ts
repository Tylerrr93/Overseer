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
      { role: "input",  filter: ["ore"], capacity: 100 },  // ore slot
      { role: "input",  filter: ["fuel"], capacity: 100 }, // fuel slot
      { role: "output", capacity: 100 },
    ],
    ports: [
      { dx: 0, dy: 0, dir: "W", role: "input" },   // ore in from left
      { dx: 0, dy: 1, dir: "W", role: "input" },   // fuel in from left
      { dx: 1, dy: 0, dir: "E", role: "output" },  // product out right
    ],
    machineTag:        "smelter",
    interactable:      true,
    powerDraw:         0,
    tickIntervalMs:    500,
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
    machineTag:    "fabricator",
    interactable:  true,
    powerDraw:     50,
  },

  // ── Carbon Press (2×1) ───────────────────────────────────
  {
    id:          "carbon_press",
    name:        "Carbon Press",
    description: "Compresses coal under extreme pressure into carbon rods.",
    sprite:      "#1a1a2a",
    footprint:   { w: 2, h: 1 },
    slots: [
      { role: "input",  filter: ["fuel"], capacity: 100 },
      { role: "output", capacity: 100 },
    ],
    ports: [
      { dx: 0, dy: 0, dir: "W", role: "input" },
      { dx: 1, dy: 0, dir: "E", role: "output" },
    ],
    machineTag:    "carbon_press",
    interactable:  true,
    powerDraw:     20,
  },

  // ── Iron Extractor (1×1) ─────────────────────────────────
  {
    id:          "iron_extractor",
    name:        "Iron Extractor",
    description: "Drills iron ore. Requires coal as fuel — load it manually via F. Place on a dark reddish ore_iron tile. Output port faces South by default, rotate with R before placing.",
    sprite:      "#5a4a3a",
    footprint:   { w: 1, h: 1 },
    slots: [
      { role: "fuel",   filter: ["fuel"], capacity: 50 },   // coal goes here
      { role: "output", capacity: 100 },
    ],
    ports: [
      { dx: 0, dy: 0, dir: "S", role: "output" },
    ],
    machineTag:    "extractor_iron",
    interactable:  true,
    powerDraw:     0,
    tickIntervalMs: 2000,
  },

  // ── Transport Belt (1×1) ─────────────────────────────────
  {
    id:          "belt_straight",
    name:        "Transport Belt",
    description: "Moves items in one direction. Chain them to build logistics lines.",
    sprite:      "#4a3a1a",
    footprint:   { w: 1, h: 1 },
    slots: [],  // belts are handled by BeltSystem, not slot inventory
    ports: [],
    powerDraw:  0,
    // No machineTag — BeltSystem handles it separately.
  },

  // ── Power Node (1×1) ────────────────────────────────────
  {
    id:          "power_node",
    name:        "Power Node",
    description: "Distributes electric power to nearby doodads within 8 tiles.",
    sprite:      "#6a6a1a",
    footprint:   { w: 1, h: 1 },
    slots: [],
    ports: [],
    powerDraw:  0,
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
  },
];
