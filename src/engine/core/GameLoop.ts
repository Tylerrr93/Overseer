// ============================================================
//  src/engine/core/GameLoop.ts
// ============================================================

import type { Renderer }                from "@engine/rendering/Renderer";
import type { DoodadSystem }            from "@engine/systems/DoodadSystem";
import type { PlayerSystem }            from "@engine/systems/PlayerSystem";
import type { BuildSystem }             from "@engine/systems/BuildSystem";
import type { ExtractorSystem }         from "@engine/systems/ExtractorSystem";
import type { BeltSystem }              from "@engine/systems/BeltSystem";
import type { GeneratorSystem }         from "@engine/systems/GeneratorSystem";
import type { PowerSystem }             from "@engine/systems/PowerSystem";
import type { DoodadInteractionSystem } from "@engine/systems/DoodadInteractionSystem";
import type { WorldGen }                from "@engine/world/WorldGen";
import { GameConfig } from "./GameConfig";
import { sm } from "./StateManager";

interface BuildUITickable  { tick(): void; }
interface ChestUITickable  { tick(nearbyId: string | null): void; }
interface DoodadUITickable { tick(nearbyId: string | null): void; }
interface PowerUITickable  { tick(): void; }
interface ActionBarTickable { tick(): void; }

const MAX_DELTA_MS = 200;

export class GameLoop {
  private running  = false;
  private lastTs   = 0;
  private rafId    = 0;
  private buildUI:  BuildUITickable  | null = null;
  private chestUI:  ChestUITickable  | null = null;
  private doodadUI: DoodadUITickable | null = null;
  private powerUI:  PowerUITickable  | null = null;
  private actionBarUI: ActionBarTickable | null = null;
  
  setActionBarUI(ui: ActionBarTickable): void { this.actionBarUI = ui; }

  constructor(
    private readonly renderer:           Renderer,
    private readonly playerSystem:       PlayerSystem,
    private readonly doodadSystem:       DoodadSystem,
    private readonly buildSystem:        BuildSystem,
    private readonly extractorSystem:    ExtractorSystem,
    private readonly beltSystem:         BeltSystem,
    private readonly generatorSystem:    GeneratorSystem,
    private readonly powerSystem:        PowerSystem,
    private readonly interactionSystem:  DoodadInteractionSystem,
    private readonly worldGen:           WorldGen,
  ) {}

  setBuildUI(ui: BuildUITickable):   void { this.buildUI  = ui; }
  setChestUI(ui: ChestUITickable):   void { this.chestUI  = ui; }
  setDoodadUI(ui: DoodadUITickable): void { this.doodadUI = ui; }
  setPowerUI(ui: PowerUITickable):   void { this.powerUI  = ui; }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTs  = performance.now();
    this.rafId   = requestAnimationFrame(ts => this.tick(ts));
    console.info("[GameLoop] Started.");
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    console.info("[GameLoop] Stopped.");
  }

  private tick(ts: number): void {
    if (!this.running) return;

    const rawDelta = ts - this.lastTs;
    const delta    = Math.min(rawDelta, MAX_DELTA_MS);
    this.lastTs    = ts;

    // ── Update order ────────────────────────────────────────
    this.playerSystem.update(delta);

    const { x, y } = sm.state.player.pos;
    this.worldGen.ensureChunksAround(x, y, GameConfig.RENDER_CHUNK_RADIUS);

    this.buildSystem.update(delta);
    this.extractorSystem.update(delta);

    // Power pipeline: generators burn fuel → power system distributes
    this.generatorSystem.update(delta);
    this.powerSystem.update(delta);

    // Doodads craft (using powered state set by PowerSystem)
    this.doodadSystem.update(delta);

    this.beltSystem.update(delta);
    this.interactionSystem.update(delta);

    this.buildUI?.tick();
    this.chestUI?.tick(this.interactionSystem.nearestInteractableId);
    this.doodadUI?.tick(this.interactionSystem.nearestInteractableId);
    this.powerUI?.tick();
    this.actionBarUI?.tick();

    sm.state.tickCount++;

    this.renderer.render();
    this.rafId = requestAnimationFrame(ts => this.tick(ts));
  }
}
