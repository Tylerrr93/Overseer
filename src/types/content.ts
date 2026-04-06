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
}

export interface RecipeIngredient { itemId: string; qty: number; }

export interface RecipeDef {
  id: string; name: string;
  inputs: RecipeIngredient[]; outputs: RecipeIngredient[];
  craftingTime: number; machineTag: string;
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
  /** Hex colour string (e.g. "#7a4a3a") used by the renderer as a placeholder sprite. */
  sprite:       string;
  /** The item this feature yields when extracted. */
  yieldsItemId: string;
  /** Starting quantity when the feature is generated. Ignored when infinite. */
  baseYield:    number;
  /** If true, remainingYield never decrements — effectively infinite. */
  infinite?:    boolean;
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
}