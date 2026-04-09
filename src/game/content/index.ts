// ============================================================
//  src/game/content/index.ts
//  Single entry point that registers ALL content into the
//  engine registry.  main.ts calls bootstrapContent() once
//  at startup before the game loop starts.
//
//  To add new content: add entries to items/recipes/doodads.ts
//  then import and include them here.  Nothing else.
// ============================================================

import { registry }      from "@engine/core/Registry";
import { ITEMS }         from "./items";
import { RECIPES }       from "./recipes";
import { DOODADS }       from "./doodads";
import { FEATURES }      from "./features";
import { TECHS }         from "./techs";
import { TERRAIN_DEFS }  from "./terrain";
import { STRUCTURES }    from "./structures";

export function bootstrapContent(): void {
  registry.registerItems(ITEMS);
  registry.registerRecipes(RECIPES);
  registry.registerDoodads(DOODADS);
  registry.registerFeatures(FEATURES);
  registry.registerTechs(TECHS);
  registry.registerTerrains(TERRAIN_DEFS);
  registry.registerStructures(STRUCTURES);

  console.info(
    `[Content] Registered: ${ITEMS.length} items, ` +
    `${RECIPES.length} recipes, ${DOODADS.length} doodads, ` +
    `${FEATURES.length} features, ${TECHS.length} techs, ` +
    `${TERRAIN_DEFS.length} terrains, ${STRUCTURES.length} structures.`
  );
}
