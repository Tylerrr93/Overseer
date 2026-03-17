// ============================================================
//  src/engine/core/GameLoop.ts
//  Drives the update/render cycle.
// ============================================================

import type { Renderer }     from "@engine/rendering/Renderer";
import type { DoodadSystem } from "@engine/systems/DoodadSystem";
import type { PlayerSystem } from "@engine/systems/PlayerSystem";
import type { BuildSystem }  from "@engine/systems/BuildSystem";
import type { WorldGen }     from "@engine/world/WorldGen";
import { GameConfig } from "./GameConfig";
import { sm } from "./StateManager";

// Minimal interface so GameLoop doesn't import @game
interface Tickable { tick(): void; }

const MAX_DELTA_MS = 200;

export class GameLoop {
  private running = false;
  private lastTs  = 0;
  private rafId   = 0;

  private buildUI: Tickable | null = null;

  constructor(
    private readonly renderer:     Renderer,
    private readonly playerSystem: PlayerSystem,
    private readonly doodadSystem: DoodadSystem,
    private readonly buildSystem:  BuildSystem,
    private readonly worldGen:     WorldGen,
  ) {}

  /** Wire in the BuildUI so the HUD label updates each frame. */
  setBuildUI(ui: Tickable): void {
    this.buildUI = ui;
  }

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

    // ── Update phase ────────────────────────────────────────
    this.playerSystem.update(delta);

    const { x, y } = sm.state.player.pos;
    this.worldGen.ensureChunksAround(x, y, GameConfig.RENDER_CHUNK_RADIUS);

    this.buildSystem.update(delta);
    this.doodadSystem.update(delta);

    this.buildUI?.tick();

    sm.state.tickCount++;

    // ── Render phase ────────────────────────────────────────
    this.renderer.render();

    this.rafId = requestAnimationFrame(ts => this.tick(ts));
  }
}
