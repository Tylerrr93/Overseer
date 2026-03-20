// ============================================================
//  src/types/content.ts
//  Data-only interfaces for all game content.
//  The engine NEVER imports from src/game/content — it only
//  knows these interfaces.  Content files only know these too.
// ============================================================

// ── Items ────────────────────────────────────────────────────

/** A stack of items in a slot (inventory / belt / buffer). */
export interface ItemStack {
  itemId: string;
  qty: number;
}

/**
 * A static definition of a single item type.
 * Adding a new item = adding one object to content/items.ts.
 */
export interface ItemDef {
  /** Unique snake_case identifier, e.g. "iron_plate" */
  id: string;
  /** Display name shown in UI */
  name: string;
  /** Short flavour description */
  description: string;
  /** Path to sprite sheet tile, or a hex colour for a placeholder rect */
  sprite: string;
  /** Maximum units per inventory slot */
  stackSize: number;
  /** Tags used by recipes/filters, e.g. ["metal", "refined"] */
  tags?: string[];
}

// ── Recipes ──────────────────────────────────────────────────

export interface RecipeIngredient {
  itemId: string;
  qty: number;
}

/**
 * A crafting recipe.
 * `craftingTime` is in milliseconds of continuous operation.
 * `machineTag` restricts which Doodad categories can execute it
 * (e.g. "smelter", "fabricator", "personal_fab").
 */
export interface RecipeDef {
  id: string;
  name: string;
  inputs: RecipeIngredient[];
  outputs: RecipeIngredient[];   // supports multi-output (byproducts)
  craftingTime: number;          // ms
  machineTag: string;
}

// ── Doodads (buildings) ──────────────────────────────────────

/**
 * How inventory slots are distributed on a Doodad.
 * `input`  – items arrive here (from belts / player)
 * `output` – items leave here (to belts / player extraction)
 * `fuel`   – consumed for power (optional)
 * `internal` – working buffer, never accessible externally
 */
export type SlotRole = "input" | "output" | "fuel" | "internal";

export interface SlotDef {
  role: SlotRole;
  /** Which item tags / ids are accepted; empty = accept all */
  filter?: string[];
  capacity: number;            // max stack size in this slot
}

/**
 * Axis-aligned rectangular footprint on the grid.
 * A 1×1 Doodad has w=1, h=1.
 */
export interface DoodadFootprint {
  w: number;
  h: number;
}

/**
 * Connection ports define where items enter/leave a Doodad.
 * `dx`, `dy` are offsets from the Doodad's top-left tile.
 * `dir` is the cardinal direction a belt must face to connect.
 */
export type CardinalDir = "N" | "E" | "S" | "W";

export interface DoodadPort {
  dx: number;
  dy: number;
  dir: CardinalDir;
  role: "input" | "output";
}

/**
 * Static definition of a Doodad *type*.
 * A placed instance is a `DoodadState` (in engine/state.ts).
 *
 * Adding a new machine = adding one DoodadDef to content/doodads.ts.
 * Zero engine changes required.
 */
export interface DoodadDef {
  id: string;                       // "basic_smelter"
  name: string;                     // "Basic Smelter"
  description: string;
  sprite: string;
  footprint: DoodadFootprint;
  slots: SlotDef[];
  ports: DoodadPort[];

  /**
   * Which recipe machineTag this Doodad can execute.
   * If undefined, the Doodad has no crafting behaviour
   * (e.g. a power pylon or a transport belt segment).
   */
  machineTag?: string;

  /**
   * Power consumption in watts while actively crafting.
   * 0 = unpowered machine (e.g. hand-cranked early-game).
   */
  powerDraw: number;

  /**
   * Internal tick interval override in ms.
   * Falls back to GameConfig.defaultDoodadTickMs if absent.
   */
  tickIntervalMs?: number;

  /**
   * If true, the player can press F when nearby to open the
   * Doodad UI panel (inventory inspection + recipe selection).
   * Storage chests set this automatically via machineTag.
   */
  interactable?: boolean;

  /**
   * Explicit list of recipe IDs this doodad can run.
   * If omitted, all recipes matching machineTag are available.
   * Use this to restrict a machine to a subset of recipes.
   * e.g. a "coal_only_smelter" could list only "smelt_coal".
   */
  allowedRecipeIds?: string[];

  /**
   * Watts generated per second when this doodad is actively burning fuel.
   * Only set on generator doodads. 0 or absent = not a generator.
   */
  powerGeneration?: number;

  /**
   * Tile radius within which this node can power machines and generators.
   * Used by power_node doodads.
   */
  powerRadius?: number;

  /**
   * Tile radius within which this node can connect to other power nodes
   * to form a shared network.
   */
  connectRadius?: number;
}
