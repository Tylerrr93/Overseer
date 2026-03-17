// ============================================================
//  src/engine/core/GameLoop.ts
//  Drives the update/render cycle.
//
//  Uses a fixed-timestep accumulator for simulation (prevents
//  spiral-of-death on slow frames) with uncapped render.
// ============================================================

import type { Renderer } from "@engine/rendering/Renderer";
import type { DoodadSystem } from "@engine/systems/DoodadSystem";
import type { PlayerSystem } from "@engine/systems/PlayerSystem";
import type { WorldGen } from "@engine/world/WorldGen";
import { GameConfig } from "./GameConfig";
import { sm } from "./StateManager";

const MAX_DELTA_MS = 200; // clamp runaway frames (tab backgrounded, etc.)

export class GameLoop {
  private running = false;
  private lastTs  = 0;
  private rafId   = 0;

  constructor(
    private readonly renderer:     Renderer,
    private readonly playerSystem: PlayerSystem,
    private readonly doodadSystem: DoodadSystem,
    private readonly worldGen:     WorldGen,
  ) {}

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

    // Ensure terrain around player is generated
    const { x, y } = sm.state.player.pos;
    this.worldGen.ensureChunksAround(x, y, GameConfig.RENDER_CHUNK_RADIUS);

    // Systems that run on deltaMs (doodads throttle internally)
    this.doodadSystem.update(delta);

    sm.state.tickCount++;

    // ── Render phase ────────────────────────────────────────
    this.renderer.render();

    this.rafId = requestAnimationFrame(ts => this.tick(ts));
  }
}
