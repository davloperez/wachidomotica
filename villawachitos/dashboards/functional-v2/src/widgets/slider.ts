import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

/** Pulsación mínima (ms) para "agarrar" el deslizador con el dedo sin tocar el pomo. */
const HOLD_MS = 300;
/** Movimiento (px) a partir del cual un toque deja de ser una pulsación y pasa a ser scroll. */
const SLOP = 8;

/**
 * Deslizador pensado para pantallas táctiles que se usan haciendo scroll.
 * Con el dedo NO responde a un simple toque ni a un arrastre vertical: solo se activa
 * agarrando el pomo y arrastrando en horizontal, o manteniendo pulsado ~0,3 s.
 * Con ratón responde de inmediato. Emite `input` al arrastrar y `change` al soltar.
 */
@customElement("fv2-slider")
export class Slider extends LitElement {
  @property({ type: Number }) min = 0;
  @property({ type: Number }) max = 100;
  @property({ type: Number }) step = 1;
  @property({ type: Number }) value = 0;
  /** Porcentaje de relleno (por defecto, el que corresponde al valor). */
  @property({ type: Number }) pct?: number;
  @property() fill = "";
  @property({ reflect: true }) variant: "" | "thin" | "temp" | "hue" = "";
  @property() label = "";
  @property({ type: Boolean, reflect: true }) disabled = false;
  @state() private active = false;

  private pointer?: number;
  private armed = false;
  private onThumb = false;
  private startX = 0;
  private startY = 0;
  private startValue = 0;
  private timer?: number;

  private get frac(): number {
    const span = this.max - this.min;
    return span > 0 ? Math.min(1, Math.max(0, (this.value - this.min) / span)) : 0;
  }

  private fromX(x: number): number {
    const r = this.getBoundingClientRect();
    const thumb = this.variant === "thin" ? 24 : 34;
    const f = Math.min(1, Math.max(0, (x - r.left - thumb / 2) / Math.max(1, r.width - thumb)));
    const raw = this.min + f * (this.max - this.min);
    const snapped = Math.round(raw / this.step) * this.step;
    return Math.min(this.max, Math.max(this.min, snapped));
  }

  private arm(): void {
    if (this.armed || this.pointer === undefined) return;
    window.clearTimeout(this.timer);
    this.armed = true;
    this.active = true;
    try {
      this.setPointerCapture(this.pointer);
    } catch {
      /* el puntero ya terminó */
    }
  }

  private setValue(v: number): void {
    if (v === this.value) return;
    this.value = v;
    this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  }

  private reset(): void {
    window.clearTimeout(this.timer);
    this.pointer = undefined;
    this.armed = false;
    this.active = false;
  }

  private down = (ev: PointerEvent): void => {
    if (this.disabled || this.pointer !== undefined) return;
    this.pointer = ev.pointerId;
    this.startX = ev.clientX;
    this.startY = ev.clientY;
    this.startValue = this.value;
    if (ev.pointerType === "mouse") {
      this.arm();
      this.setValue(this.fromX(ev.clientX));
      return;
    }
    const thumb = this.shadowRoot?.querySelector(".thumb")?.getBoundingClientRect();
    this.onThumb =
      !!thumb &&
      ev.clientX >= thumb.left - 10 &&
      ev.clientX <= thumb.right + 10 &&
      ev.clientY >= thumb.top - 10 &&
      ev.clientY <= thumb.bottom + 10;
    this.timer = window.setTimeout(() => {
      this.arm();
      this.setValue(this.fromX(this.startX));
    }, HOLD_MS);
  };

  private move = (ev: PointerEvent): void => {
    if (ev.pointerId !== this.pointer) return;
    if (!this.armed) {
      const dx = Math.abs(ev.clientX - this.startX);
      const dy = Math.abs(ev.clientY - this.startY);
      if (this.onThumb && dx > SLOP && dx > dy) {
        this.arm();
      } else if (dx > SLOP || dy > SLOP) {
        // Es un scroll (o un roce): no tocamos nada
        window.clearTimeout(this.timer);
        return;
      } else return;
    }
    this.setValue(this.fromX(ev.clientX));
  };

  private up = (ev: PointerEvent): void => {
    if (ev.pointerId !== this.pointer) return;
    const changed = this.armed && this.value !== this.startValue;
    this.reset();
    if (changed) this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  };

  private cancel = (ev: PointerEvent): void => {
    if (ev.pointerId !== this.pointer) return;
    // El navegador se ha quedado el gesto (scroll): se descarta cualquier cambio
    if (this.armed && this.value !== this.startValue) {
      this.value = this.startValue;
      this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    }
    this.reset();
  };

  private key = (ev: KeyboardEvent): void => {
    if (this.disabled) return;
    const d =
      ev.key === "ArrowRight" || ev.key === "ArrowUp"
        ? 1
        : ev.key === "ArrowLeft" || ev.key === "ArrowDown"
          ? -1
          : 0;
    if (!d) return;
    ev.preventDefault();
    const v = Math.min(this.max, Math.max(this.min, this.value + d * this.step));
    if (v === this.value) return;
    this.setValue(v);
    this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  };

  render() {
    const pct = this.pct ?? this.frac * 100;
    return html`
      <div
        class="track ${this.active ? "active" : ""}"
        role="slider"
        tabindex=${this.disabled ? -1 : 0}
        aria-label=${this.label}
        aria-valuemin=${this.min}
        aria-valuemax=${this.max}
        aria-valuenow=${this.value}
        aria-disabled=${this.disabled}
        style="--pct:${pct}%; --f:${this.frac}; ${this.fill ? `--fill:${this.fill}` : ""}"
        @pointerdown=${this.down}
        @pointermove=${this.move}
        @pointerup=${this.up}
        @pointercancel=${this.cancel}
        @keydown=${this.key}
      >
        <div class="bar"></div>
        <div class="thumb"></div>
      </div>
    `;
  }

  static styles = css`
    :host {
      display: block;
      --size: 34px;
      --bar: 34px;
    }
    :host([variant="thin"]) {
      --size: 24px;
      --bar: 12px;
    }
    .track {
      position: relative;
      height: var(--size);
      /* El scroll vertical lo gestiona siempre el navegador */
      touch-action: pan-y;
      -webkit-user-select: none;
      user-select: none;
      cursor: pointer;
      outline: none;
    }
    .bar {
      position: absolute;
      left: 0;
      right: 0;
      top: calc((var(--size) - var(--bar)) / 2);
      height: var(--bar);
      border-radius: 999px;
      background: linear-gradient(
        90deg,
        var(--fill, var(--amber)) 0 var(--pct, 0%),
        var(--track) var(--pct, 0%) 100%
      );
    }
    :host([variant="temp"]) .bar {
      background: linear-gradient(90deg, #ffb46b, #fff3e0, #cfe2ff);
    }
    :host([variant="hue"]) .bar {
      background: linear-gradient(
        90deg,
        hsl(0 75% 62%),
        hsl(60 75% 62%),
        hsl(120 75% 62%),
        hsl(180 75% 62%),
        hsl(240 75% 62%),
        hsl(300 75% 62%),
        hsl(359 75% 62%)
      );
    }
    .thumb {
      position: absolute;
      top: 0;
      left: calc((100% - var(--size)) * var(--f));
      width: var(--size);
      height: var(--size);
      box-sizing: border-box;
      border-radius: 50%;
      background: #fff;
      border: 6px solid var(--fill, var(--amber));
      transition: transform 150ms var(--ease, ease);
    }
    :host([variant="thin"]) .thumb {
      border-width: 5px;
    }
    :host([variant="temp"]) .thumb,
    :host([variant="hue"]) .thumb {
      border-color: #fff;
      box-shadow: inset 0 0 0 1px var(--track);
    }
    .track.active .thumb {
      transform: scale(1.2);
    }
    .track:focus-visible .thumb {
      outline: 2px solid var(--text);
      outline-offset: 2px;
    }
    :host([disabled]) {
      opacity: 0.5;
      pointer-events: none;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "fv2-slider": Slider;
  }
}
