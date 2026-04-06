// ============================================================
//  src/engine/core/EventBus.ts
//  Typed, synchronous publish/subscribe.
//  Systems communicate through events, never by calling each
//  other directly — keeps coupling zero between subsystems.
// ============================================================

export type EventMap = {
  // World
  "chunk:generated":   { cx: number; cy: number };
  // Doodads
  "doodad:placed":     { doodadId: string };
  "doodad:removed":    { doodadId: string };
  "doodad:craft:start":  { doodadId: string; recipeId: string };
  "doodad:craft:finish": { doodadId: string; recipeId: string };
  // Inventory
  "inventory:changed": { entityId: string };
  // Player
  "player:moved":      { x: number; y: number };
  // Doodad interaction
  "doodad:interact":   { doodadId: string; defId: string };
  "ui:close-panels":   { except?: string };  // close all panels except named one
  // UI (engine → UI layer)
  "ui:notification":   { message: string; severity: "info" | "warn" | "error" };
  /**
   * Toggle (or explicitly set) the power grid overlay.
   * Emitted by: Alt key handler, ActionBar ⚡ button.
   * Consumed by: Renderer (canvas overlay), PowerUI (stats panel).
   * Pass `active` to force a specific state; omit for a pure flip.
   */
  "power:overlay:toggle": { active?: boolean };
  // RAM tech system
  /** Emitted by DoodadSystem whenever the player's RAM total changes. */
  "ram:changed":   { ram: number };
  /** Emitted by TechSystem when a technology is successfully unlocked. */
  "tech:unlocked": { techId: string };
};

type EventKey = keyof EventMap;
type Handler<K extends EventKey> = (payload: EventMap[K]) => void;

class EventBus {
  private readonly listeners = new Map<EventKey, Set<Handler<never>>>();

  on<K extends EventKey>(event: K, handler: Handler<K>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.listeners.get(event) as Set<any>).add(handler);
    // Return unsubscribe fn
    return () => this.off(event, handler);
  }

  off<K extends EventKey>(event: K, handler: Handler<K>): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.listeners.get(event) as Set<any> | undefined)?.delete(handler);
  }

  emit<K extends EventKey>(event: K, payload: EventMap[K]): void {
    this.listeners.get(event)?.forEach(h => h(payload as never));
  }
}

export const bus = new EventBus();
