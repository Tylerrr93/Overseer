// ============================================================
//  src/main.ts  — Phase 5: Power Grid
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
import { GeneratorSystem }          from "@engine/systems/GeneratorSystem";
import { PowerSystem }              from "@engine/systems/PowerSystem";
import { DoodadInteractionSystem }  from "@engine/systems/DoodadInteractionSystem";
import { WorldGen }                 from "@engine/world/WorldGen";
import { InventoryUI }              from "@game/ui/InventoryUI";
import { BuildUI }                  from "@game/ui/BuildUI";
import { ChestUI }                  from "@game/ui/ChestUI";
import { DoodadUI }                 from "@game/ui/DoodadUI";
import { PowerUI }                  from "@game/ui/PowerUI";

// ── 1. Content ───────────────────────────────────────────────
bootstrapContent();

// ── 2. Canvas ────────────────────────────────────────────────
const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
if (!canvas) throw new Error("No #game-canvas element found.");
const renderer = new Renderer(canvas);
function onResize() { renderer.resize(window.innerWidth, window.innerHeight); }
window.addEventListener("resize", onResize);
onResize();

// ── 3. Systems ───────────────────────────────────────────────
const playerSystem       = new PlayerSystem();
const doodadSystem       = new DoodadSystem();
const extractorSystem    = new ExtractorSystem();
const beltSystem         = new BeltSystem();
const generatorSystem    = new GeneratorSystem();
const powerSystem        = new PowerSystem();
const interactionSystem  = new DoodadInteractionSystem();
const worldGen           = new WorldGen();
const buildSystem        = new BuildSystem(renderer);

renderer.buildSystem = buildSystem;
renderer.powerSystem = powerSystem;

// ── 4. UI ────────────────────────────────────────────────────
const inventoryUI = new InventoryUI();
const buildUI     = new BuildUI();
const chestUI     = new ChestUI();
const doodadUI    = new DoodadUI();
const powerUI     = new PowerUI();
powerUI.setPowerSystem(powerSystem);
playerSystem.setFeedbackUI(inventoryUI);

// ── 5. State ─────────────────────────────────────────────────
const loaded = sm.load();
if (!loaded) {
  console.info("[main] No save — starting new game.");
  worldGen.ensureChunksAround(0, 0, GameConfig.RENDER_CHUNK_RADIUS);
}

// ── 6. Auto-save ─────────────────────────────────────────────
setInterval(() => sm.save(), 60_000);

// ── 7. Game loop ─────────────────────────────────────────────
const loop = new GameLoop(
  renderer, playerSystem, doodadSystem,
  buildSystem, extractorSystem, beltSystem,
  generatorSystem, powerSystem,
  interactionSystem, worldGen,
);
loop.setBuildUI(buildUI);
loop.setChestUI(chestUI);
loop.setDoodadUI(doodadUI);
loop.setPowerUI(powerUI);
loop.start();

// ── 8. Debug ─────────────────────────────────────────────────
(window as unknown as Record<string, unknown>).__game = {
  sm, registry, loop, inventoryUI, buildUI, chestUI, doodadUI,
  buildSystem, interactionSystem, powerSystem, generatorSystem, powerUI,
};

(window as unknown as Record<string, unknown>).__debug = {
  extractors: () => {
    for (const d of Object.values(sm.state.doodads)) {
      const def = registry.findDoodad(d.defId);
      if (!def?.machineTag?.startsWith("extractor")) continue;
      const CS = 16, tx = d.origin.tx, ty = d.origin.ty;
      const chunk = sm.getChunk(Math.floor(tx/CS), Math.floor(ty/CS));
      const lx = ((tx%CS)+CS)%CS, ly = ((ty%CS)+CS)%CS;
      const tile = chunk?.tiles[ly]?.[lx];
      console.log(`[Extractor] @ (${tx},${ty}) powered:${d.powered} tile:${tile?.type ?? "NO_CHUNK"} accum:${Math.round(d.tickAccumulatorMs)}ms inv:${JSON.stringify(d.inventory)}`);
    }
  },
  power: () => {
    console.log(`Networks: ${powerSystem.nodeConnections.length} node connections`);
    console.log(`Attachments: ${powerSystem.attachments.length}`);
    for (const d of Object.values(sm.state.doodads)) {
      const def = registry.findDoodad(d.defId);
      if (!def || def.powerDraw === 0) continue;
      console.log(`[Machine] ${def.name} powered:${d.powered} fuelBurn:${JSON.stringify(d.fuelBurn)}`);
    }
    for (const d of Object.values(sm.state.doodads)) {
      const def = registry.findDoodad(d.defId);
      if (!def?.powerGeneration) continue;
      console.log(`[Generator] ${def.name} active:${d.fuelBurn && d.fuelBurn.remainingMs > 0} fuel:${JSON.stringify(d.inventory[0])}`);
    }
  },
  tile: (tx: number, ty: number) => {
    const CS = 16;
    const chunk = sm.getChunk(Math.floor(tx/CS), Math.floor(ty/CS));
    const lx = ((tx%CS)+CS)%CS, ly = ((ty%CS)+CS)%CS;
    console.log(chunk?.tiles[ly]?.[lx] ?? "no chunk loaded");
  },
};

console.info("🌍 Digitized Overseer — Phase 5 (Power Grid) booted.");
console.info("   Hold Alt to show power grid overlay.");
console.info("   __debug.power() to inspect power state.");
