// ============================================================
//  src/game/ui/SystemMenuUI.ts
//
//  Settings / system panel opened via the ActionBar ⚙ button.
//
//  Features:
//    • Manual save  — writes to localStorage
//    • Load last save — reloads the page (cleanest resync path)
//    • Wipe save    — two-step confirm, then page reload
//    • Export JSON  — downloads the current state as a .json file
//    • Import JSON  — file picker, validates, then page reload
//    • Last-saved timestamp shown and refreshed on open
//    • UI Scale slider — 0.6×–1.6×, persisted to localStorage,
//                        applied instantly via --ui-scale on :root
//
//  Extends UIPanel — inherits drag-to-move, resize, z-stacking.
// ============================================================

import { UIPanel }         from "./UIPanel";
import { UIStyleManager }  from "./UIStyleManager";
import { sm }              from "@engine/core/StateManager";
import { GameConfig }      from "@engine/core/GameConfig";
import {
  downloadJSON,
  readJSONFile,
  relativeTime,
  buildSaveFilename,
}                          from "@engine/utils/SerializationUtils";

// ── Styles ────────────────────────────────────────────────────

const STYLES = `
#system-menu {
  background: var(--col-bg);
  box-shadow: var(--panel-shadow-cyan);
  font-family: monospace;
  min-width: calc(260px * var(--ui-scale));
  max-width: calc(320px * var(--ui-scale));
}

#system-menu-header {
  font-size: var(--font-md);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #00e5ff;
  padding-bottom: var(--gap-lg);
  margin-bottom: var(--gap-xl);
  border-bottom: 1px solid #1a2a3a;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  cursor: grab;
  user-select: none;
}
#system-menu-header:active { cursor: grabbing; }
#system-menu-header span {
  font-size: var(--font-2xs);
  color: #2a4a6a;
  letter-spacing: 0.1em;
}

/* ── Sections ──────────────────────────────────────────── */
.sm-section {
  margin-bottom: var(--gap-xl);
  padding-bottom: var(--gap-xl);
  border-bottom: 1px solid #0e1a2a;
}
.sm-section:last-child { margin-bottom: 0; border-bottom: none; }

.sm-section-label {
  font-size: var(--font-2xs);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #2a4a6a;
  margin-bottom: var(--gap-md);
}

/* ── Buttons ───────────────────────────────────────────── */
.sm-btn {
  width: 100%;
  padding: calc(7px * var(--ui-scale)) calc(10px * var(--ui-scale));
  margin-bottom: calc(5px * var(--ui-scale));
  background: rgba(255,255,255,0.03);
  border: 1px solid #1a3a4a;
  border-radius: calc(3px * var(--ui-scale));
  color: #80b0c8;
  font-family: monospace;
  font-size: var(--font-sm);
  letter-spacing: 0.1em;
  text-align: left;
  cursor: pointer;
  transition: background 0.1s, border-color 0.1s, color 0.1s;
  box-sizing: border-box;
}
.sm-btn:last-child { margin-bottom: 0; }
.sm-btn:hover {
  background: rgba(0,229,255,0.06);
  border-color: #2a5a6a;
  color: #00e5ff;
}
.sm-btn:active { background: rgba(0,229,255,0.12); }
.sm-btn:disabled {
  opacity: 0.35;
  cursor: default;
  pointer-events: none;
}

.sm-btn.danger {
  border-color: #3a1a0a;
  color: #a05040;
}
.sm-btn.danger:hover {
  background: rgba(255,60,20,0.08);
  border-color: #7a3020;
  color: #ff7755;
}
.sm-btn.danger-confirm {
  border-color: #cc3020;
  color: #ff6644;
  background: rgba(200,40,20,0.10);
  animation: sm-pulse 0.6s ease-in-out infinite alternate;
}
@keyframes sm-pulse {
  from { box-shadow: none; }
  to   { box-shadow: 0 0 8px rgba(255,80,40,0.4); }
}

.sm-btn.io {
  color: #608898;
  border-color: #1a2a3a;
}
.sm-btn.io:hover {
  background: rgba(0,180,220,0.06);
  border-color: #1a4a5a;
  color: #40b0d0;
}

/* ── Scale control ─────────────────────────────────────── */
.sm-scale-row {
  display: flex;
  align-items: center;
  gap: var(--gap-lg);
  margin-top: calc(4px * var(--ui-scale));
}

#sm-scale-slider {
  flex: 1;
  -webkit-appearance: none;
  appearance: none;
  height: calc(4px * var(--ui-scale));
  border-radius: calc(2px * var(--ui-scale));
  background: #1a2a3a;
  outline: none;
  cursor: pointer;
}
#sm-scale-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: calc(14px * var(--ui-scale));
  height: calc(14px * var(--ui-scale));
  border-radius: 50%;
  background: #00e5ff;
  cursor: pointer;
  border: none;
}
#sm-scale-slider::-moz-range-thumb {
  width: calc(14px * var(--ui-scale));
  height: calc(14px * var(--ui-scale));
  border-radius: 50%;
  background: #00e5ff;
  cursor: pointer;
  border: none;
}

#sm-scale-label {
  font-size: var(--font-sm);
  color: #60a0c0;
  letter-spacing: 0.08em;
  min-width: calc(32px * var(--ui-scale));
  text-align: right;
  flex-shrink: 0;
}

/* ── Status line ───────────────────────────────────────── */
#sm-status {
  margin-top: var(--gap-xl);
  padding: calc(5px * var(--ui-scale)) var(--gap-lg);
  border-radius: calc(3px * var(--ui-scale));
  font-size: var(--font-2xs);
  letter-spacing: 0.08em;
  min-height: calc(22px * var(--ui-scale));
  display: none;
}
#sm-status.ok {
  display: block;
  background: rgba(0,160,80,0.10);
  border: 1px solid rgba(0,160,80,0.3);
  color: #40c060;
}
#sm-status.err {
  display: block;
  background: rgba(200,40,20,0.10);
  border: 1px solid rgba(200,40,20,0.3);
  color: #e06040;
}
#sm-status.info {
  display: block;
  background: rgba(0,180,220,0.08);
  border: 1px solid rgba(0,180,220,0.2);
  color: #60a0c0;
}

/* ── Last saved ────────────────────────────────────────── */
#sm-last-saved {
  font-size: var(--font-2xs);
  color: #2a4a6a;
  letter-spacing: 0.08em;
  margin-top: calc(2px * var(--ui-scale));
}
#sm-last-saved.has-save { color: #40c060; }

/* ── Version footer ────────────────────────────────────── */
#sm-footer {
  margin-top: var(--gap-xl);
  font-size: var(--font-xs);
  color: #1a3040;
  letter-spacing: 0.1em;
  text-align: right;
}
`;

function injectStyles(): void {
  if (document.getElementById("system-menu-styles")) return;
  const s = document.createElement("style");
  s.id = "system-menu-styles";
  s.textContent = STYLES;
  document.head.appendChild(s);
}

// ─────────────────────────────────────────────────────────────

export class SystemMenuUI extends UIPanel {
  private lastSavedEl!: HTMLElement;
  private statusEl!:    HTMLElement;
  private wipeBtn!:     HTMLButtonElement;
  private loadBtn!:     HTMLButtonElement;
  private scaleSlider!: HTMLInputElement;
  private scaleLabel!:  HTMLElement;
  private _confirmingWipe = false;
  private _statusTimer:   ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super({
      id:        "system-menu",
      name:      "system",
      minWidth:  260,
      minHeight: 80,
      resizable: false,
    });

    injectStyles();

    this.el.style.background   = "rgba(6, 10, 18, 0.96)";
    this.el.style.border       = "1px solid #1a2a4a";
    this.el.style.borderRadius = "var(--panel-radius)";
    this.el.style.padding      = "var(--panel-padding-sm) var(--panel-padding-md)";
    this.el.style.color        = "#a0b8d8";

    this._buildHTML();
    this._bindEvents();
  }

  // ── UIPanel lifecycle ─────────────────────────────────────

  protected override onOpen(): void {
    this._resetConfirmWipe();
    this._refreshLastSaved();
    this._clearStatus();
    // Sync slider to current scale in case it changed externally
    const current = parseFloat(
      getComputedStyle(document.documentElement)
        .getPropertyValue("--ui-scale").trim() || "1"
    );
    this.scaleSlider.value = String(current);
    this.scaleLabel.textContent = `${current.toFixed(2)}×`;
  }

  protected override onClose(): void {
    this._resetConfirmWipe();
  }

  // ── DOM construction ──────────────────────────────────────

  private _buildHTML(): void {
    const savedScale = parseFloat(
      localStorage.getItem(GameConfig.UI_SCALE_KEY) ?? String(GameConfig.UI_SCALE_DEFAULT)
    );
    const clampedScale = Math.min(GameConfig.UI_SCALE_MAX, Math.max(GameConfig.UI_SCALE_MIN, savedScale));

    this.el.innerHTML = `
      <div id="system-menu-header">
        ⚙ System
        <span>ESC — CLOSE  ·  DRAG TO MOVE</span>
      </div>

      <!-- UI Scale -->
      <div class="sm-section">
        <div class="sm-section-label">Display Scale</div>
        <div class="sm-scale-row">
          <input
            id="sm-scale-slider"
            type="range"
            min="${GameConfig.UI_SCALE_MIN}"
            max="${GameConfig.UI_SCALE_MAX}"
            step="0.05"
            value="${clampedScale}"
          />
          <span id="sm-scale-label">${clampedScale.toFixed(2)}×</span>
        </div>
      </div>

      <!-- Save / Load / Wipe -->
      <div class="sm-section">
        <div class="sm-section-label">Save &amp; Load</div>
        <button class="sm-btn" id="sm-save-btn">💾  Save Game</button>
        <div id="sm-last-saved">No save found.</div>
        <button class="sm-btn" id="sm-load-btn" style="margin-top:var(--gap-md)">↺  Load Last Save</button>
        <button class="sm-btn danger" id="sm-wipe-btn" style="margin-top:var(--gap-md)">✕  Wipe All Save Data</button>
      </div>

      <!-- Export / Import -->
      <div class="sm-section">
        <div class="sm-section-label">Import / Export</div>
        <button class="sm-btn io" id="sm-export-btn">↓  Export Save File (.json)</button>
        <button class="sm-btn io" id="sm-import-btn" style="margin-top:var(--gap-sm)">↑  Import Save File (.json)</button>
      </div>

      <!-- Status feedback -->
      <div id="sm-status"></div>

      <!-- Footer -->
      <div id="sm-footer">v${GameConfig.SAVE_VERSION} · digitized overseer</div>
    `;

    this.bindDragHandle(this.el.querySelector("#system-menu-header") as HTMLElement);

    this.lastSavedEl  = this.el.querySelector("#sm-last-saved")!;
    this.statusEl     = this.el.querySelector("#sm-status")!;
    this.wipeBtn      = this.el.querySelector("#sm-wipe-btn")!;
    this.loadBtn      = this.el.querySelector("#sm-load-btn")!;
    this.scaleSlider  = this.el.querySelector("#sm-scale-slider")!;
    this.scaleLabel   = this.el.querySelector("#sm-scale-label")!;
  }

  private _bindEvents(): void {
    this.el.querySelector("#sm-save-btn")!
      .addEventListener("click", () => this._handleSave());

    this.loadBtn
      .addEventListener("click", () => this._handleLoad());

    this.wipeBtn
      .addEventListener("click", () => this._handleWipe());

    this.el.querySelector("#sm-export-btn")!
      .addEventListener("click", () => this._handleExport());

    this.el.querySelector("#sm-import-btn")!
      .addEventListener("click", () => this._handleImport());

    // Scale slider — live preview + persist on release
    this.scaleSlider.addEventListener("input", () => {
      const v = parseFloat(this.scaleSlider.value);
      this.scaleLabel.textContent = `${v.toFixed(2)}×`;
      UIStyleManager.applyScale(v);
    });
    this.scaleSlider.addEventListener("change", () => {
      const v = parseFloat(this.scaleSlider.value);
      localStorage.setItem(GameConfig.UI_SCALE_KEY, String(v));
    });

    // Any click outside the wipe button resets the confirm state
    this.el.addEventListener("click", e => {
      if (e.target !== this.wipeBtn && this._confirmingWipe) {
        this._resetConfirmWipe();
      }
    });
  }

  // ── Handlers ─────────────────────────────────────────────

  private _handleSave(): void {
    sm.save();
    this._refreshLastSaved();
    this._showStatus("Game saved.", "ok");
  }

  private _handleLoad(): void {
    const hasSave = localStorage.getItem(GameConfig.SAVE_KEY) !== null;
    if (!hasSave) {
      this._showStatus("No save file found.", "err");
      return;
    }
    this._showStatus("Reloading…", "info");
    setTimeout(() => window.location.reload(), 400);
  }

  private _handleWipe(): void {
    if (!this._confirmingWipe) {
      this._confirmingWipe = true;
      this.wipeBtn.textContent = "⚠  CONFIRM — This cannot be undone";
      this.wipeBtn.classList.remove("danger");
      this.wipeBtn.classList.add("danger-confirm");
      this._showStatus("Click again to permanently erase all save data.", "err");
      return;
    }

    sm.wipe();
    this._showStatus("Save wiped. Reloading…", "err");
    setTimeout(() => window.location.reload(), 600);
  }

  private _handleExport(): void {
    try {
      const json     = sm.exportJSON();
      const filename = buildSaveFilename();
      downloadJSON(filename, json);
      this._showStatus(`Exported as ${filename}`, "ok");
    } catch (e) {
      this._showStatus("Export failed — see console.", "err");
      console.error("[SystemMenuUI] Export error:", e);
    }
  }

  private async _handleImport(): Promise<void> {
    try {
      this._showStatus("Choose a .json save file…", "info");
      const raw = await readJSONFile();
      const ok  = sm.importJSON(raw);
      if (!ok) {
        this._showStatus(
          `Import failed: version mismatch or corrupt file. ` +
          `Expected save version ${GameConfig.SAVE_VERSION}.`,
          "err",
        );
        return;
      }
      this._showStatus("Import successful — reloading…", "ok");
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      if (e instanceof Error && e.message === "No file selected") {
        this._clearStatus();
      } else {
        this._showStatus("Import failed — see console.", "err");
        console.error("[SystemMenuUI] Import error:", e);
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────

  private _refreshLastSaved(): void {
    const raw = localStorage.getItem(GameConfig.SAVE_TS_KEY);
    if (!raw) {
      this.lastSavedEl.textContent = "No save found.";
      this.lastSavedEl.classList.remove("has-save");
      this.loadBtn.disabled = true;
      return;
    }
    const ts = parseInt(raw, 10);
    this.lastSavedEl.textContent = `Last saved: ${relativeTime(ts)}`;
    this.lastSavedEl.classList.add("has-save");
    this.loadBtn.disabled = false;
  }

  private _showStatus(msg: string, kind: "ok" | "err" | "info"): void {
    if (this._statusTimer !== null) clearTimeout(this._statusTimer);
    this.statusEl.textContent = msg;
    this.statusEl.className   = kind;
    if (kind !== "err") {
      this._statusTimer = setTimeout(() => this._clearStatus(), 4_000);
    }
  }

  private _clearStatus(): void {
    if (this._statusTimer !== null) { clearTimeout(this._statusTimer); this._statusTimer = null; }
    this.statusEl.textContent = "";
    this.statusEl.className   = "";
  }

  private _resetConfirmWipe(): void {
    if (!this._confirmingWipe) return;
    this._confirmingWipe = false;
    this.wipeBtn.textContent = "✕  Wipe All Save Data";
    this.wipeBtn.classList.remove("danger-confirm");
    this.wipeBtn.classList.add("danger");
  }
}
