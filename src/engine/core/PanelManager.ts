// ============================================================
//  src/game/ui/PanelManager.ts
//
//  Singleton that tracks which UI panel is currently open.
//  Panels register themselves here; only one can be open at a
//  time.  Other systems check isAnyPanelOpen() to suppress
//  their own key handling.
// ============================================================

class PanelManager {
  private activePanel: string | null = null;

  open(name: string): void {
    this.activePanel = name;
  }

  close(name: string): void {
    if (this.activePanel === name) this.activePanel = null;
  }

  /** Returns true when any panel is blocking game input. */
  isAnyPanelOpen(): boolean {
    return this.activePanel !== null;
  }

  getActive(): string | null {
    return this.activePanel;
  }
}

export const panelManager = new PanelManager();
