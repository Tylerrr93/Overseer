// ============================================================
//  src/game/content/items.ts
//  ALL item definitions live here.
//  Add a new item: add one object to the array below.
//  Zero engine changes required.
// ============================================================

import type { ItemDef } from "@t/content";

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

  // ── Placeable machines ────────────────────────────────────
  //  Each entry mirrors its doodad's name + sprite exactly so
  //  that inventory and action-bar rendering stays consistent.
  //  Deconstructing the matching doodad yields 1 of these.
  //  Placing consumes 1 from the player's inventory.
  {
    id:             "item_basic_smelter",
    name:           "Basic Smelter",
    description:    "Coal-fired ore furnace. The first step towards automation.",
    sprite:         "#6a2a0a",
    stackSize:      10,
    tags:           ["placeable", "machine"],
    placesDoodadId: "basic_smelter",
    isStarter:      true,
  },
  {
    id:             "item_fabricator",
    name:           "Fabricator",
    description:    "Electric precision assembler. Mid-game workhorse.",
    sprite:         "#2a3a6a",
    stackSize:      5,
    tags:           ["placeable", "machine"],
    placesDoodadId: "fabricator",
  },
  {
    id:             "item_carbon_press",
    name:           "Carbon Press",
    description:    "Compresses coal under extreme pressure into carbon rods.",
    sprite:         "#1a1a2a",
    stackSize:      10,
    tags:           ["placeable", "machine"],
    placesDoodadId: "carbon_press",
  },
  {
    id:             "item_iron_extractor",
    name:           "Iron Extractor",
    description:    "Drills iron ore from an iron vein. Fuel-powered.",
    sprite:         "#5a4a3a",
    stackSize:      10,
    tags:           ["placeable", "machine"],
    placesDoodadId: "iron_extractor",
    isStarter:      true,
  },
  {
    id:             "item_coal_extractor",
    name:           "Coal Extractor",
    description:    "Drills coal from a coal seam. Grid-powered.",
    sprite:         "#7e7e7e",
    stackSize:      10,
    tags:           ["placeable", "machine"],
    placesDoodadId: "coal_extractor",
    isStarter:      true,
  },
  {
    id:             "item_power_node",
    name:           "Power Node",
    description:    "Distributes grid power to nearby machines.",
    sprite:         "#8a8a1a",
    stackSize:      20,
    tags:           ["placeable", "power"],
    placesDoodadId: "power_node",
    isStarter:      true,
  },
  {
    id:             "item_coal_generator",
    name:           "Coal Generator",
    description:    "Burns coal to generate 500W of electricity.",
    sprite:         "#2a3a1a",
    stackSize:      5,
    tags:           ["placeable", "machine", "power"],
    placesDoodadId: "coal_generator",
    isStarter:      true,
  },
  {
    id:             "item_storage_chest",
    name:           "Storage Chest",
    description:    "Large buffer storage. Accepts items from belts on all sides.",
    sprite:         "#5a4a2a",
    stackSize:      10,
    tags:           ["placeable", "storage"],
    placesDoodadId: "storage_chest",
    isStarter:      true,
  },
  {
    id:             "item_belt_straight",
    name:           "Transport Belt",
    description:    "Moves items in one direction.",
    sprite:         "#4a3a1a",
    stackSize:      100,
    tags:           ["placeable", "logistics"],
    placesDoodadId: "belt_straight",
    isStarter:      true,
  },
  {
    id:             "item_ami_uplink_node",
    name:           "AMI Uplink Node",
    description:    "Autonomous Machine Intelligence uplink. Processes physical resources into RAM Allocation — the currency of cognition.",
    sprite:         "#003a5a",
    stackSize:      5,
    tags:           ["placeable", "machine", "ami"],
    placesDoodadId: "ami_uplink_node",
    isStarter:      true,
  },

  // ── Virtual (non-physical) items ─────────────────────────
  //  These items have no physical form and are never placed in
  //  inventory slots.  The DoodadSystem routes their output
  //  directly into the appropriate GameState field.
  {
    id:          "ram_unit",
    name:        "RAM",
    description: "RAM Allocation — abstract cognitive capacity generated by the AMI Uplink Node. Spent in the Tech Menu to unlock new technologies.",
    sprite:      "#00e5ff",
    stackSize:   1,
    tags:        ["virtual", "currency"],
    isVirtual:   true,
  },
];
