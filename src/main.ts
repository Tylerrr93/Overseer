// ============================================================
//  src/main.ts
//  Application entry point.
//  Wires the engine together, registers content, starts loop.
// ============================================================

import { bootstrapContent } from "@game/content/index";
import { registry }         from "@engine/core/Registry";
import { sm }               from "@engine/core/StateManager";
import { GameLoop }         from "@engine/core/GameLoop";
import { GameConfig }       from "@engine/core/GameConfig";
import { Renderer }         from "@engine/rendering/Renderer";
import { DoodadSystem }     from "@engine/systems/DoodadSystem";
import { PlayerSystem }     from "@engine/systems/PlayerSystem";
import { WorldGen }         from "@engine/world/WorldGen";

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

// ── 4. State: load save or start fresh ───────────────────────
const loaded = sm.load();
if (!loaded) {
  console.info("[main] No save found — starting new game.");
  // Seed the world around origin
  worldGen.ensureChunksAround(0, 0, GameConfig.RENDER_CHUNK_RADIUS);
}

// ── 5. Demo: place a smelter so you can see tick in action ───
if (!loaded) {
  const { v4: uuidv4 } = await import("https://cdn.jsdelivr.net/npm/uuid@9/+esm") as { v4: () => string };

  const smelterDef = registry.getDoodad("basic_smelter");
  sm.addDoodad({
    id:                uuidv4(),
    defId:             "basic_smelter",
    origin:            { tx: 2, ty: 2 },
    rotation:          0,
    inventory:         smelterDef.slots.map(_ => null),
    crafting:          null,
    powered:           true,
    tickAccumulatorMs: 0,
  });

  // Give the smelter some starter ore and coal to show crafting
  const smelter = Object.values(sm.state.doodads)[0]!;
  smelter.inventory[0] = { itemId: "iron_ore", qty: 20 };
  smelter.inventory[1] = { itemId: "coal",     qty: 10 };
}

// ── 6. Auto-save every 60 seconds ────────────────────────────
setInterval(() => sm.save(), 60_000);

// ── 7. Start the game loop ────────────────────────────────────
const loop = new GameLoop(renderer, playerSystem, doodadSystem, worldGen);
loop.start();

// ── 8. Expose to console for debugging ───────────────────────
(window as unknown as Record<string, unknown>).__game = { sm, registry, loop };
console.info("🌍 Digitized Overseer booted. Access __game in console.");
