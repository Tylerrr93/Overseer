// ============================================================
//  src/main.ts  — Phase 4b
// ============================================================

import { bootstrapContent }         from "@game/content/index";
import { registry }                 from "@engine/core/Registry";
import { sm }                       from "@engine/core/StateManager";
import { GameLoop }                 from "@engine/core/GameLoop";
import { GameConfig }               from "@engine/core/GameConfig";
import { Renderer }                 from "@engine/rendering/Renderer";
import { DoodadSystem }             from "@engine/systems/DoodadSystem";
import { PlayerSystem }             from "@engine/systems/PlayerSystem";
import { BuildSystem }              from "@engine/systems/BuildSystem";
import { ExtractorSystem }          from "@engine/systems/ExtractorSystem";
import { BeltSystem }               from "@engine/systems/BeltSystem";
import { DoodadInteractionSystem }  from "@engine/systems/DoodadInteractionSystem";
import { WorldGen }                 from "@engine/world/WorldGen";
import { InventoryUI }              from "@game/ui/InventoryUI";
import { BuildUI }                  from "@game/ui/BuildUI";
import { ChestUI }                  from "@game/ui/ChestUI";
import { DoodadUI }                 from "@game/ui/DoodadUI";

bootstrapContent();

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
if (!canvas) throw new Error("No #game-canvas element found.");
const renderer = new Renderer(canvas);
function onResize() { renderer.resize(window.innerWidth, window.innerHeight); }
window.addEventListener("resize", onResize);
onResize();

const playerSystem       = new PlayerSystem();
const doodadSystem       = new DoodadSystem();
const extractorSystem    = new ExtractorSystem();
const beltSystem         = new BeltSystem();
const interactionSystem  = new DoodadInteractionSystem();
const worldGen           = new WorldGen();
const buildSystem        = new BuildSystem(renderer);
renderer.buildSystem     = buildSystem;

const inventoryUI = new InventoryUI();
const buildUI     = new BuildUI();
const chestUI     = new ChestUI();
const doodadUI    = new DoodadUI();
playerSystem.setFeedbackUI(inventoryUI);

const loaded = sm.load();
if (!loaded) {
  console.info("[main] No save — starting new game.");
  worldGen.ensureChunksAround(0, 0, GameConfig.RENDER_CHUNK_RADIUS);
}

setInterval(() => sm.save(), 60_000);

const loop = new GameLoop(
  renderer, playerSystem, doodadSystem,
  buildSystem, extractorSystem, beltSystem,
  interactionSystem, worldGen,
);
loop.setBuildUI(buildUI);
loop.setChestUI(chestUI);
loop.setDoodadUI(doodadUI);
loop.start();

(window as unknown as Record<string, unknown>).__game = {
  sm, registry, loop, inventoryUI, buildUI, chestUI, doodadUI, buildSystem, interactionSystem,
};

// Debug — open browser console and type:
// __debug.extractors()       show all extractor state
// __debug.tile(tx, ty)       show tile type at grid coords
(window as unknown as Record<string, unknown>).__debug = {
  extractors: () => {
    for (const d of Object.values(sm.state.doodads)) {
      const def = registry.findDoodad(d.defId);
      if (!def?.machineTag?.startsWith("extractor")) continue;
      const CS = 16, tx = d.origin.tx, ty = d.origin.ty;
      const chunk = sm.getChunk(Math.floor(tx/CS), Math.floor(ty/CS));
      const lx = ((tx%CS)+CS)%CS, ly = ((ty%CS)+CS)%CS;
      const tile = chunk?.tiles[ly]?.[lx];
      console.log(`[Extractor] @ (${tx},${ty}) powered:${d.powered} tile:${tile?.type ?? "NO_CHUNK"} accum:${Math.round(d.tickAccumulatorMs)}ms inv:${JSON.stringify(d.inventory[0])}`);
    }
  },
  tile: (tx: number, ty: number) => {
    const CS = 16;
    const chunk = sm.getChunk(Math.floor(tx/CS), Math.floor(ty/CS));
    const lx = ((tx%CS)+CS)%CS, ly = ((ty%CS)+CS)%CS;
    console.log(chunk?.tiles[ly]?.[lx] ?? "no chunk loaded");
  },
};
console.info("🌍 Digitized Overseer — Phase 5 booted. Use __debug.extractors() in console.");
