// ============================================================
//  src/game/ui/UIPanel.ts
//
//  Abstract base class that every UI panel extends.
//
//  Responsibilities:
//    • Creates and appends the root DOM element.
//    • Applies structural inline styles (position, display,
//      overflow, min-size, optional resize handle) that must
//      not be overridden by stylesheet rules.
//    • Handles panel-header drag (call bindDragHandle in ctor).
//    • Provides open / close / toggle with PanelManager wiring.
//    • Exposes onOpen / onClose / onResize hooks for subclasses.
//    • Registers a z-index setter with PanelManager so the
//      multi-panel stacking system can reorder windows.
//
//  Usage pattern in a subclass:
//
//    export class MyPanel extends UIPanel {
//      constructor() {
//        super({ id: "my-panel", name: "my-panel", minWidth: 400 });
//        injectStyles();              // subclass-specific CSS
//        this.el.innerHTML = `...`;   // build inner HTML
//        this.bindDragHandle(this.el.querySelector("#my-header")!);
//        // bind keys, bus events, etc.
//      }
//      protected override onOpen(): void  { this.render(); }
//      protected override onClose(): void { /* cleanup */ }
//      protected override onResize(w: number, h: number): void { /* relayout */ }
//    }
// ============================================================

import { UIStyleManager } from "./UIStyleManager";
import { panelManager }   from "@engine/core/PanelManager";

// ── Options ────────────────────────────────────────────────────

export interface UIPanelOptions {
  /** HTML element id, e.g. "inventory-ui". */
  id: string;
  /**
   * PanelManager registration key, e.g. "inventory".
   * Must match the name used in bus "ui:close-panels" events.
   */
  name: string;
  minWidth?:  number;
  minHeight?: number;
  /**
   * Enable browser-native resize handle (bottom-right corner).
   * Defaults to true.  Requires overflow !== visible, which
   * UIPanel guarantees by setting overflow: auto.
   */
  resizable?: boolean;
}

// ── Abstract base ──────────────────────────────────────────────

export abstract class UIPanel {
  /** The root DOM element.  Subclasses write innerHTML here. */
  protected readonly el: HTMLElement;
  /** True while the panel is visible. */
  protected isOpen = false;

  // ── Drag state ───────────────────────────────────────────
  private _dragActive = false;
  private _dragOffX   = 0;
  private _dragOffY   = 0;
  /**
   * Once true the centering transform has been replaced by
   * concrete left/top pixel co-ordinates so dragging works
   * correctly against the physical page origin.
   */
  private _positioned = false;

  // ── Stored references for clean removal in destroy() ────
  private readonly _onGlobalMouseMove: (e: MouseEvent) => void;
  private readonly _onGlobalMouseUp:   () => void;

  private readonly _ro: ResizeObserver;

  constructor(protected readonly opts: UIPanelOptions) {
    UIStyleManager.inject();

    // ── Root element ─────────────────────────────────────────
    this.el = document.createElement("div");
    this.el.id = opts.id;
    this.el.classList.add("ui-panel");

    // Structural styles injected inline — highest specificity,
    // cannot be overridden by subclass stylesheets.
    this.el.style.display   = "none";
    this.el.style.position  = "fixed";
    this.el.style.top       = "50%";
    this.el.style.left      = "50%";
    this.el.style.transform = "translate(-50%, -50%)";
    this.el.style.zIndex    = String(panelManager.getBaseZ());
    this.el.style.minWidth  = `${opts.minWidth  ?? 280}px`;
    this.el.style.minHeight = `${opts.minHeight ?? 80}px`;
    this.el.style.overflow  = "auto";   // required for resize: both
    if (opts.resizable !== false) {
      this.el.style.resize = "both";
    }

    document.body.appendChild(this.el);

    // ── PanelManager registration ─────────────────────────────
    panelManager.register(opts.name, z => {
      this.el.style.zIndex = String(z);
    });

    // Bring to front on any click inside this panel.
    this.el.addEventListener("mousedown", () => {
      panelManager.focus(opts.name);
    });

    // ── Global drag handlers ──────────────────────────────────
    this._onGlobalMouseMove = (e: MouseEvent) => this._handleMouseMove(e);
    this._onGlobalMouseUp   = ()              => this._handleMouseUp();

    window.addEventListener("mousemove", this._onGlobalMouseMove);
    window.addEventListener("mouseup",   this._onGlobalMouseUp);

    // ── ResizeObserver ────────────────────────────────────────
    this._ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        this.onResize(entry.contentRect.width, entry.contentRect.height);
      }
    });
    this._ro.observe(this.el);
  }

  // ── Drag ──────────────────────────────────────────────────────

  /**
   * Register a header element as the drag initiator.
   * Call once in the subclass constructor after building innerHTML.
   */
  protected bindDragHandle(handle: HTMLElement): void {
    handle.addEventListener("mousedown", e => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      this._dragActive = true;
      handle.classList.add("is-dragging");

      // Resolve CSS centering transform → concrete px co-ords once.
      if (!this._positioned) {
        const r = this.el.getBoundingClientRect();
        this.el.style.transform = "none";
        this.el.style.left = `${r.left}px`;
        this.el.style.top  = `${r.top}px`;
        this._positioned = true;
      }

      const r = this.el.getBoundingClientRect();
      this._dragOffX = e.clientX - r.left;
      this._dragOffY = e.clientY - r.top;
    });
  }

  private _handleMouseMove(e: MouseEvent): void {
    if (!this._dragActive) return;
    const margin = 8;
    const pw = this.el.offsetWidth;
    const ph = this.el.offsetHeight;
    const l = Math.max(margin, Math.min(window.innerWidth  - pw - margin, e.clientX - this._dragOffX));
    const t = Math.max(margin, Math.min(window.innerHeight - ph - margin, e.clientY - this._dragOffY));
    this.el.style.left = `${l}px`;
    this.el.style.top  = `${t}px`;
  }

  private _handleMouseUp(): void {
    if (!this._dragActive) return;
    this._dragActive = false;
    // Remove dragging cursor class from any header inside this panel
    this.el.querySelector(".is-dragging")?.classList.remove("is-dragging");
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.el.style.display = "block";
    panelManager.open(this.opts.name);
    this.onOpen();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.style.display = "none";
    panelManager.close(this.opts.name);
    this.onClose();
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else             this.open();
  }

  /** Returns true while the panel is visible. Safe to call from outside. */
  isCurrentlyOpen(): boolean { return this.isOpen; }

  // ── Subclass hooks ─────────────────────────────────────────────

  /** Fired immediately after the panel becomes visible. */
  protected onOpen():  void {}
  /** Fired immediately after the panel hides. */
  protected onClose(): void {}
  /**
   * Fired by ResizeObserver when the panel's content box changes.
   * Override to relayout content when the user drags the resize handle.
   */
  protected onResize(_width: number, _height: number): void {}

  // ── Cleanup ────────────────────────────────────────────────────

  destroy(): void {
    this._ro.disconnect();
    window.removeEventListener("mousemove", this._onGlobalMouseMove);
    window.removeEventListener("mouseup",   this._onGlobalMouseUp);
    this.el.remove();
  }
}
