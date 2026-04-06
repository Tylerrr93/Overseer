// ============================================================
//  src/engine/rendering/Renderer.ts  — PixiJS v8 rewrite
//
//  Golden rule: PIXI objects live ONLY inside this file.
//  GameState stays pure JSON — no sprite refs in state.
//
//  Scene layers (back → front):
//    worldContainer
//      tileLayer    — per-chunk RenderTexture sprites (baked once)
//      beltLayer    — belt segment sprites (cached by direction)
//      doodadLayer  — persistent Container per doodad
//      itemLayer    — belt item pool (recycled every frame)
//      entityLayer  — player Graphics
//      overlayLayer — port indicators, progress bars, power grid,
//                     build grid, ghost (cleared + redrawn each frame)
//    hudLayer       — screen-space HUD (not in worldContainer)
//
//  Adding a texture to a doodad:
//    1. Drop `public/assets/my_machine.png` in the project.
//    2. Add  texture: "assets/my_machine.png"  to the DoodadDef.
//    3. For animation add:
//         animations: {
//           idle:   ["assets/my_machine_idle.png"],
//           active: ["assets/my_machine_a1.png", "assets/my_machine_a2.png"],
//         }
//    The renderer resolves keys through PIXI.Assets; if the asset
//    is not loaded yet, it falls back to the hex-colour placeholder
//    automatically — you can add art one doodad at a time.
// ============================================================

import * as PIXI from "pixi.js";
import { sm }          from "@engine/core/StateManager";
import { registry }    from "@engine/core/Registry";
import { bus }         from "@engine/core/EventBus";
import { GameConfig }  from "@engine/core/GameConfig";
import { DIR_DELTA, rotateDir, rotationToDir } from "@engine/utils/portUtils";
import type { CardinalDir, DoodadDef, DoodadPort } from "@t/content";
import type { DoodadState }                        from "@t/state";

// ── Interfaces (same shape as before — BuildSystem/PowerUI still work) ──

export interface IBuildSystem {
  lastPlacementValid: boolean;
  validate(origin: { tx: number; ty: number }, w: number, h: number): boolean;
}

export interface IPowerSystem {
  nodeConnections: { ax: number; ay: number; bx: number; by: number }[];
  attachments:     { mx: number; my: number; nx: number; ny: number; powered: boolean }[];
}

// ── Constants ────────────────────────────────────────────────

const T  = GameConfig.TILE_SIZE;
const CS = GameConfig.CHUNK_SIZE;

const TILE_COLOR: Record<string, number> = {
  void:        0x0a0a0a,
  ground:      0x1e1e14,
  rubble:      0x2e2820,
  rock:        0x1a1a1a,
  irradiated:  0x1a240a,
  water:       0x0d2a3d,
  organic:     0x1a2a0d,
  // Legacy ore tile types — rendered as ground-equivalent if somehow present
  ore_iron:    0x1e1e14,
  ore_copper:  0x1e1e14,
  ore_coal:    0x1e1e14,
};

const PORT_OUT  = 0x00ff64;
const PORT_IN   = 0x50a0ff;
const PORT_SIZE = 5;

// ── Internal helpers ──────────────────────────────────────────

function hexToNum(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

function rotatedFP(w: number, h: number, rot: number) {
  return (rot % 2 === 0) ? { w, h } : { w: h, h: w };
}

/** AnimatedSprite extended with frame arrays for state-switching. */
interface DoodadAnimSprite extends PIXI.AnimatedSprite {
  _idleFrames:   PIXI.Texture[];
  _activeFrames: PIXI.Texture[];
}

// ── Renderer ─────────────────────────────────────────────────

export class Renderer {
  /** Kept for BuildSystem mouse → world coordinate math. */
  readonly canvas: HTMLCanvasElement;
  cameraX = 0;
  cameraY = 0;
  zoomLevel = 1.0;

  buildSystem: IBuildSystem | null = null;
  powerSystem: IPowerSystem | null = null;

  private app!: PIXI.Application;
  private ready = false;
  private showPowerGrid = false;

  // ── Layers ────────────────────────────────────────────────
  private worldContainer!: PIXI.Container;
  private tileLayer!:       PIXI.Container;
  private featureLayer!:    PIXI.Container;  // resource nodes — above tiles, below belts
  private beltLayer!:       PIXI.Container;
  private doodadLayer!:     PIXI.Container;
  private itemLayer!:       PIXI.Container;
  private entityLayer!:     PIXI.Container;
  private overlayLayer!:    PIXI.Container;
  private hudLayer!:        PIXI.Container;

  // ── Graphics objects ──────────────────────────────────────
  private playerGfx!:  PIXI.Graphics;
  private overlayGfx!: PIXI.Graphics;

  // ── HUD text ──────────────────────────────────────────────
  private hudBg!:    PIXI.Graphics;
  private hudTitle!: PIXI.Text;
  private hudPos!:   PIXI.Text;

  // ── Tile sync ─────────────────────────────────────────────
  private seenChunks   = new Set<string>();
  private chunkSprites = new Map<string, PIXI.Sprite>();

  // ── Feature sync ──────────────────────────────────────────
  /** "tx,ty" → feature sprite — cleared when feature is depleted */
  private featureSprites  = new Map<string, PIXI.Graphics>();

  // ── Doodad sync ───────────────────────────────────────────
  /** doodadId → Container(body + border + label) */
  private doodadSprites   = new Map<string, PIXI.Container>();
  /** doodadId → "idle" | "active" — dirty-check for anim swap */
  private doodadAnimState = new Map<string, string>();

  // ── Belt sync ─────────────────────────────────────────────
  private beltSprites     = new Map<string, PIXI.Sprite>();
  private beltTexCache    = new Map<string, PIXI.Texture>();

  // ── Belt item pool ────────────────────────────────────────
  /** Sprites returned to pool at frame start, pulled back each item. */
  private itemPool: PIXI.Sprite[] = [];

  // ── Texture cache ─────────────────────────────────────────
  private placeholderCache = new Map<string, PIXI.Texture>();
  /** PNG keys currently loading — prevents duplicate PIXI.Assets.load() calls. */
  private pendingLoads     = new Set<string>();

  // ─────────────────────────────────────────────────────────

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  // ── Async init ────────────────────────────────────────────

  async init(): Promise<void> {
    this.app = new PIXI.Application();
    await this.app.init({
      canvas:      this.canvas,
      width:       window.innerWidth,
      height:      window.innerHeight,
      background:  0x0a0a0a,
      antialias:   false,
      resolution:  window.devicePixelRatio ?? 1,
      autoDensity: true,
      autoStart:   false,   // GameLoop drives ticks; no auto RAF
    });
    this.app.ticker.stop(); // belt-and-suspenders

    // ── Scene graph ──────────────────────────────────────────
    this.worldContainer = new PIXI.Container();
    this.app.stage.addChild(this.worldContainer);

    this.tileLayer    = new PIXI.Container();
    this.featureLayer = new PIXI.Container();
    this.beltLayer    = new PIXI.Container();
    this.doodadLayer  = new PIXI.Container();
    this.itemLayer    = new PIXI.Container();
    this.entityLayer  = new PIXI.Container();
    this.overlayLayer = new PIXI.Container();

    for (const layer of [
      this.tileLayer, this.featureLayer, this.beltLayer, this.doodadLayer,
      this.itemLayer, this.entityLayer, this.overlayLayer,
    ]) this.worldContainer.addChild(layer);

    // Overlay and player are persistent Graphics; overlayGfx clears every frame.
    this.overlayGfx = new PIXI.Graphics();
    this.overlayLayer.addChild(this.overlayGfx);

    this.playerGfx = new PIXI.Graphics();
    this.entityLayer.addChild(this.playerGfx);

    // HUD is screen-space — lives outside worldContainer
    this.hudLayer = new PIXI.Container();
    this.app.stage.addChild(this.hudLayer);
    this.buildHUD();

    // Power overlay is toggled via the event bus (Alt key / ⚡ button both emit it).
    bus.on("power:overlay:toggle", ({ active }) => {
      this.showPowerGrid = active !== undefined ? active : !this.showPowerGrid;
    });

    // Mouse wheel to zoom
    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      // Zoom in if scrolling up (deltaY < 0), zoom out if scrolling down (deltaY > 0)
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      // Clamp the zoom between 0.5x and 3.0x
      this.zoomLevel = Math.max(0.5, Math.min(3.0, this.zoomLevel * zoomFactor));
    }, { passive: false });

    this.ready = true;
    console.info("[Renderer] PixiJS v8 ready.");
  }

  resize(w: number, h: number): void {
    if (!this.ready) return;
    this.app.renderer.resize(w, h);
  }

  // ── Main render — called by GameLoop every frame ──────────

  render(): void {
    if (!this.ready) return;

    // Camera offset (factoring in zoom)
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    
    // Calculate world-space camera position
    this.cameraX = sm.state.player.pos.x - (W / 2) / this.zoomLevel;
    this.cameraY = sm.state.player.pos.y - (H / 2) / this.zoomLevel;

    // Apply scale and offset to the main world container
    this.worldContainer.scale.set(this.zoomLevel);
    this.worldContainer.x = -this.cameraX * this.zoomLevel;
    this.worldContainer.y = -this.cameraY * this.zoomLevel;

    // Sync persistent scene objects
    this.syncTiles();
    this.syncFeatures();
    this.syncBelts();
    this.syncDoodads();
    this.syncBeltItems();
    this.syncPlayer();

    // Overlays — redrawn from scratch every frame
    this.overlayGfx.clear();
    this.drawPortIndicators();
    this.drawProgressBars();
    this.drawPowerGrid();

    if (sm.state.player.heldItemId !== null) {
      this.drawGridOverlay();
      this.drawGhost();
    }

    this.updateHUD();
    this.app.renderer.render(this.app.stage);
  }

  // ── Helpers ───────────────────────────────────────────────

  /** Translates raw screen pixels (mouse) into world map coordinates */
  public screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX / this.zoomLevel) + this.cameraX,
      y: (screenY / this.zoomLevel) + this.cameraY
    };
  }

  // ── Tile sync ─────────────────────────────────────────────
  //  Each 16×16 chunk is baked into a single RenderTexture on
  //  first encounter.  Budget: max 2 new chunks per frame to
  //  avoid frame-time spikes during exploration.

  private syncTiles(): void {
    let budget = 2;
    for (const [key, chunk] of Object.entries(sm.state.chunks)) {
      if (!chunk.generated || this.seenChunks.has(key)) continue;
      if (budget-- <= 0) break;

      this.seenChunks.add(key);
      const chunkPx = CS * T;

      const gfx = new PIXI.Graphics();
      for (let ty = 0; ty < CS; ty++) {
        for (let tx = 0; tx < CS; tx++) {
          const tile = chunk.tiles[ty]?.[tx];
          if (!tile) continue;
          gfx.rect(tx * T, ty * T, T, T).fill(TILE_COLOR[tile.type] ?? 0xff00ff);
        }
      }
      const rt = this.app.renderer.generateTexture({
        target: gfx,
        frame:  new PIXI.Rectangle(0, 0, chunkPx, chunkPx),
      });
      gfx.destroy();

      const sprite = new PIXI.Sprite(rt);
      sprite.x = chunk.cx * CS * T;
      sprite.y = chunk.cy * CS * T;
      this.tileLayer.addChild(sprite);
      this.chunkSprites.set(key, sprite);
    }
  }

  // ── Feature sync ──────────────────────────────────────────
  //  One Graphics square per live feature, keyed by world tile "tx,ty".
  //  When a feature is depleted and removed from chunk.features, its
  //  sprite is destroyed here on the next frame.

  private syncFeatures(): void {
    // Build the full set of live feature keys this frame
    const live = new Set<string>();

    for (const chunk of Object.values(sm.state.chunks)) {
      if (!chunk.generated || !chunk.features) continue;
      for (const [localKey, fs] of Object.entries(chunk.features)) {
        const [lxStr, lyStr] = localKey.split(",");
        const lx = parseInt(lxStr!, 10);
        const ly = parseInt(lyStr!, 10);
        const tx = chunk.cx * CS + lx;
        const ty = chunk.cy * CS + ly;
        const worldKey = `${tx},${ty}`;
        live.add(worldKey);

        if (!this.featureSprites.has(worldKey)) {
          // Resolve the sprite colour from the FeatureDef
          const featureDef = registry.findFeature(fs.featureId);
          const color = featureDef?.sprite.startsWith("#")
            ? hexToNum(featureDef.sprite)
            : 0x888866;

          const gfx = new PIXI.Graphics();
          // Draw an inset filled square with a bright border to stand out from terrain
          const inset = 4;
          gfx.rect(inset, inset, T - inset * 2, T - inset * 2).fill({ color, alpha: 0.92 });
          gfx.rect(inset, inset, T - inset * 2, T - inset * 2)
             .stroke({ color: 0xffffff, width: 1, alpha: 0.25 });
          gfx.x = tx * T;
          gfx.y = ty * T;
          this.featureLayer.addChild(gfx);
          this.featureSprites.set(worldKey, gfx);
        }
      }
    }

    // Remove sprites whose features have been depleted
    for (const [key, gfx] of this.featureSprites) {
      if (!live.has(key)) {
        this.featureLayer.removeChild(gfx);
        gfx.destroy();
        this.featureSprites.delete(key);
      }
    }
  }

  // ── Belt sync ─────────────────────────────────────────────

  private syncBelts(): void {
    const current = new Set<string>();
    for (const belt of Object.values(sm.state.belts)) {
      current.add(belt.id);
      if (!this.beltSprites.has(belt.id)) {
        const spr = new PIXI.Sprite(this.getBeltTexture(belt.direction));
        this.beltLayer.addChild(spr);
        this.beltSprites.set(belt.id, spr);
      }
      const spr = this.beltSprites.get(belt.id)!;
      spr.x = belt.origin.tx * T;
      spr.y = belt.origin.ty * T;
    }
    for (const [id, spr] of this.beltSprites) {
      if (!current.has(id)) {
        this.beltLayer.removeChild(spr);
        spr.destroy({ texture: false });
        this.beltSprites.delete(id);
      }
    }
  }

  /** One baked texture per cardinal direction, cached forever. */
  private getBeltTexture(dir: CardinalDir): PIXI.Texture {
    const key = `belt_${dir}`;
    const cached = this.beltTexCache.get(key);
    if (cached) return cached;

    const gfx = new PIXI.Graphics();
    gfx.rect(1, 1, T - 2, T - 2).fill(0x3a2e14);

    const isNS = dir === "N" || dir === "S";
    if (isNS) {
      gfx.rect(T * 0.3, 1, T * 0.12, T - 2).fill(0x4a3e1e);
      gfx.rect(T * 0.58, 1, T * 0.12, T - 2).fill(0x4a3e1e);
    } else {
      gfx.rect(1, T * 0.3, T - 2, T * 0.12).fill(0x4a3e1e);
      gfx.rect(1, T * 0.58, T - 2, T * 0.12).fill(0x4a3e1e);
    }

    const cx = T / 2, cy = T / 2, arm = T * 0.2;
    const cs = { color: 0xd4a030, width: 2, cap: "round" as const, join: "round" as const };
    switch (dir) {
      case "N": gfx.moveTo(cx-arm, cy+arm).lineTo(cx, cy-arm).lineTo(cx+arm, cy+arm).stroke(cs); break;
      case "E": gfx.moveTo(cx-arm, cy-arm).lineTo(cx+arm, cy).lineTo(cx-arm, cy+arm).stroke(cs); break;
      case "S": gfx.moveTo(cx-arm, cy-arm).lineTo(cx, cy+arm).lineTo(cx+arm, cy-arm).stroke(cs); break;
      case "W": gfx.moveTo(cx+arm, cy-arm).lineTo(cx-arm, cy).lineTo(cx+arm, cy+arm).stroke(cs); break;
    }

    const tex = this.app.renderer.generateTexture({
      target: gfx, frame: new PIXI.Rectangle(0, 0, T, T),
    });
    gfx.destroy();
    this.beltTexCache.set(key, tex);
    return tex;
  }

  // ── Doodad sync ───────────────────────────────────────────

  private syncDoodads(): void {
    const current = new Set<string>();

    for (const doodad of Object.values(sm.state.doodads)) {
      const def = registry.findDoodad(doodad.defId);
      if (!def || def.id === "belt_straight") continue;
      current.add(doodad.id);

      if (!this.doodadSprites.has(doodad.id)) {
        const container = this.makeDoodadContainer(doodad.defId, doodad.rotation);
        this.doodadLayer.addChild(container);
        this.doodadSprites.set(doodad.id, container);
      }

      const container = this.doodadSprites.get(doodad.id)!;
      container.x = doodad.origin.tx * T;
      container.y = doodad.origin.ty * T;

      // Dim blueprints and doodads mid-deconstruct
      container.alpha = doodad.construction ? 0.45 : 1.0;

      this.updateDoodadAnim(doodad.id, container, doodad, def);
    }

    for (const [id, container] of this.doodadSprites) {
      if (!current.has(id)) {
        this.doodadLayer.removeChild(container);
        container.destroy({ children: true, texture: false });
        this.doodadSprites.delete(id);
        this.doodadAnimState.delete(id);
      }
    }
  }

  /**
   * Creates a Container for one doodad with three children:
   *   [0] body  — PIXI.Sprite or PIXI.AnimatedSprite
   *   [1] border — PIXI.Graphics
   *   [2] label  — PIXI.Text
   *
   * The body child has `_isDoodadBody = true` so updateDoodadAnim
   * can locate it without storing extra references.
   */
  private makeDoodadContainer(defId: string, rotation: number): PIXI.Container {
    const def = registry.getDoodad(defId);
    const fp  = rotatedFP(def.footprint.w, def.footprint.h, rotation);
    const pw  = fp.w * T;
    const ph  = fp.h * T;

    const container = new PIXI.Container();

    // ── Body ────────────────────────────────────────────────
    let body: PIXI.Sprite | PIXI.AnimatedSprite;

    // Use original unrotated dimensions for the texture map
    const origW = def.footprint.w * T;
    const origH = def.footprint.h * T;

    if (def.animations) {
      const idleKeys   = def.animations["idle"]   ?? [def.texture ?? def.sprite];
      const activeKeys = def.animations["active"] ?? [def.texture ?? def.sprite];
      const idleFrames   = idleKeys.map(k => this.resolveTexture(k, origW - 4, origH - 4));
      const activeFrames = activeKeys.map(k => this.resolveTexture(k, origW - 4, origH - 4));

      const anim = new PIXI.AnimatedSprite(idleFrames) as DoodadAnimSprite;
      anim._idleFrames   = idleFrames;
      anim._activeFrames = activeFrames;
      anim.animationSpeed = 0.08;
      anim.loop = true;
      anim.gotoAndStop(0);
      body = anim;
    } else {
      // Static — use texture key if present, otherwise hex colour
      const key = def.texture ?? def.sprite;
      body = new PIXI.Sprite(this.resolveTexture(key, origW - 4, origH - 4));
    }

    // Anchor to center so it rotates on its middle axis natively
    body.anchor.set(0.5);
    body.x = pw / 2;
    body.y = ph / 2;
    body.width  = origW - 4;
    body.height = origH - 4;
    body.rotation = rotation * (Math.PI / 2); // Rotate 0, 90, 180, or 270 degrees
    (body as PIXI.Sprite & { _isDoodadBody: boolean })._isDoodadBody = true;
    container.addChild(body);

    // ── Border ───────────────────────────────────────────────
    const border = new PIXI.Graphics();
    border.rect(1, 1, pw - 2, ph - 2).stroke({ color: 0xaaaaaa, width: 1, alpha: 0.7 });
    container.addChild(border);

    // ── Label ────────────────────────────────────────────────
    if (def.showLabel !== false) {
      const label = new PIXI.Text({
        text:  def.name,
        style: { fill: "#eeeeee", fontFamily: "monospace", fontSize: Math.max(8, Math.round(T * 0.28)) },
      });
      label.x = 4; label.y = 2;
      container.addChild(label);
    }

    return container;
  }

  /**
   * Checks if the doodad's active/idle state has changed and, if so,
   * swaps the AnimatedSprite's frame arrays and toggles playback.
   * Uses doodadAnimState as a dirty flag — only runs GPU work on change.
   */
  private updateDoodadAnim(
    id: string,
    container: PIXI.Container,
    doodad: DoodadState,
    def: DoodadDef,
  ): void {
    if (!def.animations) return;

    // Extractors are ticked by ExtractorSystem, which never sets crafting or
    // fuelBurn — it just writes directly to the output slot each cycle.
    // For these, "active" means: grid-powered OR fuel is loaded in the fuel slot.
    const isExtractor = def.machineTag?.startsWith("extractor_") ?? false;
    const extractorActive = isExtractor && (
      doodad.powered ||
      doodad.inventory.some((slot, i) =>
        slot !== null && slot.qty > 0 && def.slots[i]?.role === "fuel"
      )
    );

    const isActive =
      doodad.crafting !== null ||
      (doodad.fuelBurn !== null && (doodad.fuelBurn?.remainingMs ?? 0) > 0) ||
      extractorActive;
    const newState  = isActive ? "active" : "idle";
    if (this.doodadAnimState.get(id) === newState) return;
    this.doodadAnimState.set(id, newState);

    const body = container.children.find(
      c => (c as PIXI.Sprite & { _isDoodadBody?: boolean })._isDoodadBody
    ) as (PIXI.AnimatedSprite & DoodadAnimSprite) | undefined;

    if (!body || !("_idleFrames" in body)) return;

    const frames = newState === "active" ? body._activeFrames : body._idleFrames;
    body.textures = frames;
    if (frames.length > 1) body.play();
    else body.gotoAndStop(0);
  }

  // ── Belt items ────────────────────────────────────────────
  //  Sprites are pooled: returned to the pool at frame start,
  //  pulled (or created) for each visible item, extras hidden.

  private syncBeltItems(): void {
    // Return all active item sprites to pool
    while (this.itemLayer.children.length > 0) {
      const child = this.itemLayer.children[0] as PIXI.Sprite;
      this.itemLayer.removeChild(child);
      this.itemPool.push(child);
    }

    const ITEM_SIZE = T * 0.36;

    for (const belt of Object.values(sm.state.belts)) {
      if (belt.items.length === 0) continue;

      const delta  = DIR_DELTA[belt.direction];
      const startX = belt.origin.tx * T + T / 2;
      const startY = belt.origin.ty * T + T / 2;
      const endX   = startX + delta.dx * T;
      const endY   = startY + delta.dy * T;

      for (const entry of belt.items) {
        const p  = Math.min(entry.progress, 1);
        const ix = startX + (endX - startX) * p;
        const iy = startY + (endY - startY) * p;

        const itemDef = registry.findItem(entry.stack.itemId);
        const color   = itemDef?.sprite.startsWith("#")
          ? hexToNum(itemDef.sprite)
          : 0xaaaaaa;

        // Pull from pool or create
        const spr = this.itemPool.pop() ?? (() => {
          const s = new PIXI.Sprite(PIXI.Texture.WHITE);
          return s;
        })();
        spr.tint   = color;
        spr.width  = ITEM_SIZE;
        spr.height = ITEM_SIZE;
        spr.x = ix - ITEM_SIZE / 2;
        spr.y = iy - ITEM_SIZE / 2;
        this.itemLayer.addChild(spr);
      }
    }
  }

  // ── Player ────────────────────────────────────────────────

  private syncPlayer(): void {
    const { x, y } = sm.state.player.pos;
    const S = T * 0.8;
    this.playerGfx.clear();
    this.playerGfx.circle(x, y, S / 2).fill(0x00e5ff);
    this.playerGfx.circle(x, y, S / 2).stroke({ color: 0xffffff, width: 2 });
  }

  // ── Overlay: port indicators ──────────────────────────────

  private drawPortIndicators(): void {
    for (const doodad of Object.values(sm.state.doodads)) {
      const def = registry.findDoodad(doodad.defId);
      if (!def || def.id === "belt_straight" || !def.ports.length) continue;
      const wx = doodad.origin.tx * T;
      const wy = doodad.origin.ty * T;
      this.drawPorts(wx, wy, def.ports, def.footprint.w, def.footprint.h, doodad.rotation, 1.0);
    }
  }

  private drawPorts(
    ox: number, oy: number,
    ports: DoodadPort[],
    defW: number, defH: number,
    rotation: number,
    alpha: number,
  ): void {
    for (const port of ports) {
      let rdx: number, rdy: number;
      switch (rotation) {
        case 1: rdx = defH - 1 - port.dy; rdy = port.dx;             break;
        case 2: rdx = defW - 1 - port.dx; rdy = defH - 1 - port.dy; break;
        case 3: rdx = port.dy;             rdy = defW - 1 - port.dx; break;
        default: rdx = port.dx;            rdy = port.dy;             break;
      }
      const facingDir = rotateDir(port.dir, rotation);
      const delta = DIR_DELTA[facingDir];
      const ptWx  = ox + rdx * T;
      const ptWy  = oy + rdy * T;
      const ex = ptWx + T / 2 + delta.dx * (T / 2 - PORT_SIZE / 2 - 1);
      const ey = ptWy + T / 2 + delta.dy * (T / 2 - PORT_SIZE / 2 - 1);

      const color = port.role === "output" ? PORT_OUT : PORT_IN;
      this.overlayGfx
        .rect(ex - PORT_SIZE / 2, ey - PORT_SIZE / 2, PORT_SIZE, PORT_SIZE)
        .fill({ color, alpha });

      // Arrow shaft + head
      const a = 4;
      const d = delta;
      const flip = port.role === "output" ? 1 : -1;
      const px2 = d.dy, py2 = -d.dx;
      this.overlayGfx
        .moveTo(ex - d.dx * a * flip, ey - d.dy * a * flip)
        .lineTo(ex + d.dx * a * flip, ey + d.dy * a * flip)
        .stroke({ color, width: 1.5, alpha: alpha * 0.9 });
      this.overlayGfx
        .moveTo(ex + d.dx * a * flip, ey + d.dy * a * flip)
        .lineTo(ex + (d.dx - px2 * 0.5) * a * flip, ey + (d.dy - py2 * 0.5) * a * flip)
        .stroke({ color, width: 1.5, alpha: alpha * 0.9 });
      this.overlayGfx
        .moveTo(ex + d.dx * a * flip, ey + d.dy * a * flip)
        .lineTo(ex + (d.dx + px2 * 0.5) * a * flip, ey + (d.dy + py2 * 0.5) * a * flip)
        .stroke({ color, width: 1.5, alpha: alpha * 0.9 });
    }
  }

  // ── Overlay: crafting progress bars ──────────────────────

  private drawProgressBars(): void {
    for (const doodad of Object.values(sm.state.doodads)) {
      if (!doodad.crafting) continue;
      const def = registry.findDoodad(doodad.defId);
      if (!def) continue;
      const fp = rotatedFP(def.footprint.w, def.footprint.h, doodad.rotation);
      const wx = doodad.origin.tx * T;
      const wy = doodad.origin.ty * T;
      const pw = fp.w * T;
      const ph = fp.h * T;
      const recipe = registry.findRecipe(doodad.crafting.recipeId);
      if (!recipe) continue;
      const pct = Math.min(doodad.crafting.elapsedMs / recipe.craftingTime, 1);
      this.overlayGfx.rect(wx + 4, wy + ph - 8, pw - 8, 4).fill({ color: 0x222222, alpha: 0.85 });
      this.overlayGfx.rect(wx + 4, wy + ph - 8, (pw - 8) * pct, 4).fill({ color: 0x00cc00, alpha: 1 });
    }

    // ── Construction / deconstruct bars (drawn above the doodad) ──
    for (const doodad of Object.values(sm.state.doodads)) {
      const c = doodad.construction;
      if (!c) continue;

      const def = registry.findDoodad(doodad.defId);
      if (!def) continue;

      const fp  = rotatedFP(def.footprint.w, def.footprint.h, doodad.rotation);
      const wx  = doodad.origin.tx * T;
      const wy  = doodad.origin.ty * T;
      const pw  = fp.w * T;
      const pct = Math.min(c.progressMs / c.totalMs, 1);

      // Bar sits 10 px above the doodad top edge
      const barY = wy - 10;

      // Background
      this.overlayGfx
        .rect(wx + 4, barY, pw - 8, 5)
        .fill({ color: 0x111111, alpha: 0.9 });

      // Fill — yellow for building, orange-red for deconstructing
      const fillColor = c.mode === "building" ? 0xffcc00 : 0xff4422;
      this.overlayGfx
        .rect(wx + 4, barY, (pw - 8) * pct, 5)
        .fill({ color: fillColor, alpha: 1 });

      // Thin border
      this.overlayGfx
        .rect(wx + 4, barY, pw - 8, 5)
        .stroke({ color: 0x000000, alpha: 0.5, width: 0.5 });
    }

    // ── Manual harvest progress bar ────────────────────────────
    const hp = sm.state.player.harvestProgress;
    if (hp) {
      const pct    = Math.min(hp.elapsedMs / hp.totalMs, 1);
      const barW   = T - 6;
      const barH   = 5;
      const bx     = hp.tx * T + 3;
      // Position bar just above the top edge of the target tile
      const by     = hp.ty * T - barH - 3;

      // Dark backing track
      this.overlayGfx
        .rect(bx, by, barW, barH)
        .fill({ color: 0x000000, alpha: 0.80 });

      // Animated fill — cyan-green, brightens near completion
      const fillColor = pct > 0.85 ? 0x44ffcc : 0x00cc88;
      this.overlayGfx
        .rect(bx, by, Math.round(barW * pct), barH)
        .fill({ color: fillColor, alpha: 0.95 });

      // Thin border so the bar reads against bright terrain
      this.overlayGfx
        .rect(bx, by, barW, barH)
        .stroke({ color: 0x000000, alpha: 0.50, width: 0.5 });
    }
  }

  // ── Overlay: power grid ───────────────────────────────────

  private drawPowerGrid(): void {
    if (!this.powerSystem) return;
    const heldDef = sm.state.player.heldItemId
      ? registry.findDoodad(sm.state.player.heldItemId)
      : null;
    if (!this.showPowerGrid && heldDef?.id !== "power_node") return;

    // Node-to-node connections
    for (const conn of this.powerSystem.nodeConnections) {
      this.overlayGfx
        .moveTo(conn.ax, conn.ay).lineTo(conn.bx, conn.by)
        .stroke({ color: 0x00e5ff, alpha: 0.35, width: 1 });
    }

    // Machine/generator attachments
    for (const att of this.powerSystem.attachments) {
      this.overlayGfx
        .moveTo(att.mx, att.my).lineTo(att.nx, att.ny)
        .stroke({ color: att.powered ? 0xffdc00 : 0xff5000, alpha: 0.45, width: 0.75 });
    }

    // Power node diamonds
    for (const doodad of Object.values(sm.state.doodads)) {
      const def = registry.findDoodad(doodad.defId);
      if (!def || def.id !== "power_node") continue;
      const wx = (doodad.origin.tx + 0.5) * T;
      const wy = (doodad.origin.ty + 0.5) * T;
      const r  = T * 0.28;
      this.overlayGfx
        .moveTo(wx, wy - r).lineTo(wx + r, wy).lineTo(wx, wy + r).lineTo(wx - r, wy).closePath()
        .fill({ color: 0x00e5ff, alpha: 0.7 });

      // Radius ring
      const radiusPx = (def.powerRadius ?? 4) * T;
      this.overlayGfx.circle(wx, wy, radiusPx).stroke({ color: 0x00e5ff, alpha: 0.08, width: 0.5 });
    }

    // Generator active pulse
    for (const doodad of Object.values(sm.state.doodads)) {
      const def = registry.findDoodad(doodad.defId);
      if (!def?.powerGeneration) continue;
      const isActive = doodad.fuelBurn !== null && (doodad.fuelBurn?.remainingMs ?? 0) > 0;
      if (!isActive) continue;
      const wx = (doodad.origin.tx + def.footprint.w / 2) * T;
      const wy = (doodad.origin.ty + def.footprint.h / 2) * T;
      this.overlayGfx.circle(wx, wy, T * 0.6).stroke({ color: 0x50ff78, alpha: 0.5, width: 1.5 });
    }
  }

  // ── Overlay: build grid ───────────────────────────────────

  private drawGridOverlay(): void {
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    const startX = Math.floor(this.cameraX / T) * T;
    const startY = Math.floor(this.cameraY / T) * T;

    // Calculate how much of the world is currently visible
    const endX = this.cameraX + W / this.zoomLevel + T;
    const endY = this.cameraY + H / this.zoomLevel + T;

    for (let wx = startX; wx < endX; wx += T) {
      this.overlayGfx
        .moveTo(wx, this.cameraY).lineTo(wx, endY)
        .stroke({ color: 0xffffff, alpha: 0.06, width: 0.5 });
    }
    for (let wy = startY; wy < endY; wy += T) {
      this.overlayGfx
        .moveTo(this.cameraX, wy).lineTo(endX, wy)
        .stroke({ color: 0xffffff, alpha: 0.06, width: 0.5 });
    }
  }

  // ── Overlay: ghost ────────────────────────────────────────

  private drawGhost(): void {
    const { heldItemId, placementRotation, cursorWorldPos } = sm.state.player;
    if (!heldItemId) return;
    const def = registry.findDoodad(heldItemId);
    if (!def) return;

    const fp       = rotatedFP(def.footprint.w, def.footprint.h, placementRotation);
    const originTx = Math.floor(cursorWorldPos.x / T) - Math.floor(fp.w / 2);
    const originTy = Math.floor(cursorWorldPos.y / T) - Math.floor(fp.h / 2);
    const wx = originTx * T;
    const wy = originTy * T;
    const pw = fp.w * T;
    const ph = fp.h * T;

    const valid      = this.buildSystem?.lastPlacementValid ?? false;
    const fillColor  = valid ? 0x00ff50 : 0xff2828;
    const strokeColor = fillColor;

    this.overlayGfx.rect(wx, wy, pw, ph).fill({ color: fillColor, alpha: 0.15 });
    this.overlayGfx.rect(wx + 0.5, wy + 0.5, pw - 1, ph - 1).stroke({ color: strokeColor, alpha: 0.7, width: 1.5 });

    // Sprite tint overlay
    const spriteColor = (def.texture ?? def.sprite).startsWith("#")
      ? hexToNum(def.texture ?? def.sprite)
      : 0x666666;
    this.overlayGfx.rect(wx + 3, wy + 3, pw - 6, ph - 6).fill({ color: spriteColor, alpha: 0.28 });

    // Belt ghost chevron
    if (heldItemId === "belt_straight") {
      const dir = rotationToDir(placementRotation);
      this.drawChevronGfx(wx, wy, dir);
    }

    // Port indicators on ghost
    if (def.ports.length > 0) {
      this.drawPorts(wx, wy, def.ports, def.footprint.w, def.footprint.h, placementRotation, 0.65);
    }
  }

  private drawChevronGfx(wx: number, wy: number, dir: CardinalDir): void {
    const cx = wx + T / 2, cy = wy + T / 2, arm = T * 0.2;
    const cs = { color: 0xd4a030, width: 2, cap: "round" as const, join: "round" as const };
    switch (dir) {
      case "N": this.overlayGfx.moveTo(cx-arm,cy+arm).lineTo(cx,cy-arm).lineTo(cx+arm,cy+arm).stroke(cs); break;
      case "E": this.overlayGfx.moveTo(cx-arm,cy-arm).lineTo(cx+arm,cy).lineTo(cx-arm,cy+arm).stroke(cs); break;
      case "S": this.overlayGfx.moveTo(cx-arm,cy-arm).lineTo(cx,cy+arm).lineTo(cx+arm,cy-arm).stroke(cs); break;
      case "W": this.overlayGfx.moveTo(cx+arm,cy-arm).lineTo(cx-arm,cy).lineTo(cx+arm,cy+arm).stroke(cs); break;
    }
  }

  // ── HUD ───────────────────────────────────────────────────

  private buildHUD(): void {
    this.hudBg = new PIXI.Graphics();
    this.hudBg.rect(8, 8, 96, 44).fill({ color: 0x000000, alpha: 0.55 });
    this.hudLayer.addChild(this.hudBg);

    this.hudTitle = new PIXI.Text({
      text: "OVERSEER",
      style: { fill: "#00e5ff", fontFamily: "monospace", fontSize: 11 },
    });
    this.hudTitle.x = 14; this.hudTitle.y = 12;
    this.hudLayer.addChild(this.hudTitle);

    this.hudPos = new PIXI.Text({
      text: "POS  0, 0",
      style: { fill: "#aaaaaa", fontFamily: "monospace", fontSize: 11 },
    });
    this.hudPos.x = 14; this.hudPos.y = 30;
    this.hudLayer.addChild(this.hudPos);
  }

  private updateHUD(): void {
    const { x, y } = sm.state.player.pos;
    this.hudPos.text = `POS  ${Math.round(x)}, ${Math.round(y)}`;
  }

  // ── Texture helpers ───────────────────────────────────────

  /**
   * Returns a WebGL texture for a hex colour string.
   * Results are cached by "hex_w_h" key — never regenerated.
   */
  private getPlaceholderTexture(hex: string, w: number, h: number): PIXI.Texture {
    const key = `${hex}_${Math.round(w)}_${Math.round(h)}`;
    const hit  = this.placeholderCache.get(key);
    if (hit) return hit;

    const gfx = new PIXI.Graphics();
    gfx.rect(0, 0, w, h).fill(hexToNum(hex));
    const tex = this.app.renderer.generateTexture({
      target: gfx, frame: new PIXI.Rectangle(0, 0, w, h),
    });
    gfx.destroy();
    this.placeholderCache.set(key, tex);
    return tex;
  }

  /**
   * Resolve a texture key — self-healing, never spams warnings.
   *
   *   1. Key is in PIXI.Assets cache (PNG already loaded) → return it.
   *   2. Key starts with "#" → return a coloured placeholder rect.
   *   3. Key is a PNG path not yet loaded:
   *        - Fire one background PIXI.Assets.load() (tracked in pendingLoads).
   *        - When it resolves, invalidate any doodad containers that use this
   *          texture so syncDoodads() rebuilds them with the real PNG.
   *        - Until then, return the grey placeholder so rendering never stalls.
   *
   * No manual preload list needed — textures load themselves on first use.
   */
  private resolveTexture(key: string, w: number, h: number): PIXI.Texture {
    // Use cache.has() to avoid the PixiJS "not found" console warning
    if (PIXI.Assets.cache.has(key)) {
      return PIXI.Assets.cache.get<PIXI.Texture>(key);
    }
    if (key.startsWith("#")) return this.getPlaceholderTexture(key, w, h);

    // PNG path — kick off a one-shot background load
    if (!this.pendingLoads.has(key)) {
      this.pendingLoads.add(key);
      PIXI.Assets.load<PIXI.Texture>(key)
        .then(() => {
          this.pendingLoads.delete(key);
          // Rebuild any doodad containers that were using the placeholder
          this.invalidateDoodadsByTexture(key);
        })
        .catch(() => {
          this.pendingLoads.delete(key);
          console.warn(`[Renderer] Texture not found: "${key}" — using placeholder.`);
        });
    }

    // Return placeholder until load resolves
    return this.getPlaceholderTexture("#555555", w, h);
  }

  /**
   * Destroys and removes from the sprite map any doodad containers whose
   * DoodadDef references `textureKey` (in texture or animations fields).
   * syncDoodads() will recreate them next frame with the real loaded texture.
   */
  private invalidateDoodadsByTexture(textureKey: string): void {
    for (const [id, container] of this.doodadSprites) {
      const doodad = sm.getDoodad(id);
      if (!doodad) continue;
      const def = registry.findDoodad(doodad.defId);
      if (!def) continue;

      const usesKey =
        def.texture === textureKey ||
        (def.sprite === textureKey) ||
        Object.values(def.animations ?? {}).flat().includes(textureKey);

      if (usesKey) {
        this.doodadLayer.removeChild(container);
        container.destroy({ children: true, texture: false });
        this.doodadSprites.delete(id);
        this.doodadAnimState.delete(id);
      }
    }
  }
}
