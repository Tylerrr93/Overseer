// ============================================================
//  src/main.ts
//  Application entry point — Phase 4
// ============================================================

import { bootstrapContent }  from "@game/content/index";
import { registry }          from "@engine/core/Registry";
import { sm }                from "@engine/core/StateManager";
import { GameLoop }          from "@engine/core/GameLoop";
import { GameConfig }        from "@engine/core/GameConfig";
import { Renderer }          from "@engine/rendering/Renderer";
import { DoodadSystem }      from "@engine/systems/DoodadSystem";
import { PlayerSystem }      from "@engine/systems/PlayerSystem";
import { BuildSystem }       from "@engine/systems/BuildSystem";
import { ExtractorSystem }   from "@engine/systems/ExtractorSystem";
import { BeltSystem }        from "@engine/systems/BeltSystem";
import { WorldGen }          from "@engine/world/WorldGen";
import { InventoryUI }       from "@game/ui/InventoryUI";
import { BuildUI }           from "@game/ui/BuildUI";

// ── 1. Content ───────────────────────────────────────────────
bootstrapContent();

// ── 2. Canvas ────────────────────────────────────────────────
const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
if (!canvas) throw new Error("No #game-canvas element found.");
const renderer = new Renderer(canvas);
function onResize(): void { renderer.resize(window.innerWidth, window.innerHeight); }
window.addEventListener("resize", onResize);
onResize();

// ── 3. Systems ───────────────────────────────────────────────
const playerSystem    = new PlayerSystem();
const doodadSystem    = new DoodadSystem();
const extractorSystem = new ExtractorSystem();
const beltSystem      = new BeltSystem();
const worldGen        = new WorldGen();
const buildSystem     = new BuildSystem(renderer);
renderer.buildSystem  = buildSystem;

// ── 4. UI ────────────────────────────────────────────────────
const inventoryUI = new InventoryUI();
const buildUI     = new BuildUI();
playerSystem.setFeedbackUI(inventoryUI);

// ── 5. State ─────────────────────────────────────────────────
const loaded = sm.load();
if (!loaded) {
  console.info("[main] No save found — starting new game.");
  worldGen.ensureChunksAround(0, 0, GameConfig.RENDER_CHUNK_RADIUS);
}

// ── 6. Auto-save ─────────────────────────────────────────────
setInterval(() => sm.save(), 60_000);

// ── 7. Loop ──────────────────────────────────────────────────
const loop = new GameLoop(
  renderer, playerSystem, doodadSystem,
  buildSystem, extractorSystem, beltSystem, worldGen,
);
loop.setBuildUI(buildUI);
loop.start();

// ── 8. Debug ─────────────────────────────────────────────────
(window as unknown as Record<string, unknown>).__game = {
  sm, registry, loop, inventoryUI, buildUI, buildSystem,
};
console.info("🌍 Digitized Overseer — Phase 4 booted.");
