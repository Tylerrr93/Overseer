// ============================================================
//  src/types/state.ts
//  Runtime + serialisable game-state types.
//  All types here MUST be JSON-serialisable (no class instances,
//  no Map/Set — use plain objects and arrays).
// ============================================================

import type { ItemStack } from "./content";

// ── World / Grid ─────────────────────────────────────────────

export interface Vec2 {
  x: number;
  y: number;
}

/** Tile-coordinate (integer grid position). */
export interface TilePos {
  tx: number;
  ty: number;
}

export type TileType =
  | "void"
  | "ground"
  | "rubble"
  | "water"
  | "ore_iron"
  | "ore_copper"
  | "ore_coal"
  | "organic";

export interface Tile {
  type: TileType;
  /** Overlay doodad id occupying this tile (or null). */
  doodadId: string | null;
  /** Passability — false for water, structures, etc. */
  passable: boolean;
}

/**
 * One chunk = CHUNK_SIZE × CHUNK_SIZE tiles.
 * Stored as a flat Uint8Array for perf; decoded on access.
 */
export interface Chunk {
  cx: number;  // chunk X coord
  cy: number;  // chunk Y coord
  tiles: Tile[][];   // [ty][tx] within chunk
  generated: boolean;
}

// ── Inventory ────────────────────────────────────────────────

export interface InventoryState {
  slots: (ItemStack | null)[];
}

// ── Doodad Instance ──────────────────────────────────────────

/** Progress of an active crafting cycle. */
export interface CraftingProgress {
  recipeId: string;
  /** Elapsed ms of the current cycle. */
  elapsedMs: number;
}

/**
 * A placed Doodad instance in the world.
 * `defId` links back to the static DoodadDef in the registry.
 */
export interface DoodadState {
  /** Unique runtime ID (UUID). */
  id: string;
  /** Links to DoodadDef. */
  defId: string;
  /** Top-left tile of the footprint. */
  origin: TilePos;
  /** Clockwise rotation in 90° steps (0–3). */
  rotation: number;
  /** Per-slot inventory (indexed parallel to DoodadDef.slots). */
  inventory: (ItemStack | null)[];
  /** Active recipe being processed; null if idle. */
  crafting: CraftingProgress | null;
  /** Whether the doodad is receiving adequate power. */
  powered: boolean;
  /** Accumulates leftover ms between ticks to handle uneven frame times. */
  tickAccumulatorMs: number;
}

// ── Belt / Logistics ─────────────────────────────────────────

export interface BeltSegment {
  id: string;
  origin: TilePos;
  /** Direction of travel. */
  direction: "N" | "E" | "S" | "W";
  /** Items currently on this segment, 0 = entry end, 1 = exit end. */
  items: { stack: ItemStack; progress: number }[];
}

// ── Player ───────────────────────────────────────────────────

export interface PlayerState {
  /** World-space position (pixels, not tiles). */
  pos: Vec2;
  /** Movement speed in px/s. */
  speed: number;
  inventory: InventoryState;
  /** Currently held tool / selected Doodad def for placement. */
  heldItemId: string | null;
  health: number;
  maxHealth: number;
}

// ── Root Game State ───────────────────────────────────────────

export interface GameState {
  version: number;          // bump on breaking schema changes
  tickCount: number;        // total simulation ticks elapsed
  worldSeed: number;
  player: PlayerState;
  /** Keyed by `${cx},${cy}`. */
  chunks: Record<string, Chunk>;
  /** Keyed by doodad instance UUID. */
  doodads: Record<string, DoodadState>;
  belts: Record<string, BeltSegment>;
}
