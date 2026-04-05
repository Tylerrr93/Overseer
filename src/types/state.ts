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
  | "ore_iron" | "ore_copper" | "ore_coal" | "organic";

export interface Tile {
  type:     TileType;
  doodadId: string | null;
  passable: boolean;
}

export interface Chunk {
  cx: number; cy: number;
  tiles:     Tile[][];
  generated: boolean;
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
}