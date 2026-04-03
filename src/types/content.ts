// ============================================================
//  src/types/content.ts
// ============================================================

export interface ItemStack { itemId: string; qty: number; }

export interface ItemDef {
  id: string; name: string; description: string;
  sprite: string; stackSize: number; tags?: string[];
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
   * Items consumed from player inventory when the blueprint is placed.
   * Empty array (or omitted) = free to place.
   */
  buildCost?:        RecipeIngredient[];
  /**
   * Fraction of buildCost returned on deconstruct. 0.0–1.0.
   * Default 0.5 (50% refund). Each ingredient quantity is
   * floored — a cost of 1 at 0.5 refunds 0, so set costs ≥ 2
   * for items you want a guaranteed partial refund on.
   */
  refundFraction?:   number;
}