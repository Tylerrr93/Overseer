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
  /**
   * Optional texture key for a loaded PNG asset.
   * Falls back to `sprite` hex colour if absent.
   * Example: "assets/smelter.png"
   */
  texture?: string;
  /**
   * Per-state frame arrays for AnimatedSprite support.
   * Keys: "idle" | "active" (extend as needed).
   * Values: array of texture keys — PNG paths or hex colours.
   * Example: { idle: ["assets/smelter_idle.png"], active: ["assets/smelter_a1.png", "assets/smelter_a2.png"] }
   * When absent, the renderer uses a static placeholder rect.
   */
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
  /**
   * Whether to render the doodad's name as a text label over its sprite.
   * Defaults to true when absent. Set to false for doodads with recognisable
   * textures that don't need a name overlay cluttering the view.
   */
  showLabel?: boolean;
}