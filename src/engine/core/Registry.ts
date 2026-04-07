// ============================================================
//  src/engine/core/Registry.ts
//  Central, immutable data store for all game-content definitions.
//  Content files call registry.register*() at startup.
//  The engine reads from the registry; it never imports content
//  files directly.
// ============================================================

import type { ItemDef, RecipeDef, DoodadDef, FeatureDef, TechDef, TerrainDef } from "@t/content";

export class Registry {
  private readonly items        = new Map<string, ItemDef>();
  private readonly recipes      = new Map<string, RecipeDef>();
  private readonly doodads      = new Map<string, DoodadDef>();
  private readonly features     = new Map<string, FeatureDef>();
  private readonly techs        = new Map<string, TechDef>();
  private readonly terrains     = new Map<string, TerrainDef>();
  /** Reverse index: doodadId → the ItemDef whose placesDoodadId matches it. */
  private readonly itemByDoodad = new Map<string, ItemDef>();

  // -- Registration (called once at boot) ---------------------

  registerItem(def: ItemDef): void {
    if (this.items.has(def.id)) {
      throw new Error(`[Registry] Duplicate item id: "${def.id}"`);
    }
    this.items.set(def.id, Object.freeze(def));
    if (def.placesDoodadId) {
      this.itemByDoodad.set(def.placesDoodadId, def);
    }
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

  registerFeature(def: FeatureDef): void {
    if (this.features.has(def.id)) {
      throw new Error(`[Registry] Duplicate feature id: "${def.id}"`);
    }
    this.features.set(def.id, Object.freeze(def));
  }

  registerTech(def: TechDef): void {
    if (this.techs.has(def.id)) {
      throw new Error(`[Registry] Duplicate tech id: "${def.id}"`);
    }
    this.techs.set(def.id, Object.freeze(def));
  }

  registerTerrain(def: TerrainDef): void {
    if (this.terrains.has(def.id)) {
      throw new Error(`[Registry] Duplicate terrain id: "${def.id}"`);
    }
    this.terrains.set(def.id, Object.freeze(def));
  }

  // -- Bulk helpers for content files -------------------------

  registerItems(defs: ItemDef[]): void         { defs.forEach(d => this.registerItem(d)); }
  registerRecipes(defs: RecipeDef[]): void     { defs.forEach(d => this.registerRecipe(d)); }
  registerDoodads(defs: DoodadDef[]): void     { defs.forEach(d => this.registerDoodad(d)); }
  registerFeatures(defs: FeatureDef[]): void   { defs.forEach(d => this.registerFeature(d)); }
  registerTechs(defs: TechDef[]): void         { defs.forEach(d => this.registerTech(d)); }
  registerTerrains(defs: TerrainDef[]): void   { defs.forEach(d => this.registerTerrain(d)); }

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

  getFeature(id: string): FeatureDef {
    const def = this.features.get(id);
    if (!def) throw new Error(`[Registry] Unknown feature: "${id}"`);
    return def;
  }

  getTech(id: string): TechDef {
    const def = this.techs.get(id);
    if (!def) throw new Error(`[Registry] Unknown tech: "${id}"`);
    return def;
  }

  getTerrain(id: string): TerrainDef {
    const def = this.terrains.get(id);
    if (!def) throw new Error(`[Registry] Unknown terrain: "${id}"`);
    return def;
  }

  // -- Optional lookups (return undefined) --------------------

  findItem(id: string): ItemDef | undefined         { return this.items.get(id); }
  findRecipe(id: string): RecipeDef | undefined     { return this.recipes.get(id); }
  findDoodad(id: string): DoodadDef | undefined     { return this.doodads.get(id); }
  findFeature(id: string): FeatureDef | undefined   { return this.features.get(id); }
  findTech(id: string): TechDef | undefined         { return this.techs.get(id); }
  findTerrain(id: string): TerrainDef | undefined   { return this.terrains.get(id); }

  /**
   * Returns the ItemDef whose `placesDoodadId` matches `doodadId`, or
   * undefined if no such item has been registered.
   */
  findItemForDoodad(doodadId: string): ItemDef | undefined {
    return this.itemByDoodad.get(doodadId);
  }

  // -- Query helpers ------------------------------------------

  /** All recipes executable by a given machineTag. */
  recipesForMachine(machineTag: string): RecipeDef[] {
    return [...this.recipes.values()].filter(r => r.machineTag === machineTag);
  }

  allItems():    Readonly<Map<string, ItemDef>>      { return this.items; }
  allRecipes():  Readonly<Map<string, RecipeDef>>    { return this.recipes; }
  allDoodads():  Readonly<Map<string, DoodadDef>>    { return this.doodads; }
  allFeatures(): Readonly<Map<string, FeatureDef>>   { return this.features; }
  allTechs():    Readonly<Map<string, TechDef>>      { return this.techs; }
  allTerrains(): Readonly<Map<string, TerrainDef>>   { return this.terrains; }

  // -- Starter helpers (called by StateManager at new-game init) --

  /** Returns the IDs of every RecipeDef with isStarter === true. */
  getStarterRecipeIds(): string[] {
    return [...this.recipes.values()]
      .filter(r => r.isStarter)
      .map(r => r.id);
  }

  /** Returns the IDs of every DoodadDef with isStarter === true. */
  getStarterDoodadIds(): string[] {
    return [...this.doodads.values()]
      .filter(d => d.isStarter)
      .map(d => d.id);
  }
}

/** Singleton — import this everywhere in the engine. */
export const registry = new Registry();
