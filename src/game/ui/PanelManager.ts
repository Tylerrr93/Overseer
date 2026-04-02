// ============================================================
//  src/engine/core/PanelManager.ts
//
//  Tracks all open UI panels.  Key contracts:
//
//    • Multiple panels may be open simultaneously.
//    • The internal stack is ordered by focus time — the last
//      entry is the topmost (most recently focused) panel.
//    • Whenever the stack changes, _rebuildZ() walks the array
//      and calls each panel's registered z-index setter so the
//      focused window always sits on top.
//    • Legacy panels that call open/close directly (ChestUI,
//      DoodadUI) are tracked in the stack but have no z-setter;
//      they manage their own z-index via CSS.
//    • UIPanel subclasses call register() in their constructor
//      to wire in a setter, and UIPanel.open/close/mousedown
//      call open/close/focus on the singleton.
//
//  isAnyPanelOpen() remains the gate used by PlayerSystem,
//  BuildSystem, and DoodadInteractionSystem — unchanged API.
// ============================================================

class PanelManager {
  /**
   * Open panel names ordered by focus time.
   * Last element = topmost / most recently focused panel.
   */
  private readonly _stack: string[] = [];

  /**
   * z-index setters registered by UIPanel instances.
   * Legacy panels (ChestUI, DoodadUI) do not register here.
   */
  private readonly _zSetters = new Map<string, (z: number) => void>();

  /** Lowest z-index assigned to managed panels. */
  private readonly BASE_Z = 100;

  // ── Registration ──────────────────────────────────────────────

  /**
   * Called once by every UIPanel instance in its constructor.
   * `setZ` will be invoked whenever the panel's z-index changes.
   */
  register(name: string, setZ: (z: number) => void): void {
    this._zSetters.set(name, setZ);
  }

  // ── Panel lifecycle ────────────────────────────────────────────

  /**
   * Add panel to the stack (if absent) and focus it.
   * Called by UIPanel.open() and legacy panels' own open methods.
   */
  open(name: string): void {
    if (!this._stack.includes(name)) {
      this._stack.push(name);
    }
    // Always focus after open so it sits on top.
    this._bringToFront(name);
  }

  /**
   * Remove panel from the stack.
   * Called by UIPanel.close() and legacy panels' own close methods.
   */
  close(name: string): void {
    const idx = this._stack.indexOf(name);
    if (idx !== -1) this._stack.splice(idx, 1);
    this._rebuildZ();
  }

  /**
   * Move an open panel to the top of the stack.
   * Called automatically when any UIPanel receives a mousedown.
   * Safe to call for panels that have no z-setter (legacy panels);
   * the stack position is updated but no z-index change fires.
   */
  focus(name: string): void {
    this._bringToFront(name);
  }

  // ── Queries ────────────────────────────────────────────────────

  /** True while at least one panel occupies the stack. */
  isAnyPanelOpen(): boolean {
    return this._stack.length > 0;
  }

  /**
   * Returns the name of the currently focused (topmost) panel,
   * or null if no panels are open.
   */
  getActive(): string | null {
    return this._stack.at(-1) ?? null;
  }

  /**
   * Returns the base z-index value.
   * UIPanel reads this during construction for the initial zIndex.
   */
  getBaseZ(): number {
    return this.BASE_Z;
  }

  // ── Private helpers ────────────────────────────────────────────

  /** Move `name` to the end of the stack and rebuild z-indices. */
  private _bringToFront(name: string): void {
    const idx = this._stack.indexOf(name);
    if (idx === -1) return; // not in stack (not open) — ignore
    this._stack.splice(idx, 1);
    this._stack.push(name);
    this._rebuildZ();
  }

  /**
   * Assign ascending z-indices to all stacked panels.
   * Panels without a registered setter (legacy panels) are skipped —
   * they handle their own z-index via static CSS.
   */
  private _rebuildZ(): void {
    this._stack.forEach((name, i) => {
      this._zSetters.get(name)?.(this.BASE_Z + i);
    });
  }
}

export const panelManager = new PanelManager();
