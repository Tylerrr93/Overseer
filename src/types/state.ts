// ============================================================
//  src/types/state.ts
// ============================================================

import type { ItemStack } from "./content";
export type { ItemStack };

// ── Cursor mode ───────────────────────────────────────────────

export enum CursorMode {
  None        = 0,
  Build       = 1,
  Deconstruct = 2,
}

// ── World / Grid ──────────────────────────────────────────────

export interface Vec2     { x: number; y: number; }
export interface TilePos  { tx: number; ty: number; }

export type TileType =
  | "void" | "ground" | "rubble" | "water"
  | "rock" | "irradiated" | "organic"
  // Road surfaces — placed by WorldGen road pass
  | "asphalt_clean"    // intact highway surface
  | "asphalt_cracked"  // worn local street
  | "highway_line"     // highway with faded centre markings
  // Ruin interiors — placed by WorldGen structure pass
  | "ruin_floor"       // cracked concrete interior floor
  | "ruined_wall"      // crumbled load-bearing wall (impassable)
  // Legacy ore tile types — kept for save compatibility only.
  // New world gen does not produce these; use FeatureState instead.
  | "ore_iron" | "ore_copper" | "ore_coal";

export interface Tile {
  type:     TileType;
  doodadId: string | null;
  passable: boolean;
}

/** Mutable state of one resource feature placed on top of a tile. */
export interface FeatureState {
  featureId:      string;
  remainingYield: number;
}

export interface Chunk {
  cx: number; cy: number;
  tiles:     Tile[][];
  generated: boolean;
  /**
   * Resource features keyed by local tile coordinate "lx,ly".
   * A feature sits on top of the base tile and is mined by extractors.
   * Optional so that old saves without this field don't crash on load.
   */
  features?: Record<string, FeatureState>;
}

// ── Inventory ─────────────────────────────────────────────────

export interface InventoryState {
  slots: (ItemStack | null)[];
}

// ── Doodad Instance ───────────────────────────────────────────

export interface CraftingProgress {
  recipeId:  string;
  elapsedMs: number;
}

/** Present on a doodad while it is being built or torn down. */
export interface ConstructionProgress {
  mode:       "building" | "deconstructing";
  progressMs: number;
  totalMs:    number;
  /** True when the blueprint was placed by consuming a prefab item
   *  rather than raw resources.  Determines the cancel refund. */
  usedPrefab?: boolean;
}

export interface DoodadState {
  id:                string;
  defId:             string;
  origin:            TilePos;
  rotation:          number;
  inventory:         (ItemStack | null)[];
  crafting:          CraftingProgress | null;
  powered:           boolean;
  tickAccumulatorMs: number;
  pinnedRecipeId:    string | null;
  fuelBurn:          { remainingMs: number; totalMs: number } | null;
  /** Present while the doodad is under construction or being deconstructed. */
  construction?:     ConstructionProgress;
}

// ── Belt / Logistics ──────────────────────────────────────────

export interface BeltSegment {
  id:        string;
  origin:    TilePos;
  direction: "N" | "E" | "S" | "W";
  items:     { stack: ItemStack; progress: number }[];
}

// ── Player ────────────────────────────────────────────────────

/** Live harvest action — null when idle. */
export interface HarvestProgress {
  /** World tile coordinate being harvested. */
  tx:        number;
  ty:        number;
  elapsedMs: number;
  totalMs:   number;
}

export interface PlayerState {
  pos:               Vec2;
  cursorWorldPos:    Vec2;
  speed:             number;
  inventory:         InventoryState;
  heldItemId:        string | null;
  placementRotation: number;
  health:            number;
  maxHealth:         number;
  /** Active cursor interaction mode. */
  cursorMode:        CursorMode;
  /** Non-null while the player is holding down a manual harvest. */
  harvestProgress:   HarvestProgress | null;
  /**
   * When true, hovering over a world feature shows its remaining yield count.
   * Toggled by the Inspect button on the action bar.  Not persisted.
   */
  inspectMode:       boolean;
}

// ── Root Game State ───────────────────────────────────────────

export interface GameState {
  version:   number;
  tickCount: number;
  worldSeed: number;
  player:    PlayerState;
  chunks:    Record<string, Chunk>;
  doodads:   Record<string, DoodadState>;
  belts:     Record<string, BeltSegment>;

  // ── RAM Tech System ────────────────────────────────────────
  /** Current unspent RAM allocation units. */
  ram:                 number;
  /** IDs of TechDefs already unlocked by the player. */
  unlockedTechs:       string[];
  /** IDs of RecipeDefs the player may currently craft. */
  unlockedRecipeIds:   string[];
  /** IDs of DoodadDefs the player may currently build. */
  unlockedDoodadIds:   string[];
  /**
   * Abstract flag strings set by TechDefs.
   * Engine systems gate features by checking this array
   * (e.g. `state.unlockedSystemFlags.includes("drone_network_enabled")`).
   */
  unlockedSystemFlags: string[];
}