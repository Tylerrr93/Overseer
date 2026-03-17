// ============================================================
//  src/game/content/index.ts
//  Single entry point that registers ALL content into the
//  engine registry.  main.ts calls bootstrapContent() once
//  at startup before the game loop starts.
//
//  To add new content: add entries to items/recipes/doodads.ts
//  then import and include them here.  Nothing else.
// ============================================================

import { registry } from "@engine/core/Registry";
import { ITEMS }   from "./items";
import { RECIPES } from "./recipes";
import { DOODADS } from "./doodads";

export function bootstrapContent(): void {
  registry.registerItems(ITEMS);
  registry.registerRecipes(RECIPES);
  registry.registerDoodads(DOODADS);

  console.info(
    `[Content] Registered: ${ITEMS.length} items, ` +
    `${RECIPES.length} recipes, ${DOODADS.length} doodads.`
  );
}
