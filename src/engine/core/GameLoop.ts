// ============================================================
//  src/engine/core/GameLoop.ts
// ============================================================

import type { Renderer }         from "@engine/rendering/Renderer";
import type { DoodadSystem }     from "@engine/systems/DoodadSystem";
import type { PlayerSystem }     from "@engine/systems/PlayerSystem";
import type { BuildSystem }      from "@engine/systems/BuildSystem";
import type { ExtractorSystem }  from "@engine/systems/ExtractorSystem";
import type { BeltSystem }       from "@engine/systems/BeltSystem";
import type { WorldGen }         from "@engine/world/WorldGen";
import { GameConfig } from "./GameConfig";
import { sm } from "./StateManager";

interface Tickable { tick(): void; }

const MAX_DELTA_MS = 200;

export class GameLoop {
  private running = false;
  private lastTs  = 0;
  private rafId   = 0;
  private buildUI: Tickable | null = null;

  constructor(
    private readonly renderer:        Renderer,
    private readonly playerSystem:    PlayerSystem,
    private readonly doodadSystem:    DoodadSystem,
    private readonly buildSystem:     BuildSystem,
    private readonly extractorSystem: ExtractorSystem,
    private readonly beltSystem:      BeltSystem,
    private readonly worldGen:        WorldGen,
  ) {}

  setBuildUI(ui: Tickable): void { this.buildUI = ui; }

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

    // ── Update order matters ─────────────────────────────────
    // 1. Player input + movement
    this.playerSystem.update(delta);

    // 2. Terrain generation around player
    const { x, y } = sm.state.player.pos;
    this.worldGen.ensureChunksAround(x, y, GameConfig.RENDER_CHUNK_RADIUS);

    // 3. Build mode cursor / ghost validation
    this.buildSystem.update(delta);

    // 4. Extractors mine ore → fill their output slots
    this.extractorSystem.update(delta);

    // 5. Machines craft + push output slots → adjacent belts
    this.doodadSystem.update(delta);

    // 6. Belts advance items + hand off to next segment
    this.beltSystem.update(delta);

    // 7. UI tick (HUD label)
    this.buildUI?.tick();

    sm.state.tickCount++;

    // ── Render ───────────────────────────────────────────────
    this.renderer.render();

    this.rafId = requestAnimationFrame(ts => this.tick(ts));
  }
}
