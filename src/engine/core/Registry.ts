// ============================================================
//  src/engine/core/Registry.ts
//  Central, immutable data store for all game-content definitions.
//  Content files call registry.register*() at startup.
//  The engine reads from the registry; it never imports content
//  files directly.
// ============================================================

import type { ItemDef, RecipeDef, DoodadDef } from "@types/content";

export class Registry {
  private readonly items    = new Map<string, ItemDef>();
  private readonly recipes  = new Map<string, RecipeDef>();
  private readonly doodads  = new Map<string, DoodadDef>();

  // -- Registration (called once at boot) ---------------------

  registerItem(def: ItemDef): void {
    if (this.items.has(def.id)) {
      throw new Error(`[Registry] Duplicate item id: "${def.id}"`);
    }
    this.items.set(def.id, Object.freeze(def));
  }

  registerRecipe(def: RecipeDef): void {
    if (this.recipes.has(def.id)) {
      throw new Error(`[Registry] Duplicate recipe id: "${def.id}"`);
    }
    this.recipes.set(def.id, Object.freeze(def));
  }

  registerDoodad(def: DoodadDef): void {
    if (this.doodads.has(def.id)) {
      throw new Error(`[Registry] Duplicate doodad id: "${def.id}"`);
    }
    this.doodads.set(def.id, Object.freeze(def));
  }

  // -- Bulk helpers for content files -------------------------

  registerItems(defs: ItemDef[]): void       { defs.forEach(d => this.registerItem(d)); }
  registerRecipes(defs: RecipeDef[]): void   { defs.forEach(d => this.registerRecipe(d)); }
  registerDoodads(defs: DoodadDef[]): void   { defs.forEach(d => this.registerDoodad(d)); }

  // -- Lookups (strict — throw if missing) --------------------

  getItem(id: string): ItemDef {
    const def = this.items.get(id);
    if (!def) throw new Error(`[Registry] Unknown item: "${id}"`);
    return def;
  }

  getRecipe(id: string): RecipeDef {
    const def = this.recipes.get(id);
    if (!def) throw new Error(`[Registry] Unknown recipe: "${id}"`);
    return def;
  }

  getDoodad(id: string): DoodadDef {
    const def = this.doodads.get(id);
    if (!def) throw new Error(`[Registry] Unknown doodad: "${id}"`);
    return def;
  }

  // -- Optional lookups (return undefined) --------------------

  findItem(id: string): ItemDef | undefined   { return this.items.get(id); }
  findRecipe(id: string): RecipeDef | undefined { return this.recipes.get(id); }
  findDoodad(id: string): DoodadDef | undefined { return this.doodads.get(id); }

  // -- Query helpers ------------------------------------------

  /** All recipes executable by a given machineTag. */
  recipesForMachine(machineTag: string): RecipeDef[] {
    return [...this.recipes.values()].filter(r => r.machineTag === machineTag);
  }

  allItems():   Readonly<Map<string, ItemDef>>   { return this.items; }
  allRecipes(): Readonly<Map<string, RecipeDef>> { return this.recipes; }
  allDoodads(): Readonly<Map<string, DoodadDef>> { return this.doodads; }
}

/** Singleton — import this everywhere in the engine. */
export const registry = new Registry();
