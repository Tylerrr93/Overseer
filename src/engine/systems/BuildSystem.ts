// ============================================================
//  src/engine/systems/BuildSystem.ts
// ============================================================

import { sm }            from "@engine/core/StateManager";
import { panelManager }  from "@engine/core/PanelManager";
import { registry }      from "@engine/core/Registry";
import { bus }           from "@engine/core/EventBus";
import { GameConfig }    from "@engine/core/GameConfig";
import { CursorMode }    from "@t/state";
import { rotationToDir } from "@engine/utils/portUtils";
import type { Renderer }     from "@engine/rendering/Renderer";
import type { DoodadDef }    from "@t/content";
import type { DoodadState, TilePos } from "@t/state";

const T  = GameConfig.TILE_SIZE;
const CS = GameConfig.CHUNK_SIZE;

// ── UUID ──────────────────────────────────────────────────────

function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Rotation helpers ──────────────────────────────────────────

export function rotatedFootprint(
  def:      DoodadDef,
  rotation: number,
): { w: number; h: number } {
  return (rotation % 2 === 0)
    ? { w: def.footprint.w, h: def.footprint.h }
    : { w: def.footprint.h, h: def.footprint.w };
}

function cursorToOrigin(
  worldX: number, worldY: number,
  fw:     number, fh:     number,
): TilePos {
  return {
    tx: Math.floor(worldX / T) - Math.floor(fw / 2),
    ty: Math.floor(worldY / T) - Math.floor(fh / 2),
  };
}

// ── Cost helpers ──────────────────────────────────────────────

/**
 * Resolve the raw-resource build cost for a doodad.
 * Prefers `def.cost` (new canonical field) and falls back to
 * `def.buildCost` (legacy) so old doodad defs keep working.
 */
function rawCost(def: DoodadDef): { itemId: string; qty: number }[] {
  return def.cost ?? def.buildCost ?? [];
}

/**
 * Compute the partial refund for a raw cost array and fraction.
 * Each qty is floored — intentional: a cost of 1 at 50% refunds 0.
 * Design costs ≥ 2 for items you want a guaranteed partial refund.
 */
function calcRefund(
  cost:            { itemId: string; qty: number }[],
  refundFraction:  number,
): { itemId: string; qty: number }[] {
  return cost
    .map(c => ({ itemId: c.itemId, qty: Math.floor(c.qty * refundFraction) }))
    .filter(c => c.qty > 0);
}

// ─────────────────────────────────────────────────────────────

export class BuildSystem {
  /** True when the ghost footprint is over valid empty terrain. */
  lastPlacementValid = false;
  /** True when the player can currently afford the held doodad. */
  lastAffordable     = true;

  private readonly renderer: Renderer;

  // ── Mouse state ───────────────────────────────────────────
  private isLeftMouseDown  = false;
  private _justPressedLeft  = false;
  private _justPressedRight = false;

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    this.bindEvents();
  }

  // ── Event wiring ──────────────────────────────────────────

  private bindEvents(): void {
    window.addEventListener("mousemove", e => {
      const { x, y } = this.renderer.screenToWorld(e.clientX, e.clientY);
      sm.updateCursorWorld(x, y);
    });

    window.addEventListener("mousedown", e => {
      if ((e.target as HTMLElement).tagName !== "CANVAS") return;
      if (e.button === 0) {
        this.isLeftMouseDown  = true;
        this._justPressedLeft = true;
      }
    });

    window.addEventListener("mouseup", e => {
      if (e.button === 0) this.isLeftMouseDown = false;
    });

    window.addEventListener("contextmenu", e => {
      if ((e.target as HTMLElement).tagName !== "CANVAS") return;
      e.preventDefault();
      this._justPressedRight = true;
    });

    window.addEventListener("keydown", e => {
      if (e.key === "r" || e.key === "R") {
        if (sm.state.player.heldItemId) {
          sm.state.player.placementRotation =
            (sm.state.player.placementRotation + 1) % 4;
        }
      }
      if (e.key === "Escape") this.exitCursorMode();
    });
  }

  // ── Per-frame update ──────────────────────────────────────

  update(deltaMs: number): void {
    const { cursorMode, heldItemId, placementRotation, cursorWorldPos } =
      sm.state.player;

    // -- Ghost validity + affordability check (Build mode) ----
    if (cursorMode === CursorMode.Build && heldItemId) {
      // Resolve: item ID → placesDoodadId → DoodadDef, or direct doodad ID.
      const heldItemDef = registry.findItem(heldItemId);
      const doodadId    = heldItemDef?.placesDoodadId ?? heldItemId;
      const def         = registry.findDoodad(doodadId);
      if (def) {
        const fp     = rotatedFootprint(def, placementRotation);
        const origin = cursorToOrigin(
          cursorWorldPos.x, cursorWorldPos.y, fp.w, fp.h,
        );
        this.lastPlacementValid = this.validate(origin, fp.w, fp.h);
        // Affordable = has prefab item OR has raw resources
        this.lastAffordable     = heldItemDef?.placesDoodadId
          ? sm.canAffordCost([{ itemId: heldItemId, qty: 1 }])
          : sm.canAffordCost(rawCost(def));
      } else {
        this.lastPlacementValid = false;
        this.lastAffordable     = true;
      }
    } else {
      this.lastPlacementValid = false;
      this.lastAffordable     = true;
    }

    // -- Consume just-pressed events (UI panels take priority) --
    const uiOpen = panelManager.isAnyPanelOpen();

    if (this._justPressedLeft) {
      this._justPressedLeft = false;
      if (!uiOpen) this.handleLeftPress(cursorMode);
    }

    if (this._justPressedRight) {
      this._justPressedRight = false;
      if (!uiOpen) this.handleRightPress();
    }

    // -- Held left-button -------------------------------------
    if (this.isLeftMouseDown && !uiOpen) {
      this.handleLeftHeld(deltaMs, cursorMode);
    }
  }

  // ── Left press ────────────────────────────────────────────

  private handleLeftPress(cursorMode: CursorMode): void {
    if (cursorMode === CursorMode.Build) this.tryPlaceBlueprint();
    // Deconstruct: held-button handler does all the work
  }

  // ── Held left-button ──────────────────────────────────────

  private handleLeftHeld(deltaMs: number, cursorMode: CursorMode): void {
    const doodad = this.getDoodadUnderCursor();
    if (!doodad) return;

    const def = registry.findDoodad(doodad.defId);
    if (!def) return;

    // Finish a build in progress (any cursor mode can complete it)
    if (doodad.construction?.mode === "building") {
      doodad.construction.progressMs += deltaMs;
      if (doodad.construction.progressMs >= doodad.construction.totalMs) {
        delete doodad.construction;
        bus.emit("ui:notification", {
          message:  `${def.name} built.`,
          severity: "info",
        });
      }
      return;
    }

    // Start / advance deconstruction
    if (cursorMode !== CursorMode.Deconstruct) return;

    if (!doodad.construction) {
      doodad.construction = {
        mode:       "deconstructing",
        progressMs: 0,
        totalMs:    def.deconstructTimeMs ?? 1000,
      };
    }

    if (doodad.construction.mode === "deconstructing") {
      doodad.construction.progressMs += deltaMs;
      if (doodad.construction.progressMs >= doodad.construction.totalMs) {
        this.completeDeconstruct(doodad, def);
      }
    }
  }

  // ── Right-click ───────────────────────────────────────────

  private handleRightPress(): void {
    const doodad = this.getDoodadUnderCursor();

    if (doodad?.construction?.mode === "building") {
      // Cancel placement — full refund of whatever was consumed.
      const def = registry.getDoodad(doodad.defId);
      const fp  = rotatedFootprint(def, doodad.rotation);
      this.clearTiles(doodad.origin, fp.w, fp.h);
      sm.removeBelt(doodad.id);
      sm.removeDoodad(doodad.id);

      // Mirror completeDeconstruct: prefer the placeable item refund,
      // otherwise refund full raw resources (no partial fraction on cancel).
      const placeableItem = registry.findItemForDoodad(def.id);
      if (placeableItem) {
        sm.givePlayerItem(placeableItem.id, 1);
      } else {
        for (const c of rawCost(def)) {
          if (c.qty > 0) sm.givePlayerItem(c.itemId, c.qty);
        }
      }

      bus.emit("ui:notification", {
        message:  `${def.name} placement cancelled — refunded.`,
        severity: "info",
      });
      return;
    }

    if (doodad?.construction?.mode === "deconstructing") {
      delete doodad.construction;
      return;
    }

    this.exitCursorMode();
  }

  // ── Blueprint placement ───────────────────────────────────

  private tryPlaceBlueprint(): void {
    const { heldItemId, placementRotation, cursorWorldPos } = sm.state.player;
    if (!heldItemId) return;

    // Resolve: heldItemId can be an inventory item that places a doodad,
    // or a legacy doodad ID used directly from the default action-bar loadout.
    const heldItemDef = registry.findItem(heldItemId);
    const doodadId    = heldItemDef?.placesDoodadId ?? heldItemId;
    const def         = registry.findDoodad(doodadId);
    if (!def) return;

    const fp     = rotatedFootprint(def, placementRotation);
    const origin = cursorToOrigin(
      cursorWorldPos.x, cursorWorldPos.y, fp.w, fp.h,
    );

    // Tile check
    if (!this.validate(origin, fp.w, fp.h)) {
      bus.emit("ui:notification", {
        message:  "Cannot place here.",
        severity: "warn",
      });
      return;
    }

    // ── Two build paths ────────────────────────────────────────
    //  Prefab   → player has the matching placeable item.
    //            Consume 1 item; build time is halved (quick re-install).
    //  Raw      → player has the raw resource cost but no prefab.
    //            Consume raw resources; full build time applies.
    //  Neither  → cannot build.
    const usingPrefab = Boolean(heldItemDef?.placesDoodadId);

    if (usingPrefab) {
      if (!sm.canAffordCost([{ itemId: heldItemId, qty: 1 }])) {
        // Check if they have raw resources as a fallback message hint
        const hasRaw = sm.canAffordCost(rawCost(def));
        bus.emit("ui:notification", {
          message:  hasRaw
            ? `No prefab ${heldItemDef!.name} — use raw resources from the action bar instead.`
            : `No ${heldItemDef!.name} in inventory.`,
          severity: "warn",
        });
        return;
      }
      sm.tryConsumePlayerItems([{ itemId: heldItemId, qty: 1 }]);
    } else {
      const cost = rawCost(def);
      if (!sm.canAffordCost(cost)) {
        const missing = this.missingCostString(cost);
        const hasItem = registry.findItemForDoodad(doodadId);
        bus.emit("ui:notification", {
          message:  cost.length === 0
            ? "Cannot place here."
            : hasItem
              ? `Need raw resources (${missing}) or a prefab ${hasItem.name}.`
              : `Not enough resources — need ${missing}.`,
          severity: "warn",
        });
        return;
      }
      sm.tryConsumePlayerItems(cost);
    }

    const id = uuidv4();
    // Prefab path gets a 50% build time bonus — the machine is pre-assembled.
    const baseBuildTime = def.buildTimeMs ?? 500;
    const buildTimeMs   = usingPrefab ? Math.max(0, Math.floor(baseBuildTime * 0.5)) : baseBuildTime;
    const isBelt        = doodadId === "belt_straight";
    const isInstant   = isBelt || buildTimeMs <= 0;

    if (isBelt) {
      // Belts are always instant — no build phase
      sm.addDoodad({
        id, defId: doodadId, origin,
        rotation:          placementRotation,
        inventory:         [],
        crafting:          null,
        powered:           false,
        tickAccumulatorMs: 0,
        pinnedRecipeId:    null,
        fuelBurn:          null,
      });
      sm.addBelt({
        id, origin,
        direction: rotationToDir(placementRotation),
        items:     [],
      });
    } else if (isInstant) {
      // buildTimeMs === 0 — place fully built immediately
      sm.addDoodad({
        id, defId: doodadId, origin,
        rotation:          placementRotation,
        inventory:         def.slots.map(() => null),
        crafting:          null,
        powered:           false,
        tickAccumulatorMs: 0,
        pinnedRecipeId:    null,
        fuelBurn:          null,
      });
    } else {
      // Place as a blueprint that must be held-to-build
      sm.addDoodad({
        id, defId: doodadId, origin,
        rotation:          placementRotation,
        inventory:         def.slots.map(() => null),
        crafting:          null,
        powered:           false,
        tickAccumulatorMs: 0,
        pinnedRecipeId:    null,
        fuelBurn:          null,
        construction: {
          mode:       "building",
          progressMs: 0,
          totalMs:    buildTimeMs,
        },
      });
    }

    this.stampTiles(origin, fp.w, fp.h, id);

    const msg = isInstant
      ? `${def.name} placed.`
      : `${def.name} blueprint placed — hold LMB to build.`;
    bus.emit("ui:notification", { message: msg, severity: "info" });
  }

  // ── Deconstruct completion ────────────────────────────────

  private completeDeconstruct(doodad: DoodadState, def: DoodadDef): void {
    // Refund slot contents in full regardless of deconstruct method.
    for (const stack of doodad.inventory) {
      if (stack && stack.qty > 0) sm.givePlayerItem(stack.itemId, stack.qty);
    }

    // If a placeable item is registered for this doodad, return that item.
    // Otherwise fall back to the legacy partial buildCost refund.
    const placeableItem = registry.findItemForDoodad(def.id);
    let notifySuffix: string;

    if (placeableItem) {
      sm.givePlayerItem(placeableItem.id, 1);
      notifySuffix = `→ ${placeableItem.name} recovered.`;
    } else {
      const refundFraction = def.refundFraction ?? 0.5;
      const refunds        = calcRefund(rawCost(def), refundFraction);
      for (const r of refunds) sm.givePlayerItem(r.itemId, r.qty);
      const refundPct = Math.round(refundFraction * 100);
      notifySuffix = `(${refundPct}% cost returned).`;
    }

    const fp = rotatedFootprint(def, doodad.rotation);
    this.clearTiles(doodad.origin, fp.w, fp.h);
    sm.removeBelt(doodad.id);
    sm.removeDoodad(doodad.id);

    bus.emit("ui:notification", {
      message:  `${def.name} deconstructed ${notifySuffix}`,
      severity: "info",
    });
  }

  // ── Validation ────────────────────────────────────────────

  validate(origin: TilePos, w: number, h: number): boolean {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const tile = this.getTile(origin.tx + dx, origin.ty + dy);
        if (!tile)          return false;
        if (!tile.passable) return false;
        if (tile.doodadId)  return false;
      }
    }
    return true;
  }

  // ── Tile helpers ──────────────────────────────────────────

  private stampTiles(
    origin:   TilePos,
    w:        number,
    h:        number,
    doodadId: string,
  ): void {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++) {
        const tile = this.getTile(origin.tx + dx, origin.ty + dy);
        if (tile) tile.doodadId = doodadId;
      }
  }

  clearTiles(origin: TilePos, w: number, h: number): void {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++) {
        const tile = this.getTile(origin.tx + dx, origin.ty + dy);
        if (tile) tile.doodadId = null;
      }
  }

  private getDoodadUnderCursor(): DoodadState | null {
    const { cursorWorldPos } = sm.state.player;
    const tx   = Math.floor(cursorWorldPos.x / T);
    const ty   = Math.floor(cursorWorldPos.y / T);
    const tile = this.getTile(tx, ty);
    if (!tile?.doodadId) return null;
    return sm.getDoodad(tile.doodadId) ?? null;
  }

  private getTile(tx: number, ty: number) {
    const cx    = Math.floor(tx / CS);
    const cy    = Math.floor(ty / CS);
    const chunk = sm.getChunk(cx, cy);
    if (!chunk) return null;
    const lx = ((tx % CS) + CS) % CS;
    const ly = ((ty % CS) + CS) % CS;
    return chunk.tiles[ly]?.[lx] ?? null;
  }

  // ── Helpers ───────────────────────────────────────────────

  private missingCostString(
    cost: { itemId: string; qty: number }[],
  ): string {
    if (cost.length === 0) return "nothing (free)";
    return cost
      .filter(c => {
        let have = 0;
        for (const slot of sm.state.player.inventory.slots) {
          if (slot?.itemId === c.itemId) have += slot.qty;
        }
        return have < c.qty;
      })
      .map(c => {
        const def = registry.findItem(c.itemId);
        return `${c.qty}× ${def?.name ?? c.itemId}`;
      })
      .join(", ");
  }

  private exitCursorMode(): void {
    sm.state.player.heldItemId        = null;
    sm.state.player.placementRotation = 0;
    sm.state.player.cursorMode        = CursorMode.None;
  }
}