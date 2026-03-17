// ============================================================
//  src/main.ts
//  Application entry point.
// ============================================================

import { bootstrapContent } from "@game/content/index";
import { registry }         from "@engine/core/Registry";
import { sm }               from "@engine/core/StateManager";
import { GameLoop }         from "@engine/core/GameLoop";
import { GameConfig }       from "@engine/core/GameConfig";
import { Renderer }         from "@engine/rendering/Renderer";
import { DoodadSystem }     from "@engine/systems/DoodadSystem";
import { PlayerSystem }     from "@engine/systems/PlayerSystem";
import { BuildSystem }      from "@engine/systems/BuildSystem";
import { WorldGen }         from "@engine/world/WorldGen";
import { InventoryUI }      from "@game/ui/InventoryUI";
import { BuildUI }          from "@game/ui/BuildUI";

// ── 1. Register all game content ─────────────────────────────
bootstrapContent();

// ── 2. Canvas setup ──────────────────────────────────────────
const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
if (!canvas) throw new Error("No #game-canvas element found.");

const renderer = new Renderer(canvas);

function onResize(): void {
  renderer.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", onResize);
onResize();

// ── 3. Systems ───────────────────────────────────────────────
const playerSystem = new PlayerSystem();
const doodadSystem = new DoodadSystem();
const worldGen     = new WorldGen();
const buildSystem  = new BuildSystem(renderer);

// Wire build system into renderer so it can colour the ghost
renderer.buildSystem = buildSystem;

// ── 4. UI ────────────────────────────────────────────────────
const inventoryUI = new InventoryUI();
const buildUI     = new BuildUI();
playerSystem.setFeedbackUI(inventoryUI);

// ── 5. State: load save or start fresh ───────────────────────
const loaded = sm.load();
if (!loaded) {
  console.info("[main] No save found — starting new game.");
  worldGen.ensureChunksAround(0, 0, GameConfig.RENDER_CHUNK_RADIUS);
}

// ── 6. Auto-save every 60 seconds ────────────────────────────
setInterval(() => sm.save(), 60_000);

// ── 7. Game loop ─────────────────────────────────────────────
const loop = new GameLoop(renderer, playerSystem, doodadSystem, buildSystem, worldGen);
loop.setBuildUI(buildUI);
loop.start();

// ── 8. Console debug ─────────────────────────────────────────
(window as unknown as Record<string, unknown>).__game = {
  sm, registry, loop, inventoryUI, buildUI, buildSystem,
};
console.info("🌍 Digitized Overseer booted. Access __game in console.");
