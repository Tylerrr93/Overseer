// ============================================================
//  src/game/ui/PowerUI.ts
//
//  Shown while Alt is held. Displays per-network power stats
//  similar to Factorio's electric network info panel.
//
//  Updated every frame directly from PowerSystem data.
//  No EventBus involvement — it reads live data each render.
// ============================================================

import { registry }  from "@engine/core/Registry";
import { sm }        from "@engine/core/StateManager";
import type { IPowerSystem } from "@engine/rendering/Renderer";

// ── Styles ────────────────────────────────────────────────────

const STYLES = `
#power-ui {
  display: none;
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 98;
  background: rgba(6, 10, 18, 0.94);
  border: 1px solid #1a2a4a;
  border-radius: 4px;
  padding: 12px 14px;
  min-width: 260px;
  max-width: 300px;
  font-family: monospace;
  color: #a0b8d8;
  box-shadow: 0 0 32px rgba(0, 160, 255, 0.06);
  pointer-events: none;
  user-select: none;
}
#power-ui.visible { display: block; }

#power-ui-title {
  font-size: 10px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #00e5ff;
  margin-bottom: 10px;
  padding-bottom: 7px;
  border-bottom: 1px solid #1a2a3a;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
#power-ui-title span {
  font-size: 8px;
  color: #2a4a6a;
  letter-spacing: 0.1em;
}

.pnet {
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid #0e1a2a;
}
.pnet:last-child { margin-bottom: 0; border-bottom: none; }

.pnet-header {
  font-size: 9px;
  letter-spacing: 0.12em;
  color: #4a7aaa;
  margin-bottom: 6px;
  text-transform: uppercase;
}

/* Supply/demand bar */
.pbar-wrap {
  position: relative;
  height: 10px;
  background: rgba(255,255,255,0.04);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 4px;
}
.pbar-supply {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  background: #1a7a3a;
  border-radius: 2px;
  transition: width 0.2s;
}
.pbar-demand {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  background: transparent;
  border-right: 2px solid rgba(255,200,0,0.8);
}
.pbar-satisfied .pbar-supply { background: #1a7a3a; }
.pbar-deficit   .pbar-supply { background: #7a2a1a; }

.pnet-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px 8px;
  font-size: 8px;
}
.pnet-stat-label { color: #2a4a6a; }
.pnet-stat-value { color: #80b0d8; text-align: right; }
.pnet-stat-value.ok  { color: #40c060; }
.pnet-stat-value.bad { color: #d04030; }
.pnet-stat-value.warn { color: #d0a020; }

/* Unconnected machines warning */
#power-unconnected {
  display: none;
  margin-top: 8px;
  padding: 5px 8px;
  background: rgba(200, 60, 0, 0.12);
  border: 1px solid rgba(200,60,0,0.3);
  border-radius: 2px;
  font-size: 8px;
  color: #d06030;
  letter-spacing: 0.08em;
}
#power-unconnected.visible { display: block; }

/* No grid message */
#power-nogrid {
  display: none;
  font-size: 8px;
  color: #2a3a5a;
  letter-spacing: 0.1em;
  text-align: center;
  padding: 8px 0;
}
#power-nogrid.visible { display: block; }
`;

function injectStyles(): void {
  if (document.getElementById("power-ui-styles")) return;
  const s = document.createElement("style");
  s.id = "power-ui-styles";
  s.textContent = STYLES;
  document.head.appendChild(s);
}

// ─────────────────────────────────────────────────────────────

export class PowerUI {
  private readonly panel:       HTMLElement;
  private readonly body:        HTMLElement;
  private readonly unconnected: HTMLElement;
  private readonly nogrid:      HTMLElement;
  private isVisible = false;
  private powerSystem: IPowerSystem | null = null;

  constructor() {
    injectStyles();

    this.panel = document.createElement("div");
    this.panel.id = "power-ui";
    this.panel.innerHTML = `
      <div id="power-ui-title">
        ⚡ Power Networks
        <span>ALT — TOGGLE</span>
      </div>
      <div id="power-ui-body"></div>
      <div id="power-unconnected"></div>
      <div id="power-nogrid">No power nodes placed.</div>
    `;
    document.body.appendChild(this.panel);

    this.body        = this.panel.querySelector("#power-ui-body")!;
    this.unconnected = this.panel.querySelector("#power-unconnected")!;
    this.nogrid      = this.panel.querySelector("#power-nogrid")!;

    window.addEventListener("keydown", e => {
      if (e.key === "Alt") { e.preventDefault(); this.show(); }
    });
    window.addEventListener("keyup", e => {
      if (e.key === "Alt") this.hide();
    });
  }

  setPowerSystem(ps: IPowerSystem): void {
    this.powerSystem = ps;
  }

  // ── Show / hide ───────────────────────────────────────────

  private show(): void {
    this.isVisible = true;
    this.panel.classList.add("visible");
    this.render();
  }

  private hide(): void {
    this.isVisible = false;
    this.panel.classList.remove("visible");
  }

  // ── Tick called by GameLoop ───────────────────────────────

  tick(): void {
    if (!this.isVisible) return;
    this.render();
  }

  // ── Rendering ────────────────────────────────────────────

  private render(): void {
    if (!this.powerSystem) return;

    // Access extended data via type assertion — PowerSystem implements IPowerSystem
    // plus the extra networkSummaries/unconnectedMachines fields.
    const ps = this.powerSystem as IPowerSystem & {
      networkSummaries?: {
        id: number; supplyW: number; demandW: number;
        nodeCount: number; generatorCount: number; activeGenerators: number;
        machineCount: number; poweredMachines: number; satisfied: boolean;
      }[];
      unconnectedMachines?: number;
    };

    const summaries     = ps.networkSummaries      ?? [];
    const unconnCount   = ps.unconnectedMachines   ?? 0;

    // Count total generators across all machines for "off-grid" fuel users
    const allDoodads = Object.values(sm.state.doodads);
    const offGridFuelMachines = allDoodads.filter(d => {
      const def = registry.findDoodad(d.defId);
      return def && def.powerDraw > 0 && !d.powered && d.fuelBurn && d.fuelBurn.remainingMs > 0;
    }).length;

    this.body.innerHTML = "";

    if (summaries.length === 0) {
      this.nogrid.classList.add("visible");
      this.unconnected.classList.remove("visible");

      // Still show off-grid fuel info if any
      if (offGridFuelMachines > 0 || unconnCount > 0) {
        this.nogrid.classList.remove("visible");
        this.body.innerHTML = `
          <div class="pnet">
            <div class="pnet-header">Off-grid operation</div>
            <div class="pnet-stats">
              <div class="pnet-stat-label">Fuel fallback</div>
              <div class="pnet-stat-value warn">${offGridFuelMachines} machine${offGridFuelMachines !== 1 ? "s" : ""}</div>
              <div class="pnet-stat-label">Unconnected</div>
              <div class="pnet-stat-value bad">${unconnCount} machine${unconnCount !== 1 ? "s" : ""}</div>
            </div>
          </div>
        `;
      }
      return;
    }

    this.nogrid.classList.remove("visible");

    // Per-network blocks
    summaries.forEach((net, idx) => {
      const pct     = net.supplyW > 0
        ? Math.min((net.demandW / net.supplyW) * 100, 100)
        : 100;
      const supplyPct  = net.supplyW > 0
        ? Math.min((net.supplyW / Math.max(net.supplyW, net.demandW)) * 100, 100)
        : 0;
      const statusCls  = net.satisfied ? "pbar-satisfied" : "pbar-deficit";
      const statusTxt  = net.satisfied ? "ok"  : "bad";
      const surplus    = net.supplyW - net.demandW;
      const surplusTxt = surplus >= 0
        ? `+${surplus}W`
        : `${surplus}W`;
      const surplusCls = surplus >= 0 ? "ok" : "bad";

      const fuelRemaining = this.generatorFuelInfo();

      const block = document.createElement("div");
      block.className = "pnet";
      block.innerHTML = `
        <div class="pnet-header">Network ${idx + 1}
          ${net.satisfied
            ? '<span style="color:#40c060;float:right">● STABLE</span>'
            : '<span style="color:#d04030;float:right">● DEFICIT</span>'}
        </div>
        <div class="pbar-wrap ${statusCls}">
          <div class="pbar-supply" style="width:${supplyPct}%"></div>
          <div class="pbar-demand" style="width:${Math.min(pct, 100)}%"></div>
        </div>
        <div class="pnet-stats">
          <div class="pnet-stat-label">Supply</div>
          <div class="pnet-stat-value ok">${net.supplyW}W</div>

          <div class="pnet-stat-label">Demand</div>
          <div class="pnet-stat-value ${net.demandW > net.supplyW ? "bad" : ""}">${net.demandW}W</div>

          <div class="pnet-stat-label">Surplus</div>
          <div class="pnet-stat-value ${surplusCls}">${surplusTxt}</div>

          <div class="pnet-stat-label">Satisfaction</div>
          <div class="pnet-stat-value ${statusTxt}">${net.demandW > 0 ? Math.round(Math.min(net.supplyW / net.demandW * 100, 100)) : 100}%</div>

          <div class="pnet-stat-label">Generators</div>
          <div class="pnet-stat-value ${net.activeGenerators === 0 && net.generatorCount > 0 ? "bad" : ""}">${net.activeGenerators}/${net.generatorCount} active</div>

          <div class="pnet-stat-label">Machines</div>
          <div class="pnet-stat-value">${net.poweredMachines}/${net.machineCount} powered</div>

          <div class="pnet-stat-label">Nodes</div>
          <div class="pnet-stat-value">${net.nodeCount}</div>

          ${fuelRemaining !== null ? `
          <div class="pnet-stat-label">Fuel est.</div>
          <div class="pnet-stat-value ${fuelRemaining < 30 ? "warn" : "ok"}">${fuelRemaining}s</div>
          ` : ""}
        </div>
      `;
      this.body.appendChild(block);
    });

    // Off-grid / unconnected summary
    const hasOffGrid = offGridFuelMachines > 0 || unconnCount > 0;
    if (hasOffGrid) {
      const block = document.createElement("div");
      block.className = "pnet";
      block.innerHTML = `
        <div class="pnet-header">Off-grid</div>
        <div class="pnet-stats">
          ${unconnCount > 0 ? `
          <div class="pnet-stat-label">No node nearby</div>
          <div class="pnet-stat-value bad">${unconnCount} machine${unconnCount !== 1 ? "s" : ""}</div>
          ` : ""}
          ${offGridFuelMachines > 0 ? `
          <div class="pnet-stat-label">Fuel fallback</div>
          <div class="pnet-stat-value warn">${offGridFuelMachines} running</div>
          ` : ""}
        </div>
      `;
      this.body.appendChild(block);
    }

    if (unconnCount > 0) {
      this.unconnected.textContent = `⚠  ${unconnCount} machine${unconnCount !== 1 ? "s" : ""} out of range — place a Power Node nearby`;
      this.unconnected.classList.add("visible");
    } else {
      this.unconnected.classList.remove("visible");
    }
  }

  /**
   * Estimate seconds of fuel remaining across all active generators.
   * Returns null if no generators are tracked.
   */
  private generatorFuelInfo(): number | null {
    const allDoodads = Object.values(sm.state.doodads);
    let totalRemainingMs = 0;
    let found = false;

    for (const d of allDoodads) {
      const def = registry.findDoodad(d.defId);
      if (!def?.powerGeneration) continue;
      found = true;

      // Current burn remaining
      if (d.fuelBurn) totalRemainingMs += Math.max(0, d.fuelBurn.remainingMs);

      // Plus fuel items in slot (5000ms each)
      for (let i = 0; i < (def.slots?.length ?? 0); i++) {
        const sd = def.slots[i];
        if (!sd || sd.role !== "fuel") continue;
        const slot = d.inventory[i];
        if (slot) totalRemainingMs += slot.qty * 5000;
      }
    }

    return found ? Math.round(totalRemainingMs / 1000) : null;
  }
}
