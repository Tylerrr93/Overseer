// ============================================================
//  src/main.ts  — PixiJS build
//
//  Key change from Canvas 2D version:
//    renderer.init() is async (PixiJS sets up the WebGL context).
//    Everything runs inside async main() so we can await it
//    before the game loop starts.
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
import { ActionBarUI }              from "@game/ui/ActionBarUI";

async function main() {
  // ── 1. Content ─────────────────────────────────────────────
  bootstrapContent();

  // ── 2. Canvas + Renderer ───────────────────────────────────
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
  if (!canvas) throw new Error("No #game-canvas element found.");

  const renderer = new Renderer(canvas);

  // PixiJS v8 Application.init() is async — must complete before render() is called.
  await renderer.init();

  window.addEventListener("resize", () => {
    renderer.resize(window.innerWidth, window.innerHeight);
  });

  // ── 3. Systems ─────────────────────────────────────────────
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

  // ── 4. UI ──────────────────────────────────────────────────
  const inventoryUI = new InventoryUI();
  const buildUI     = new BuildUI();
  const chestUI     = new ChestUI();
  const doodadUI    = new DoodadUI();
  const powerUI     = new PowerUI();
  const actionBarUI = new ActionBarUI();
  powerUI.setPowerSystem(powerSystem);
  playerSystem.setFeedbackUI(inventoryUI);

  // ── 5. State ───────────────────────────────────────────────
  const loaded = sm.load();
  if (!loaded) {
    console.info("[main] No save — starting new game.");
    worldGen.ensureChunksAround(0, 0, GameConfig.RENDER_CHUNK_RADIUS);
  }

  // ── 6. Auto-save ───────────────────────────────────────────
  setInterval(() => sm.save(), 60_000);

  // ── 7. Game loop ───────────────────────────────────────────
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
  loop.setActionBarUI(actionBarUI);
  loop.start();

  // ── 8. Debug ───────────────────────────────────────────────
  (window as unknown as Record<string, unknown>).__game = {
    sm, registry, loop, inventoryUI, buildUI, chestUI, doodadUI,
    buildSystem, interactionSystem, powerSystem, generatorSystem, powerUI,
  };

  console.info("🌍 Digitized Overseer — PixiJS v8 renderer booted.");
  console.info("   Hold Alt to show power grid overlay.");
}

main().catch(err => {
  console.error("[main] Fatal error during startup:", err);
});
