import { LitElement, css, html, svg, nothing, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { shared } from "../styles/tokens";
import { POOL } from "./house-plan";
import {
  FLOORS,
  HOME_BOX,
  PX,
  WORLD_H,
  WORLD_W,
  groundSvg,
  structureSvg,
  wx,
  wz,
  type Box,
} from "./geometry";

const GROUND = groundSvg();
const STRUCTURE = structureSvg();
const ANIM_MS = 420;
/** A partir de esta escala (píxeles de pantalla por metro) se rotulan todos los marcadores */
const NEAR_PX_PER_M = 32;
/** Zoom máximo al encuadrar una estancia (píxeles de pantalla por metro) */
const FRAME_MAX = 76;

// --inv se registra como número para poder animarlo junto al zoom (si no, los marcadores
// cambiarían de tamaño de golpe al principio de cada viaje del plano).
try {
  CSS.registerProperty({ name: "--inv", syntax: "<number>", inherits: true, initialValue: "1" });
} catch {
  /* ya registrada o navegador sin soporte: los marcadores saltan de tamaño, nada más */
}

interface Ptr {
  x: number;
  y: number;
}

/**
 * Plano 2D navegable: arrastrar para mover, pellizcar o rueda para hacer zoom, doble toque para
 * acercar, y botones +, − y encuadrar. Todo el dibujo (SVG estático + marcadores) va en una sola
 * capa con un `transform`, así que moverlo no repinta nada. Los marcadores llegan por el `slot`
 * (posicionados en píxeles de mundo) y mantienen su tamaño en pantalla con `scale(var(--inv))`.
 *
 * Eventos: `room-tap` (detail = id de estancia) al tocar el suelo de una estancia sin arrastrar.
 */
@customElement("fv2-plan")
export class FloorPlan extends LitElement {
  /** Caja (píxeles de mundo) a encuadrar; al cambiar, el plano viaja hasta ella. */
  @property({ attribute: false }) frameBox: Box = HOME_BOX;
  /** Estancias con alguna luz encendida (su suelo se tiñe de ámbar). */
  @property({ attribute: false }) lit: Set<string> = new Set();
  /** Estancia seleccionada (borde de color). */
  @property({ attribute: false }) selected?: string;
  @property({ type: Boolean }) poolLit = false;
  /** Margen superior que tapan otros controles (el selector de capas): el encuadre lo evita. */
  @property({ type: Number }) padTop = 0;
  /** Zoom "cercano": se usa desde fuera para rotular todos los marcadores. */
  @property({ type: Boolean, reflect: true }) near = false;

  private s = 1;
  private tx = 0;
  private ty = 0;
  /** Escala que encuadra la casa entera (referencia para los límites del zoom). */
  private homeS = 1;
  private w = 0;
  private h = 0;
  private world?: HTMLElement;
  private ro?: ResizeObserver;
  /** El usuario ha movido el plano desde el último encuadre (al cambiar de tamaño no se reencuadra). */
  private userMoved = false;
  private ptrs = new Map<number, Ptr>();
  private start?: { s: number; tx: number; ty: number; mid: Ptr; dist: number };
  private moved = false;
  private lastTap = { t: 0, x: 0, y: 0 };
  private animTimer = 0;
  private raf = 0;

  connectedCallback(): void {
    super.connectedCallback();
    this.ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (!width || !height) return;
      const first = !this.w;
      this.w = width;
      this.h = height;
      this.homeS = this.fitScale(HOME_BOX);
      if (first || !this.userMoved) this.frame(this.frameBox, false);
      else this.apply();
    });
    this.ro.observe(this);
    // En el propio host: con la captura del puntero los eventos llegan aquí, no al interior
    this.addEventListener("click", this.onClickCapture, true);
    this.addEventListener("pointerdown", this.onDown);
    this.addEventListener("pointermove", this.onMove);
    this.addEventListener("pointerup", this.onUp);
    this.addEventListener("pointercancel", this.onCancel);
    this.addEventListener("wheel", this.onWheel, { passive: false });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.ro?.disconnect();
    this.removeEventListener("click", this.onClickCapture, true);
    this.removeEventListener("pointerdown", this.onDown);
    this.removeEventListener("pointermove", this.onMove);
    this.removeEventListener("pointerup", this.onUp);
    this.removeEventListener("pointercancel", this.onCancel);
    this.removeEventListener("wheel", this.onWheel);
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.animTimer);
  }

  protected firstUpdated(): void {
    this.world = this.renderRoot.querySelector<HTMLElement>(".world")!;
    this.apply();
  }

  protected updated(changed: PropertyValues<this>): void {
    const prev = changed.get("frameBox") as Box | undefined;
    if (changed.has("frameBox") && prev && !sameBox(prev, this.frameBox) && this.w)
      this.frame(this.frameBox, true);
  }

  /** Punto de la pantalla (clientX/Y) → píxeles de mundo del plano (para arrastrar iconos). */
  worldPoint(clientX: number, clientY: number): [number, number] {
    const r = this.getBoundingClientRect();
    return [(clientX - r.left - this.tx) / this.s, (clientY - r.top - this.ty) / this.s];
  }

  /** Vuelve a encuadrar la caja actual (botón y doble toque con mucho zoom). */
  reset(): void {
    this.frame(this.frameBox, true);
  }

  private fitScale(b: Box, fill = 0.96): number {
    return Math.min((this.w / b.w) * fill, ((this.h - this.padTop) / b.h) * fill);
  }

  private frame(b: Box, animate: boolean): void {
    if (!this.w) return;
    // Sin pasar de FRAME_MAX px/m: en estancias pequeñas se ve también lo que las rodea
    const s = this.clampS(Math.min(this.fitScale(b), FRAME_MAX / PX));
    this.s = s;
    this.tx = this.w / 2 - s * (b.x + b.w / 2);
    this.ty = this.padTop + (this.h - this.padTop) / 2 - s * (b.y + b.h / 2);
    this.userMoved = false;
    this.apply(animate);
  }

  private clampS(s: number): number {
    return Math.min(Math.max(s, this.homeS * 0.55), this.homeS * 7);
  }

  /** Que siempre quede un trozo de la parcela a la vista. */
  private clampPan(): void {
    const m = 80;
    const ww = WORLD_W * this.s;
    const wh = WORLD_H * this.s;
    this.tx = Math.min(Math.max(this.tx, m - ww), this.w - m);
    this.ty = Math.min(Math.max(this.ty, m - wh), this.h - m);
  }

  /** Aplica el transform (opcionalmente con transición) directamente, sin pasar por Lit. */
  private apply(animate = false): void {
    const el = this.world;
    if (!el) return;
    window.clearTimeout(this.animTimer);
    el.style.transition = animate
      ? `transform ${ANIM_MS}ms var(--ease-soft), --inv ${ANIM_MS}ms var(--ease-soft)`
      : "none";
    el.style.transform = `translate3d(${this.tx.toFixed(1)}px, ${this.ty.toFixed(1)}px, 0) scale(${this.s.toFixed(4)})`;
    el.style.setProperty("--inv", (1 / this.s).toFixed(4));
    if (animate) this.animTimer = window.setTimeout(() => (el.style.transition = "none"), ANIM_MS + 50);
    const near = this.s * PX >= NEAR_PX_PER_M;
    if (near !== this.near) this.near = near;
  }

  /** Mientras dura un gesto la capa se promueve a GPU; al terminar se vuelve a rasterizar nítida. */
  private setGesture(on: boolean): void {
    if (this.world) this.world.style.willChange = on ? "transform" : "auto";
  }

  private zoomAt(factor: number, cx: number, cy: number, animate = false): void {
    const s = this.clampS(this.s * factor);
    const k = s / this.s;
    this.tx = cx - (cx - this.tx) * k;
    this.ty = cy - (cy - this.ty) * k;
    this.s = s;
    this.clampPan();
    this.userMoved = true;
    this.apply(animate);
  }

  /* ---------------------------------------------------------------- */
  /* Gestos                                                            */
  /* ---------------------------------------------------------------- */

  private local(e: PointerEvent | WheelEvent): Ptr {
    const r = this.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private resetStart(): void {
    const ps = [...this.ptrs.values()];
    const mid =
      ps.length > 1 ? { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 } : { x: ps[0].x, y: ps[0].y };
    const dist = ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0;
    this.start = { s: this.s, tx: this.tx, ty: this.ty, mid, dist };
  }

  private onDown = (e: PointerEvent) => {
    if (e.composedPath().some((n) => n instanceof HTMLElement && n.classList.contains("ctl"))) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    this.ptrs.set(e.pointerId, this.local(e));
    if (this.ptrs.size === 1) this.moved = false;
    if (this.ptrs.size > 2) return;
    this.resetStart();
    if (this.ptrs.size === 2) this.beginDrag(e);
  };

  private beginDrag(e: PointerEvent): void {
    if (!this.moved) {
      this.moved = true;
      this.setGesture(true);
      this.dispatchEvent(new CustomEvent("plan-drag", { bubbles: true, composed: true }));
    }
    try {
      this.setPointerCapture(e.pointerId);
    } catch {
      /* el puntero ya no existe */
    }
  }

  private onMove = (e: PointerEvent) => {
    if (!this.ptrs.has(e.pointerId) || !this.start) return;
    this.ptrs.set(e.pointerId, this.local(e));
    const ps = [...this.ptrs.values()];
    const st = this.start;
    if (ps.length === 1) {
      const dx = ps[0].x - st.mid.x;
      const dy = ps[0].y - st.mid.y;
      if (!this.moved && Math.hypot(dx, dy) < 8) return;
      this.beginDrag(e);
      this.tx = st.tx + dx;
      this.ty = st.ty + dy;
    } else {
      const mid = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 };
      const dist = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      const s = this.clampS(st.s * (dist / (st.dist || 1)));
      // El punto del plano que estaba bajo los dedos sigue bajo los dedos
      const px = (st.mid.x - st.tx) / st.s;
      const py = (st.mid.y - st.ty) / st.s;
      this.s = s;
      this.tx = mid.x - px * s;
      this.ty = mid.y - py * s;
    }
    this.userMoved = true;
    // Un solo transform por fotograma, aunque lleguen varios eventos
    if (!this.raf)
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        this.apply();
      });
  };

  private onUp = (e: PointerEvent) => {
    if (!this.ptrs.has(e.pointerId)) return;
    const p = this.local(e);
    this.ptrs.delete(e.pointerId);
    if (this.ptrs.size) {
      this.resetStart();
      return;
    }
    this.start = undefined;
    if (this.moved) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.clampPan();
      this.apply(true);
      this.setGesture(false);
      return;
    }
    // Doble toque: acerca (o, si ya está muy cerca, vuelve al encuadre)
    const now = Date.now();
    const lt = this.lastTap;
    if (now - lt.t < 320 && Math.hypot(p.x - lt.x, p.y - lt.y) < 30) {
      this.lastTap = { t: 0, x: 0, y: 0 };
      if (this.s > this.homeS * 4.5) this.reset();
      else this.zoomAt(2, p.x, p.y, true);
    } else this.lastTap = { t: now, x: p.x, y: p.y };
  };

  private onCancel = (e: PointerEvent) => {
    this.ptrs.delete(e.pointerId);
    if (!this.ptrs.size) {
      this.start = undefined;
      this.setGesture(false);
    }
  };

  private onWheel = (e: WheelEvent) => {
    if (e.composedPath().some((n) => n instanceof HTMLElement && n.classList.contains("ctl"))) return;
    e.preventDefault();
    const p = this.local(e);
    this.zoomAt(Math.exp(-e.deltaY * 0.0016), p.x, p.y);
  };

  /** Tras arrastrar, el "click" que genera el navegador no debe activar marcadores ni estancias. */
  private onClickCapture = (e: Event) => {
    if (this.moved) {
      e.stopPropagation();
      e.preventDefault();
      this.moved = false;
    }
  };

  private tapRoom(id: string): void {
    this.dispatchEvent(new CustomEvent("room-tap", { detail: id, bubbles: true, composed: true }));
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  render() {
    const [px1, pz1, px2, pz2] = POOL.rect;
    return html`
      <div class="viewport">
        <div class="world" style="width:${WORLD_W}px;height:${WORLD_H}px">
          <svg width=${WORLD_W} height=${WORLD_H} viewBox="0 0 ${WORLD_W} ${WORLD_H}" aria-hidden="true">
            <g @click=${() => this.tapRoom("exterior")}>${unsafeSVG(GROUND)}</g>
            ${svg`<rect class="p-water ${this.poolLit ? "lit" : ""}" x=${wx(px1)} y=${wz(pz1)}
              width=${(px2 - px1) * PX} height=${(pz2 - pz1) * PX} rx="3"
              @click=${() => this.tapRoom("exterior")}></rect>`}
            ${FLOORS.map(
              (fl) => svg`<rect
                class="p-floor ${fl.kind} ${this.lit.has(fl.room) ? "lit" : ""}"
                x=${wx(Math.min(fl.rect[0], fl.rect[2]))}
                y=${wz(Math.min(fl.rect[1], fl.rect[3]))}
                width=${Math.abs(fl.rect[2] - fl.rect[0]) * PX}
                height=${Math.abs(fl.rect[3] - fl.rect[1]) * PX}
                @click=${() => this.tapRoom(fl.room)}
              ></rect>`,
            )}
            ${unsafeSVG(STRUCTURE)}
            ${
              this.selected
                ? FLOORS.filter((fl) => fl.room === this.selected).map(
                    (fl) => svg`<rect class="p-sel"
                      x=${wx(Math.min(fl.rect[0], fl.rect[2]))}
                      y=${wz(Math.min(fl.rect[1], fl.rect[3]))}
                      width=${Math.abs(fl.rect[2] - fl.rect[0]) * PX}
                      height=${Math.abs(fl.rect[3] - fl.rect[1]) * PX}></rect>`,
                  )
                : nothing
            }
          </svg>
          <slot></slot>
        </div>
      </div>
    `;
  }

  static styles = [
    shared,
    css`
      :host {
        display: block;
        position: relative;
        overflow: hidden;
        background: var(--p-ground);
        touch-action: none;
        contain: strict;
      }
      .viewport {
        position: absolute;
        inset: 0;
        cursor: grab;
      }
      .viewport:active {
        cursor: grabbing;
      }
      .world {
        position: absolute;
        left: 0;
        top: 0;
        transform-origin: 0 0;
        --inv: 1;
      }
      svg {
        display: block;
        shape-rendering: geometricPrecision;
      }
      .p-grass {
        fill: var(--p-grass);
      }
      .p-paving {
        fill: var(--p-paving);
      }
      .p-deck {
        fill: var(--p-deck);
      }
      .p-water {
        fill: var(--p-water);
        transition: fill 400ms;
      }
      .p-water.lit {
        fill: var(--p-water-lit);
      }
      .p-floor {
        fill: var(--p-floor);
        cursor: pointer;
        transition: fill 400ms;
      }
      .p-floor.tile {
        fill: var(--p-tile);
      }
      .p-floor.stone {
        fill: var(--p-stone);
      }
      .p-floor.lit {
        fill: var(--p-lit);
      }
      .p-furniture {
        fill: var(--p-furniture);
        stroke: var(--p-furniture-line);
        stroke-width: 1;
        pointer-events: none;
      }
      .p-tv {
        stroke: var(--text);
        stroke-linecap: round;
      }
      .p-wall {
        stroke: var(--p-wall);
        stroke-linecap: square;
        pointer-events: none;
      }
      .p-window {
        stroke: var(--p-window);
        pointer-events: none;
      }
      .p-fence {
        stroke: var(--p-fence);
        pointer-events: none;
      }
      .p-gate {
        stroke: var(--p-fence);
        stroke-dasharray: 4 3;
        pointer-events: none;
      }
      .p-sel {
        fill: none;
        stroke: var(--p-selected);
        stroke-width: 3;
        stroke-dasharray: 8 5;
        pointer-events: none;
      }
    `,
  ];
}

function sameBox(a: Box, b: Box): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

declare global {
  interface HTMLElementTagNameMap {
    "fv2-plan": FloorPlan;
  }
}
