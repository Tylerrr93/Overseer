// ============================================================
//  src/game/ui/TechUI.ts
//
//  Tech tree panel — lets the player spend RAM to unlock
//  new machines, recipes, and system capabilities.
//
//  Layout
//  ──────
//  Fixed header  — "◬ Research" title + live RAM counter.
//  Scrollable body — one flex column per tier.  Cards within
//    each tier column stack vertically.  SVG bezier curves
//    drawn between every (prereq → dependent) card pair show
//    the branching dependency graph.
//
//  Branching support
//  ─────────────────
//  • Multiple techs in the same tier can branch from one parent.
//  • A tech can have zero, one, or many preReqTechIds.
//  • Prereqs may span non-adjacent tiers (curves still connect).
//  • SVG layer is re-drawn after every full render and on resize.
//
//  Visual card states
//  ──────────────────
//  state-locked     : pre-requisites not met — dimmed, locked badge.
//  state-available  : pre-reqs met, not yet purchased — cost + button.
//  state-unlocked   : purchased — cyan highlight + checkmark.
//
//  Keyboard shortcut: T toggles the panel.
//  Extends UIPanel — drag, resize, ESC-close, z-stacking.
// ============================================================

import { UIPanel }       from "./UIPanel";
import { sm }            from "@engine/core/StateManager";
import { registry }      from "@engine/core/Registry";
import { bus }           from "@engine/core/EventBus";
import type { TechSystem } from "@engine/systems/TechSystem";
import type { TechDef }    from "@t/content";

// ── Styles ────────────────────────────────────────────────────

const STYLES = `
#tech-ui {
  background: rgba(4, 8, 14, 0.97);
  border: 1px solid #0a2a3a;
  border-radius: var(--panel-radius);
  box-shadow: var(--panel-shadow-cyan);
  font-family: monospace;
  color: #a0b8d8;
  /* No max-width / max-height — the user can resize freely.
     UIPanel's resize handle handles the rest. */
  min-width:  calc(500px * var(--ui-scale));
  min-height: calc(220px * var(--ui-scale));
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
}

/* ── Header ────────────────────────────────────────────── */
#tech-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--panel-padding-sm) var(--panel-padding-md);
  border-bottom: 1px solid #0a2a3a;
  background: rgba(0, 20, 32, 0.8);
  flex-shrink: 0;
  cursor: grab;
  user-select: none;
  gap: var(--gap-xl);
}
#tech-header:active { cursor: grabbing; }

#tech-title-text {
  font-size: var(--font-md);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #00e5ff;
}

#tech-header-hint {
  font-size: var(--font-2xs);
  color: #1a4a5a;
  letter-spacing: 0.1em;
  margin-left: var(--gap-lg);
}

/* ── RAM counter in header ─────────────────────────────── */
#tech-ram-counter {
  display: flex;
  align-items: baseline;
  gap: var(--gap-md);
  background: rgba(0, 229, 255, 0.05);
  border: 1px solid rgba(0, 229, 255, 0.15);
  border-radius: calc(3px * var(--ui-scale));
  padding: calc(4px * var(--ui-scale)) calc(10px * var(--ui-scale));
  flex-shrink: 0;
}
#tech-ram-label {
  font-size: var(--font-2xs);
  color: #2a6a7a;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
#tech-ram-value {
  font-size: var(--font-md);
  color: #00e5ff;
  letter-spacing: 0.06em;
  font-weight: bold;
  min-width: calc(40px * var(--ui-scale));
  text-align: right;
}

/* ── Scroll viewport ───────────────────────────────────── */
#tech-scroll {
  flex: 1;
  overflow: auto;
  position: relative;  /* SVG overlay anchors to this */
}
#tech-scroll::-webkit-scrollbar        { width: calc(6px * var(--ui-scale)); height: calc(6px * var(--ui-scale)); }
#tech-scroll::-webkit-scrollbar-track  { background: transparent; }
#tech-scroll::-webkit-scrollbar-thumb  { background: #1a3a4a; border-radius: calc(3px * var(--ui-scale)); }

/* ── Inner canvas — grows to fit all tiers ─────────────── */
#tech-tree {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  /* horizontal gap between tier columns — wide enough for bezier curves */
  gap: calc(40px * var(--ui-scale));
  padding: var(--panel-padding-md);
  /* min-width forces the inner canvas to be at least as wide as the scroll
     viewport so short trees don't look odd; it expands as tiers are added. */
  min-width: 100%;
  position: relative;  /* card positions measured relative to this */
  box-sizing: border-box;
}

/* ── SVG connector overlay ─────────────────────────────── */
.tech-svg-connectors {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  /* overflow visible so curves that leave the measured box still render */
  overflow: visible;
}

/* ── Tier column ───────────────────────────────────────── */
.tech-tier {
  display: flex;
  flex-direction: column;
  gap: calc(10px * var(--ui-scale));
  width: calc(220px * var(--ui-scale));
  flex-shrink: 0;
}

.tech-tier-label {
  font-size: var(--font-2xs);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #1a4a6a;
  padding-bottom: var(--gap-sm);
  border-bottom: 1px solid #0e1e2e;
  margin-bottom: var(--gap-xs);
}

/* ── Tech card ─────────────────────────────────────────── */
.tech-card {
  border: 1px solid #1a2a3a;
  border-radius: calc(4px * var(--ui-scale));
  padding: var(--gap-lg);
  background: rgba(255, 255, 255, 0.02);
  display: flex;
  flex-direction: column;
  gap: calc(5px * var(--ui-scale));
  transition: border-color 0.15s, background 0.15s, opacity 0.2s;
  position: relative;
  /* fixed width inherited from .tech-tier; consistent card size */
}

.tech-card.state-locked {
  opacity: 0.35;
  border-color: #0e1a22;
  background: transparent;
}

.tech-card.state-available {
  border-color: #1a3a4a;
  background: rgba(0, 40, 60, 0.3);
}

.tech-card.state-available.can-afford {
  border-color: #0a6070;
  background: rgba(0, 120, 160, 0.08);
  box-shadow: 0 0 10px rgba(0, 180, 220, 0.10);
}

.tech-card.state-unlocked {
  border-color: rgba(0, 229, 255, 0.35);
  background: rgba(0, 229, 255, 0.04);
}

.tech-name {
  font-size: var(--font-sm);
  color: #70a0c0;
  letter-spacing: 0.08em;
}
.tech-card.state-unlocked .tech-name { color: #00e5ff; }
.tech-card.state-locked    .tech-name { color: #2a4050; }

.tech-desc {
  font-size: var(--font-2xs);
  color: #2a4a5a;
  letter-spacing: 0.04em;
  line-height: 1.45;
}
.tech-card.state-available .tech-desc { color: #3a5a6a; }

.tech-unlocks-line {
  font-size: var(--font-2xs);
  color: #1a3a4a;
  letter-spacing: 0.04em;
  line-height: 1.3;
  font-style: italic;
}
.tech-card.state-unlocked .tech-unlocks-line { color: #1a5a5a; }

.tech-prereq-hint {
  font-size: var(--font-2xs);
  color: #5a3a2a;
  letter-spacing: 0.06em;
  margin-top: calc(2px * var(--ui-scale));
}

.tech-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: calc(4px * var(--ui-scale));
  gap: var(--gap-sm);
}

.tech-cost-line {
  font-size: var(--font-2xs);
  color: #2a5a6a;
  letter-spacing: 0.08em;
  flex-shrink: 0;
}

.tech-unlock-btn {
  padding: calc(4px * var(--ui-scale)) calc(10px * var(--ui-scale));
  background: rgba(0, 180, 220, 0.08);
  border: 1px solid #1a5a6a;
  border-radius: calc(2px * var(--ui-scale));
  color: #40a0c0;
  font-family: monospace;
  font-size: var(--font-2xs);
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: background 0.1s, border-color 0.1s, color 0.1s;
  white-space: nowrap;
  flex-shrink: 0;
}
.tech-unlock-btn:not(:disabled):hover {
  background: rgba(0, 229, 255, 0.14);
  border-color: #00c8e0;
  color: #00e5ff;
}
.tech-unlock-btn:not(:disabled):active { background: rgba(0, 229, 255, 0.22); }
.tech-unlock-btn:disabled { opacity: 0.28; cursor: default; }

.tech-unlocked-badge {
  font-size: var(--font-2xs);
  color: #006a6a;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.tech-locked-badge {
  font-size: var(--font-2xs);
  color: #3a2a1a;
  letter-spacing: 0.1em;
}

/* Empty state */
.tech-tree-empty {
  font-size: var(--font-sm);
  color: #1a3a4a;
  padding: var(--panel-padding-md);
  letter-spacing: 0.1em;
}
`;

function injectStyles(): void {
  if (document.getElementById("tech-ui-styles")) return;
  const s = document.createElement("style");
  s.id = "tech-ui-styles";
  s.textContent = STYLES;
  document.head.appendChild(s);
}

// ── SVG namespace ─────────────────────────────────────────────

const SVG_NS = "http://www.w3.org/2000/svg";

// ─────────────────────────────────────────────────────────────

export class TechUI extends UIPanel {
  private techSystem:  TechSystem | null = null;
  private ramEl!:      HTMLElement;
  private treeEl!:     HTMLElement;   // #tech-tree  (inner canvas, position:relative)
  private scrollEl!:   HTMLElement;   // #tech-scroll (overflow:auto viewport)

  constructor() {
    super({
      id:        "tech-ui",
      name:      "tech",
      minWidth:  500,
      minHeight: 220,
      resizable: true,
    });

    injectStyles();
    this._buildShell();

    // Re-draw the full tree whenever a tech is unlocked
    bus.on("tech:unlocked", () => {
      if (this.isOpen) {
        this._renderTree();
      }
    });

    // Keyboard shortcut: T
    window.addEventListener("keydown", e => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "t" || e.key === "T") this.toggle();
    });
  }

  setTechSystem(ts: TechSystem): void {
    this.techSystem = ts;
  }

  // ── UIPanel lifecycle ─────────────────────────────────────

  protected override onOpen(): void {
    this._refreshRam();
    this._renderTree();
  }

  // Redraw connectors when the user resizes the panel
  protected override onResize(_w: number, _h: number): void {
    if (this.isOpen) requestAnimationFrame(() => this._drawConnectors());
  }

  // ── Tick (called by GameLoop only while visible) ──────────

  tick(): void {
    this._refreshRam();
    this._syncUnlockButtons();
  }

  // ── Private: helpers ──────────────────────────────────────

  private _refreshRam(): void {
    this.ramEl.textContent = String(sm.state.ram);
  }

  /**
   * Cheap per-frame sync: only updates button disabled state and
   * the can-afford class.  No DOM reconstruction.
   */
  private _syncUnlockButtons(): void {
    for (const tech of registry.allTechs().values()) {
      if (sm.state.unlockedTechs.includes(tech.id)) continue;

      const card = this.treeEl.querySelector<HTMLElement>(
        `[data-tech-id="${tech.id}"]`,
      );
      if (!card) continue;

      const preReqsMet = this._preReqsMet(tech);
      const canAfford  = sm.state.ram >= tech.cost;
      const btn        = card.querySelector<HTMLButtonElement>(".tech-unlock-btn");

      if (btn) btn.disabled = !preReqsMet || !canAfford;
      card.classList.toggle("can-afford", preReqsMet && canAfford);
    }
  }

  private _preReqsMet(tech: TechDef): boolean {
    if (!tech.preReqTechIds || tech.preReqTechIds.length === 0) return true;
    return tech.preReqTechIds.every(id => sm.state.unlockedTechs.includes(id));
  }

  /**
   * Accumulate offsetLeft/offsetTop walking up to `ancestor`.
   * Used to measure card centres relative to #tech-tree.
   */
  private _offsetRelTo(
    el:       HTMLElement,
    ancestor: HTMLElement,
  ): { x: number; y: number } {
    let x = 0, y = 0;
    let cur: HTMLElement | null = el;
    while (cur && cur !== ancestor) {
      x  += cur.offsetLeft;
      y  += cur.offsetTop;
      cur = cur.offsetParent as HTMLElement | null;
    }
    return { x, y };
  }

  // ── Shell construction (once) ─────────────────────────────

  private _buildShell(): void {
    this.el.style.overflow = "hidden";
    this.el.style.padding  = "0";

    this.el.innerHTML = `
      <div id="tech-header">
        <div style="display:flex;align-items:baseline;gap:var(--gap-lg)">
          <span id="tech-title-text">◬ Research</span>
          <span id="tech-header-hint">T — TOGGLE  ·  ESC — CLOSE  ·  DRAG / RESIZE</span>
        </div>
        <div id="tech-ram-counter">
          <span id="tech-ram-label">RAM</span>
          <span id="tech-ram-value">0</span>
        </div>
      </div>
      <div id="tech-scroll">
        <div id="tech-tree"></div>
      </div>
    `;

    this.bindDragHandle(this.el.querySelector("#tech-header") as HTMLElement);
    this.ramEl    = this.el.querySelector("#tech-ram-value")!;
    this.scrollEl = this.el.querySelector("#tech-scroll")!;
    this.treeEl   = this.el.querySelector("#tech-tree")!;
  }

  // ── Tree rendering ────────────────────────────────────────

  private _renderTree(): void {
    this.treeEl.innerHTML = "";

    // Group techs by tier
    const byTier = new Map<number, TechDef[]>();
    for (const tech of registry.allTechs().values()) {
      const t = tech.tier ?? 1;
      if (!byTier.has(t)) byTier.set(t, []);
      byTier.get(t)!.push(tech);
    }

    if (byTier.size === 0) {
      const msg = document.createElement("div");
      msg.className = "tech-tree-empty";
      msg.textContent = "No technologies available.";
      this.treeEl.appendChild(msg);
      return;
    }

    const sortedTiers = [...byTier.keys()].sort((a, b) => a - b);

    for (const tier of sortedTiers) {
      const col = document.createElement("div");
      col.className = "tech-tier";

      const lbl = document.createElement("div");
      lbl.className = "tech-tier-label";
      lbl.textContent = `Tier ${tier}`;
      col.appendChild(lbl);

      for (const tech of byTier.get(tier)!) {
        col.appendChild(this._makeTechCard(tech));
      }

      this.treeEl.appendChild(col);
    }

    // Wait one frame for layout, then draw connector curves
    requestAnimationFrame(() => this._drawConnectors());
  }

  // ── SVG branch connectors ─────────────────────────────────

  /**
   * Draws cubic bezier curves from each prerequisite tech card to
   * the dependent tech card.  Re-run after every render or resize.
   *
   * The SVG is sized to the full scroll content so curves remain
   * correct when the user scrolls.
   */
  private _drawConnectors(): void {
    // Remove previous SVG
    this.treeEl.querySelector(".tech-svg-connectors")?.remove();

    // Nothing to connect if the tree has no cards
    const allTechs = [...registry.allTechs().values()];
    const hasEdges = allTechs.some(
      t => t.preReqTechIds && t.preReqTechIds.length > 0,
    );
    if (!hasEdges) return;

    const contentW = this.treeEl.scrollWidth;
    const contentH = this.treeEl.scrollHeight;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.classList.add("tech-svg-connectors");
    svg.setAttribute("width",  String(contentW));
    svg.setAttribute("height", String(contentH));
    svg.style.width  = `${contentW}px`;
    svg.style.height = `${contentH}px`;

    for (const tech of allTechs) {
      if (!tech.preReqTechIds || tech.preReqTechIds.length === 0) continue;

      const childCard = this.treeEl.querySelector<HTMLElement>(
        `[data-tech-id="${tech.id}"]`,
      );
      if (!childCard) continue;

      const childPos  = this._offsetRelTo(childCard, this.treeEl);
      // Entry point: left-centre of child card
      const childX = childPos.x;
      const childY = childPos.y + childCard.offsetHeight / 2;

      for (const prereqId of tech.preReqTechIds) {
        const parentCard = this.treeEl.querySelector<HTMLElement>(
          `[data-tech-id="${prereqId}"]`,
        );
        if (!parentCard) continue;

        const parentPos = this._offsetRelTo(parentCard, this.treeEl);
        // Exit point: right-centre of parent card
        const parentX = parentPos.x + parentCard.offsetWidth;
        const parentY = parentPos.y + parentCard.offsetHeight / 2;

        // Determine colour from unlock state
        const childUnlocked  = sm.state.unlockedTechs.includes(tech.id);
        const parentUnlocked = sm.state.unlockedTechs.includes(prereqId);

        let stroke: string;
        let strokeWidth: string;
        if (childUnlocked && parentUnlocked) {
          // Both unlocked — bright active connection
          stroke = "rgba(0, 229, 255, 0.45)";
          strokeWidth = "1.5";
        } else if (parentUnlocked) {
          // Parent done, child available — mid tone
          stroke = "rgba(0, 140, 180, 0.30)";
          strokeWidth = "1.5";
        } else {
          // Locked path — barely visible
          stroke = "rgba(20, 50, 70, 0.50)";
          strokeWidth = "1";
        }

        // Cubic bezier: control points pulled horizontally toward the midpoint
        const midX = (parentX + childX) / 2;
        const d = `M ${parentX} ${parentY} C ${midX} ${parentY}, ${midX} ${childY}, ${childX} ${childY}`;

        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("d",            d);
        path.setAttribute("fill",         "none");
        path.setAttribute("stroke",       stroke);
        path.setAttribute("stroke-width", strokeWidth);

        svg.appendChild(path);
      }
    }

    // Insert behind all cards (first child of #tech-tree)
    this.treeEl.insertBefore(svg, this.treeEl.firstChild);
  }

  // ── Card factory ──────────────────────────────────────────

  private _makeTechCard(tech: TechDef): HTMLElement {
    const isUnlocked = sm.state.unlockedTechs.includes(tech.id);
    const preReqsMet = this._preReqsMet(tech);
    const canAfford  = sm.state.ram >= tech.cost;

    const stateClass  = isUnlocked ? "state-unlocked"
      : preReqsMet    ? "state-available"
      : "state-locked";
    const affordClass = (!isUnlocked && preReqsMet && canAfford) ? " can-afford" : "";

    const card = document.createElement("div");
    card.className   = `tech-card ${stateClass}${affordClass}`;
    card.dataset["techId"] = tech.id;

    // Name
    const nameEl = document.createElement("div");
    nameEl.className   = "tech-name";
    nameEl.textContent = tech.name;
    card.appendChild(nameEl);

    // Description
    const descEl = document.createElement("div");
    descEl.className   = "tech-desc";
    descEl.textContent = tech.description;
    card.appendChild(descEl);

    // What this tech unlocks (summary line)
    const unlockParts: string[] = [];
    if (tech.unlocksRecipeIds.length)   unlockParts.push(`${tech.unlocksRecipeIds.length} recipe${tech.unlocksRecipeIds.length > 1 ? "s" : ""}`);
    if (tech.unlocksDoodadIds.length)   unlockParts.push(`${tech.unlocksDoodadIds.length} building${tech.unlocksDoodadIds.length > 1 ? "s" : ""}`);
    if (tech.unlocksSystemFlags.length) unlockParts.push(`${tech.unlocksSystemFlags.length} system flag${tech.unlocksSystemFlags.length > 1 ? "s" : ""}`);
    if (unlockParts.length > 0) {
      const ulEl = document.createElement("div");
      ulEl.className   = "tech-unlocks-line";
      ulEl.textContent = `Unlocks: ${unlockParts.join(", ")}`;
      card.appendChild(ulEl);
    }

    // Pre-req hint when locked
    if (!isUnlocked && !preReqsMet && tech.preReqTechIds && tech.preReqTechIds.length > 0) {
      const prereqNames = tech.preReqTechIds.map(id => {
        const t = registry.findTech(id);
        return t ? t.name : id;
      });
      const hintEl = document.createElement("div");
      hintEl.className   = "tech-prereq-hint";
      hintEl.textContent = `⚠ Requires: ${prereqNames.join(", ")}`;
      card.appendChild(hintEl);
    }

    // Footer: cost + action
    const footer = document.createElement("div");
    footer.className = "tech-footer";

    const costEl = document.createElement("div");
    costEl.className   = "tech-cost-line";
    costEl.textContent = isUnlocked ? "" : `${tech.cost} RAM`;
    footer.appendChild(costEl);

    if (isUnlocked) {
      const badge = document.createElement("div");
      badge.className   = "tech-unlocked-badge";
      badge.textContent = "✓ Researched";
      footer.appendChild(badge);
    } else if (!preReqsMet) {
      const badge = document.createElement("div");
      badge.className   = "tech-locked-badge";
      badge.textContent = "⌀ Locked";
      footer.appendChild(badge);
    } else {
      const btn = document.createElement("button");
      btn.className  = "tech-unlock-btn";
      btn.disabled   = !canAfford;
      btn.textContent = `▶ Unlock`;

      btn.addEventListener("click", () => {
        const ok = this.techSystem?.unlock(tech.id) ?? false;
        if (!ok) return;
        this._renderTree();          // full re-draw — card states + connector colours change
        bus.emit("ui:notification", {
          message:  `Research complete: ${tech.name}`,
          severity: "info",
        });
      });

      footer.appendChild(btn);
    }

    card.appendChild(footer);
    return card;
  }
}
