// ============================================================
//  src/types/content.ts
// ============================================================

export interface ItemStack { itemId: string; qty: number; }

export interface ItemDef {
  id: string; name: string; description: string;
  sprite: string; stackSize: number; tags?: string[];
  /**
   * If set, this item can be placed in the world as the named doodad.
   * Placing consumes 1 of this item from the player's inventory.
   * Deconstructing that doodad yields 1 of this item back.
   */
  placesDoodadId?: string;
  /** If true, player has access to this item from the very start. */
  isStarter?: boolean;
  /**
   * If true, this item has no physical form and is never placed in
   * inventory slots.  Used for abstract currencies like RAM units —
   * the DoodadSystem routes virtual outputs directly into game-state
   * instead of a machine's output slot.
   */
  isVirtual?: boolean;
}

export interface RecipeIngredient { itemId: string; qty: number; }

export interface RecipeDef {
  id: string; name: string;
  inputs: RecipeIngredient[]; outputs: RecipeIngredient[];
  craftingTime: number; machineTag: string;
  /** If true, this recipe is available from the very start without any tech unlock. */
  isStarter?: boolean;
}

export type SlotRole = "input" | "output" | "fuel" | "internal";

export interface SlotDef {
  role: SlotRole; filter?: string[]; capacity: number;
}

export interface DoodadFootprint { w: number; h: number; }

export type CardinalDir = "N" | "E" | "S" | "W";

export interface DoodadPort {
  dx: number; dy: number; dir: CardinalDir; role: "input" | "output";
}

export interface FeatureDef {
  id:           string;
  name:         string;
  /** Hex colour string (e.g. "#7a4a3a") used as a fallback when no texture is loaded. */
  sprite:       string;
  /** Static PNG path (e.g. "assets/iron_vein.png"). Takes priority over sprite colour. */
  texture?:     string;
  /**
   * Animation frame paths keyed by state name.
   * The "idle" key is used for looping playback.
   * Takes priority over texture and sprite.
   * Example: { idle: ["assets/coal_seam_1.png", "assets/coal_seam_2.png"] }
   */
  animations?:  Record<string, string[]>;
  /** The item this feature yields when extracted. */
  yieldsItemId: string;
  /** Starting quantity when the feature is generated. Ignored when infinite. */
  baseYield:    number;
  /** If true, remainingYield never decrements — effectively infinite. */
  infinite?:    boolean;
  /**
   * Noise threshold above which this feature spawns (0–1, higher = sparser).
   * ~8% tile coverage at 0.92; ~20% coverage at 0.80.
   */
  sparsity:    number;
  /**
   * Tile radius around a noise peak that belongs to this deposit cluster.
   * Larger values create bigger, denser patches.
   */
  clusterSize: number;
  /**
   * machineTag of the extractor doodad that can mine this feature.
   * Leave undefined to allow any extractor.
   */
  extractorTag?: string;
  /**
   * Milliseconds the player must hold the harvest action to collect
   * one unit from this feature.  Defaults to 3000ms if omitted.
   */
  harvestTimeMs?: number;
}

export interface TerrainDef {
  id:    string;
  name:  string;
  /** Hex colour fallback used in the chunk colour-bake (e.g. "#1e1e14"). */
  sprite: string;
  /**
   * Static PNG path tiled over this terrain type.
   * Rendered in tileDetailLayer (above the colour bake).
   * Falls back to sprite colour if not loaded yet.
   */
  texture?:    string;
  /**
   * Animation frame paths keyed by state name.
   * The "idle" key is used for looping playback.
   * Takes priority over texture.
   * Example: { idle: ["assets/ground_1.png", "assets/ground_2.png"] }
   */
  animations?: Record<string, string[]>;
}

// ── Tech tree ─────────────────────────────────────────────────

/**
 * A researchable technology node in the RAM tech tree.
 * Spending `cost` RAM unlocks the recipes, doodads, and abstract
 * system flags listed on this def.
 */
export interface TechDef {
  id:                  string;
  name:                string;
  description:         string;
  /** RAM cost to unlock this technology. */
  cost:                number;
  /**
   * Visual tier in the tech tree (1 = earliest).
   * Techs with the same tier value are rendered in the same column.
   */
  tier:                number;
  /**
   * IDs of TechDefs that must be unlocked before this one is
   * researchable.  Empty array or omitted = no prerequisites.
   */
  preReqTechIds?:      string[];
  /** Recipe IDs added to sm.state.unlockedRecipeIds on unlock. */
  unlocksRecipeIds:    string[];
  /** Doodad IDs added to sm.state.unlockedDoodadIds on unlock. */
  unlocksDoodadIds:    string[];
  /**
   * Abstract flag strings added to sm.state.unlockedSystemFlags.
   * Engine systems can test these to gate features that don't map
   * cleanly to a single recipe or doodad (e.g. "drone_network_enabled").
   */
  unlocksSystemFlags:  string[];
}

// ── Structure blueprints ──────────────────────────────────────

/**
 * One cell in a StructureDef blueprint, at (dx, dy) relative to the
 * structure's top-left origin tile.
 */
export interface StructureTile {
  /** X offset from the structure origin (0 = leftmost column). */
  dx: number;
  /** Y offset from the structure origin (0 = topmost row). */
  dy: number;
  /**
   * Terrain tile type ID to write at this position.
   * Must match a registered TerrainDef id.
   * E.g. "ruin_floor", "ruined_wall", "asphalt_cracked".
   */
  terrain: string;
  /**
   * Optional DoodadDef id to pre-place at this tile.
   * WorldGen creates a minimal DoodadState for the doodad and marks
   * all tiles in its footprint as impassable.
   * Only specify the **origin** tile for multi-tile doodads — leave
   * the remaining footprint cells as plain floor in the blueprint.
   */
  doodadId?: string;
}

/**
 * A pre-built structure blueprint placed by WorldGen inside city biomes.
 * Defines the terrain layout and optional pre-placed doodads for a
 * named ruined building or installation.
 *
 * The engine never hardcodes what a building looks like — it reads
 * these defs from the Registry and stamps them into chunks.
 */
export interface StructureDef {
  id:     string;
  name:   string;
  /** Bounding box width in tiles. */
  width:  number;
  /** Bounding box height in tiles. */
  height: number;
  /** All tiles that make up the structure, relative to its origin. */
  tiles:  StructureTile[];
  /**
   * Biome tags controlling where this structure can spawn.
   * "city" = only inside high macroNoise zones (default behaviour).
   */
  tags?: string[];
  /**
   * Minimum macro-biome noise required for placement (0–1).
   * Defaults to 0.60 if omitted.  Higher = only in dense city cores.
   */
  minCityNoise?: number;
  /**
   * When true, at least one tile on the perimeter of the structure
   * bounding box must already be a road tile for placement to succeed.
   * Ensures structures sit alongside roads, not in the middle of nowhere.
   */
  requiresRoad?: boolean;
}

export interface DoodadDef {
  id: string; name: string; description: string;
  sprite: string;
  texture?: string;
  animations?: Record<string, string[]>;
  footprint: DoodadFootprint;
  slots: SlotDef[];
  ports: DoodadPort[];
  machineTag?: string;
  powerDraw: number;
  tickIntervalMs?: number;
  interactable?: boolean;
  allowedRecipeIds?: string[];
  powerGeneration?: number;
  powerRadius?: number;
  connectRadius?: number;
  showLabel?: boolean;
  /** ms to hold LMB after placing a blueprint before it goes live. Default 500. */
  buildTimeMs?: number;
  /** ms to hold LMB (Deconstruct mode) before the machine is removed. Default 500. */
  deconstructTimeMs?: number;
  /**
   * Raw resource cost to build this doodad from scratch when the
   * player does NOT have the prefab placeable item in inventory.
   * If both `cost` and `buildCost` are absent the doodad is free.
   * `buildCost` (legacy) is used as a fallback if `cost` is absent.
   */
  cost?:             RecipeIngredient[];
  /**
   * @deprecated Use `cost` for new doodads.
   * Legacy build/refund cost kept for backward compatibility.
   * Items consumed from player inventory when the blueprint is placed.
   */
  buildCost?:        RecipeIngredient[];
  /**
   * Fraction of the raw resource cost returned on deconstruct when
   * no placeable item is registered for this doodad. 0.0–1.0.
   * Default 0.5. Quantities are floored.
   */
  refundFraction?:   number;
  /** If true, this doodad is buildable from the very start without any tech unlock. */
  isStarter?: boolean;
  /**
   * When set, the extractor only consumes one unit of fuel every N extraction ticks
   * instead of every tick.  Defaults to 1 (consume every tick).
   * E.g. fuelEveryNTicks: 3 means 1 coal per 3 extraction cycles.
   */
  fuelEveryNTicks?: number;
}