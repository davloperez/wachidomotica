/**
 * Gráficas propias en SVG, ligeras y con el estilo tranquilo del panel:
 * área suavizada, barras redondeadas, anillo, línea de actividad y flujo de energía.
 * Todas se adaptan al ancho disponible (ResizeObserver) y usan las variables de color del tema.
 */
import { LitElement, css, html, nothing, svg } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { mdiHomeOutline, mdiSolarPower, mdiTransmissionTower } from "@mdi/js";
import type { Point, Span } from "../lib/data";
import { fmt, svgIcon } from "../lib/ha";

/** Base para gráficas que necesitan conocer su ancho real. */
class Sized extends LitElement {
  @state() protected w = 300;
  private ro?: ResizeObserver;
  connectedCallback(): void {
    super.connectedCallback();
    this.ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      if (w > 0 && Math.abs(w - this.w) > 1) this.w = w;
    });
    this.ro.observe(this);
  }
  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.ro?.disconnect();
  }
}

/** Curva suave (Catmull-Rom → Bézier) que pasa por todos los puntos. */
function smoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const t = 0.18;
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

let uid = 0;

export interface AreaSeries {
  data: Point[];
  /** Color CSS (variable), p. ej. "var(--sage)" */
  color: string;
  label?: string;
  unit?: string;
  /** Eje propio (escala independiente) */
  own?: boolean;
}

const hourLabel = (t: number) =>
  new Date(t).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

@customElement("fv2-area-chart")
export class AreaChart extends Sized {
  @property({ attribute: false }) series: AreaSeries[] = [];
  @property({ type: Number }) height = 120;
  @property({ type: Number }) digits = 1;
  /** Leyenda con mínimo, máximo y variación de cada serie (para saber cuánto ha cambiado de verdad) */
  @property({ type: Boolean }) legend = true;
  /** Mostrar la variación entre el primer y el último valor (no tiene sentido en consumos a ratos) */
  @property({ type: Boolean }) trend = true;
  private uidA = `a${uid++}`;

  render() {
    const W = this.w;
    const H = this.height;
    const pad = { l: 4, r: 4, t: 14, b: 20 };
    const all = this.series.flatMap((s) => s.data);
    if (all.length < 2) return html`<div class="empty" style="height:${H}px">Sin datos todavía</div>`;
    const t0 = Math.min(...all.map((p) => p[0]));
    const t1 = Math.max(...all.map((p) => p[0]));
    const range = (data: Point[]) => {
      let lo = Math.min(...data.map((p) => p[1]));
      let hi = Math.max(...data.map((p) => p[1]));
      if (hi - lo < 1e-6) {
        lo -= 1;
        hi += 1;
      }
      const m = (hi - lo) * 0.15;
      return [lo - m, hi + m];
    };
    // La escala común solo cuenta las series sin eje propio (si no, un % aplasta a los kW)
    const shared = this.series.filter((s) => !s.own).flatMap((s) => s.data);
    const sharedRange = range(shared.length > 1 ? shared : all);
    const x = (t: number) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r);
    const ticks = [0, 0.5, 1].map((f) => t0 + (t1 - t0) * f);
    const plotH = H - pad.t - pad.b;
    // Escala de la primera serie en las líneas guía (si hay varias, con su color)
    const s0 = this.series.find((s) => s.data.length > 1);
    const [lo0, hi0] = s0 ? (s0.own ? range(s0.data) : sharedRange) : [0, 1];
    const multi = this.series.filter((s) => s.data.length > 1).length > 1;
    // Etiquetas del último valor de cada serie, separadas para que no se pisen
    const usedY: number[] = [];
    const labelY = (y: number) => {
      let v = Math.max(10, y - 12);
      while (usedY.some((u) => Math.abs(u - v) < 14)) v += 14;
      usedY.push(v);
      return v;
    };

    return html`
      <svg width=${W} height=${H} viewBox="0 0 ${W} ${H}">
        ${[0.25, 0.5, 0.75].map(
          (f) =>
            svg`<line x1=${pad.l} x2=${W - pad.r} y1=${pad.t + plotH * f} y2=${pad.t + plotH * f} class="grid"/>`,
        )}
        ${this.series.map((s, i) => {
          if (s.data.length < 2) return nothing;
          const [lo, hi] = s.own ? range(s.data) : sharedRange;
          const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
          const pts = s.data.map((p): [number, number] => [x(p[0]), y(p[1])]);
          const line = smoothPath(pts);
          const area = `${line} L${pts[pts.length - 1][0]},${H - pad.b} L${pts[0][0]},${H - pad.b} Z`;
          const last = pts[pts.length - 1];
          const lastV = s.data[s.data.length - 1][1];
          const gid = `${this.uidA}-${i}`;
          return svg`
            <defs>
              <linearGradient id=${gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color=${s.color} stop-opacity="0.35"/>
                <stop offset="1" stop-color=${s.color} stop-opacity="0"/>
              </linearGradient>
            </defs>
            <path d=${area} fill="url(#${gid})" class="area"/>
            <path d=${line} fill="none" stroke=${s.color} stroke-width="2.4" stroke-linecap="round" class="line"/>
            <circle cx=${last[0]} cy=${last[1]} r="4.5" fill=${s.color} class="dot"/>
            <circle cx=${last[0]} cy=${last[1]} r="9" fill=${s.color} opacity="0.18" class="halo"/>
            ${this.extremes(s, pts, i === 0)}
            ${i === 0 || s.own ? svg`<text x=${Math.min(last[0], W - 8)} y=${labelY(last[1])} text-anchor="end" class="val" fill=${s.color}>${fmt(lastV, this.digits)}${s.unit ?? ""}</text>` : nothing}
          `;
        })}
        ${
          s0
            ? [0.25, 0.5, 0.75].map(
                (f) =>
                  svg`<text x=${pad.l + 2} y=${pad.t + plotH * f - 3} class="axis" fill=${multi ? s0.color : "var(--text-faint)"}>${fmt(hi0 - (hi0 - lo0) * f, this.digits)}${s0.unit?.trim() ?? ""}</text>`,
              )
            : nothing
        }
        ${ticks.map(
          (t, i) =>
            svg`<text x=${x(t)} y=${H - 4} text-anchor=${i === 0 ? "start" : i === 2 ? "end" : "middle"} class="tick">${hourLabel(t)}</text>`,
        )}
      </svg>
      ${this.legend ? this.renderLegend() : nothing}
    `;
  }

  /** Marca el máximo y el mínimo de la serie sobre la curva (si no son el último punto). */
  private extremes(s: AreaSeries, pts: [number, number][], first: boolean) {
    const vals = s.data.map((p) => p[1]);
    const iMax = vals.indexOf(Math.max(...vals));
    const iMin = vals.indexOf(Math.min(...vals));
    if (iMax === iMin) return nothing;
    const last = vals.length - 1;
    const W = this.w;
    const mark = (i: number, above: boolean) => {
      if (i === last) return nothing;
      const [px, py] = pts[i];
      const anchor = px < 40 ? "start" : px > W - 40 ? "end" : "middle";
      return svg`<circle cx=${px} cy=${py} r="3" class="ext" stroke=${s.color}/>
        <text x=${px} y=${above ? py - 7 : py + 14} text-anchor=${anchor} class="extv" fill=${s.color}>${fmt(vals[i], this.digits)}${s.unit?.trim() ?? ""}</text>`;
    };
    // Con varias series solo se rotulan los extremos de la primera para no amontonar cifras
    return svg`${mark(iMax, true)}${first ? mark(iMin, false) : nothing}`;
  }

  private renderLegend() {
    const rows = this.series.filter((s) => s.data.length > 1);
    if (!rows.length) return nothing;
    return html`<div class="legend">
      ${rows.map((s) => {
        const vals = s.data.map((p) => p[1]);
        const unit = s.unit ?? "";
        const delta = vals[vals.length - 1] - vals[0];
        const flat = Math.abs(delta) < Math.pow(10, -this.digits) / 2;
        const hours = Math.round((s.data[s.data.length - 1][0] - s.data[0][0]) / 3600_000);
        return html`<span class="lg">
          <i style="background:${s.color}"></i>
          ${s.label ? html`<b>${s.label}</b>` : nothing}
          <span>${fmt(Math.min(...vals), this.digits)}–${fmt(Math.max(...vals), this.digits)}${unit}</span>
          ${
            this.trend
              ? html` <span class="delta ${flat ? "" : delta > 0 ? "up" : "down"}"
                  >${flat ? "=" : delta > 0 ? "▲ +" : "▼ −"}${flat ? "" : fmt(Math.abs(delta), this.digits)}${flat ? " estable" : unit}
                  ${hours ? `en ${hours} h` : ""}</span
                >`
              : nothing
          }
        </span>`;
      })}
    </div>`;
  }

  static styles = css`
    :host {
      display: block;
      width: 100%;
    }
    svg {
      display: block;
      overflow: visible;
    }
    .axis {
      font-size: calc(9.5px * var(--fs-scale));
      font-family: var(--font-ui);
      opacity: 0.75;
      paint-order: stroke;
      stroke: var(--glass-strong);
      stroke-width: 3px;
    }
    .ext {
      fill: var(--glass-strong);
      stroke-width: 1.6;
    }
    .extv {
      font-size: calc(10px * var(--fs-scale));
      font-weight: 600;
      font-family: var(--font-ui);
      paint-order: stroke;
      stroke: var(--glass-strong);
      stroke-width: 3px;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 14px;
      margin-top: 6px;
      font-size: calc(11px * var(--fs-scale));
      font-family: var(--font-ui);
      color: var(--text-muted);
    }
    .lg {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      white-space: nowrap;
    }
    .lg i {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .lg b {
      color: var(--text);
      font-weight: 600;
    }
    .delta {
      color: var(--text-faint);
    }
    .delta.up,
    .delta.down {
      color: var(--text);
      font-weight: 600;
    }
    .grid {
      stroke: var(--grid-line);
      stroke-dasharray: 3 5;
    }
    .tick {
      fill: var(--text-faint);
      font-size: calc(10.5px * var(--fs-scale));
      font-family: var(--font-ui);
    }
    .val {
      font-size: calc(12px * var(--fs-scale));
      font-weight: 700;
      font-family: var(--font-ui);
    }
    .line {
      stroke-dasharray: 2000;
      stroke-dashoffset: 2000;
      animation: draw 1.6s var(--ease) forwards;
    }
    .area {
      opacity: 0;
      animation: fade 1.2s 0.4s var(--ease) forwards;
    }
    .halo {
      transform-box: fill-box;
      transform-origin: center;
      animation: breathe 2.8s ease-in-out infinite;
    }
    @keyframes draw {
      to {
        stroke-dashoffset: 0;
      }
    }
    @keyframes fade {
      to {
        opacity: 1;
      }
    }
    @keyframes breathe {
      50% {
        transform: scale(1.5);
        opacity: 0.05;
      }
    }
    .empty {
      display: grid;
      place-items: center;
      color: var(--text-faint);
      font-size: var(--fs-small);
      border: 1px dashed var(--track);
      border-radius: 14px;
    }
  `;
}

export interface Bar {
  label: string;
  values: number[];
  /** Barra destacada (hoy) */
  current?: boolean;
}

/** Barras agrupadas con esquinas redondeadas; la barra actual va rayada como "en curso". */
@customElement("fv2-bar-chart")
export class BarChart extends Sized {
  @property({ attribute: false }) bars: Bar[] = [];
  @property({ attribute: false }) colors: string[] = ["var(--amber)", "var(--sage)"];
  @property({ type: Number }) height = 110;
  @property() unit = "";
  private uidB = `b${uid++}`;

  render() {
    const W = this.w;
    const H = this.height;
    const padB = 18;
    const padT = 16;
    const n = this.bars.length;
    if (!n) return html`<div class="empty" style="height:${H}px">Sin datos todavía</div>`;
    const k = Math.max(1, ...this.bars.map((b) => b.values.length));
    const max = Math.max(0.001, ...this.bars.flatMap((b) => b.values));
    const slot = W / n;
    const gap = Math.min(4, slot * 0.06);
    const bw = Math.min(16, (slot * 0.62 - gap * (k - 1)) / k);
    const peak = this.bars.reduce((best, b, i) => (b.values[0] > this.bars[best].values[0] ? i : best), 0);
    return html`
      <svg width=${W} height=${H} viewBox="0 0 ${W} ${H}">
        <defs>
          ${this.colors.map(
            (c, i) => svg`
            <pattern id="${this.uidB}-s${i}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill=${c} opacity="0.35"/>
              <rect width="3" height="6" fill=${c}/>
            </pattern>`,
          )}
        </defs>
        ${this.bars.map((b, i) => {
          const cx = slot * i + slot / 2;
          const groupW = bw * k + gap * (k - 1);
          return svg`
            ${b.values.map((v, j) => {
              const h = Math.max(3, (v / max) * (H - padB - padT));
              const x = cx - groupW / 2 + j * (bw + gap);
              const fill = b.current ? `url(#${this.uidB}-s${j})` : this.colors[j];
              return svg`<rect x=${x} y=${H - padB - h} width=${bw} height=${h} rx=${Math.min(6, bw / 2)} fill=${fill}
                class="bar" style="animation-delay:${i * 60 + j * 30}ms; transform-origin:${x + bw / 2}px ${H - padB}px"/>`;
            })}
            ${i === peak || b.current ? svg`<text x=${cx} y=${H - padB - (b.values[0] / max) * (H - padB - padT) - 5} text-anchor="middle" class="val">${fmt(b.values[0], b.values[0] < 10 ? 1 : 0)}</text>` : nothing}
            <text x=${cx} y=${H - 3} text-anchor="middle" class="tick ${b.current ? "cur" : ""}">${b.label}</text>
          `;
        })}
      </svg>
    `;
  }

  static styles = css`
    :host {
      display: block;
      width: 100%;
    }
    svg {
      display: block;
      overflow: visible;
    }
    .bar {
      transform: scaleY(0);
      animation: grow 900ms var(--ease) forwards;
    }
    @keyframes grow {
      to {
        transform: scaleY(1);
      }
    }
    .tick {
      fill: var(--text-faint);
      font-size: calc(10.5px * var(--fs-scale));
      font-family: var(--font-ui);
    }
    .tick.cur {
      fill: var(--text);
      font-weight: 700;
    }
    .val {
      fill: var(--text-muted);
      font-size: calc(10.5px * var(--fs-scale));
      font-weight: 700;
      font-family: var(--font-ui);
    }
    .empty {
      display: grid;
      place-items: center;
      color: var(--text-faint);
      font-size: var(--fs-small);
      border: 1px dashed var(--track);
      border-radius: 14px;
    }
  `;
}

/** Anillo de progreso con contenido centrado (slot). */
@customElement("fv2-ring")
export class Ring extends LitElement {
  @property({ type: Number }) value = 0;
  @property({ type: Number }) size = 120;
  @property({ type: Number }) stroke = 10;
  @property() color = "var(--sage)";
  /** Arco abierto por abajo (como un termostato) */
  @property({ type: Boolean }) gauge = false;

  render() {
    const r = (this.size - this.stroke) / 2;
    const c = 2 * Math.PI * r;
    const span = this.gauge ? 0.75 : 1;
    const v = Math.max(0, Math.min(100, this.value)) / 100;
    const rot = this.gauge ? 135 : -90;
    return html`
      <svg width=${this.size} height=${this.size} viewBox="0 0 ${this.size} ${this.size}">
        <g transform="rotate(${rot} ${this.size / 2} ${this.size / 2})">
          <circle
            cx=${this.size / 2}
            cy=${this.size / 2}
            r=${r}
            class="track"
            stroke-width=${this.stroke}
            stroke-dasharray="${c * span} ${c}"
          />
          <circle
            cx=${this.size / 2}
            cy=${this.size / 2}
            r=${r}
            class="arc"
            stroke=${this.color}
            stroke-width=${this.stroke}
            stroke-dasharray="${c * span * v} ${c}"
          />
        </g>
      </svg>
      <div class="center"><slot></slot></div>
    `;
  }

  static styles = css`
    :host {
      position: relative;
      display: inline-grid;
      place-items: center;
    }
    svg {
      display: block;
    }
    circle {
      fill: none;
      stroke-linecap: round;
    }
    .track {
      stroke: var(--track);
    }
    .arc {
      transition: stroke-dasharray 1.2s var(--ease);
    }
    .center {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      text-align: center;
    }
  `;
}

export interface TimelineRow {
  label: string;
  spans: Span[];
  color?: string;
  /** Estados que cuentan como "activo" */
  active?: string[];
}

/** Línea de actividad de hoy: cuándo ha estado encendida cada luz/abierta cada persiana. */
@customElement("fv2-timeline")
export class Timeline extends Sized {
  @property({ attribute: false }) rows: TimelineRow[] = [];
  @property({ type: Number }) from = 0;
  @property({ type: Number }) to = 0;

  render() {
    const W = this.w;
    const labelW = Math.min(110, W * 0.32);
    const rowH = 22;
    const H = this.rows.length * rowH + 18;
    const from = this.from;
    const to = Math.max(this.to, from + 1);
    const x = (t: number) => labelW + ((Math.min(to, Math.max(from, t)) - from) / (to - from)) * (W - labelW);
    const hours: number[] = [];
    // Marcas cada 6 h (0, 6, 12, 18) dentro del intervalo, aunque no empiece a medianoche
    const first = new Date(from);
    first.setHours(Math.ceil(first.getHours() / 6) * 6, 0, 0, 0);
    if (first.getTime() < from) first.setHours(first.getHours() + 6);
    for (let t = first.getTime(); t <= to; t += 6 * 3600_000) hours.push(t);
    return html`
      <svg width=${W} height=${H} viewBox="0 0 ${W} ${H}">
        ${hours.map(
          (t) => svg`
          <line x1=${x(t)} x2=${x(t)} y1="0" y2=${H - 16} class="grid"/>
          <text x=${x(t)} y=${H - 3} text-anchor="middle" class="tick">${new Date(t).getHours()}h</text>`,
        )}
        ${this.rows.map((row, i) => {
          const y = i * rowH;
          const active = row.active ?? ["on", "open", "playing", "cleaning", "heat", "cool"];
          return svg`
            <text x="0" y=${y + 15} class="label">${row.label}</text>
            <rect x=${labelW} y=${y + 7} width=${W - labelW} height="8" rx="4" class="track"/>
            ${row.spans
              .filter((s) => active.includes(s.state) && s.to > from)
              .map(
                (s, j) =>
                  svg`<rect x=${x(s.from)} y=${y + 5} width=${Math.max(3, x(s.to) - x(s.from))} height="12" rx="6"
                    fill=${row.color ?? "var(--amber)"} class="span" style="animation-delay:${i * 80 + j * 20}ms"/>`,
              )}
          `;
        })}
        <line x1=${x(Date.now())} x2=${x(Date.now())} y1="0" y2=${H - 16} class="now" />
      </svg>
    `;
  }

  static styles = css`
    :host {
      display: block;
      width: 100%;
    }
    svg {
      display: block;
      overflow: visible;
    }
    .label {
      fill: var(--text-muted);
      font-size: calc(11.5px * var(--fs-scale));
      font-weight: 600;
      font-family: var(--font-ui);
    }
    .tick {
      fill: var(--text-faint);
      font-size: calc(10px * var(--fs-scale));
      font-family: var(--font-ui);
    }
    .grid {
      stroke: var(--grid-line);
    }
    .track {
      fill: var(--track);
      opacity: 0.6;
    }
    .now {
      stroke: var(--terracotta);
      stroke-width: 1.5;
      stroke-dasharray: 2 3;
    }
    .span {
      opacity: 0;
      animation: fade 700ms var(--ease) forwards;
    }
    @keyframes fade {
      to {
        opacity: 0.9;
      }
    }
  `;
}

/**
 * Flujo de energía: placas, batería y red hacia la casa, con puntos que se mueven
 * en el sentido real de la energía y a una velocidad que depende de la potencia.
 */
@customElement("fv2-energy-flow")
export class EnergyFlow extends Sized {
  /** kW */
  @property({ type: Number }) pv = 0;
  /** kW, positivo = cargando */
  @property({ type: Number }) battery = 0;
  /** kW, positivo = vertiendo a la red (así lo reporta el sensor de Sigenergy), negativo = importando */
  @property({ type: Number }) grid = 0;
  @property({ type: Number }) load = 0;
  @property({ type: Number }) soc = 0;

  render() {
    const W = this.w;
    const H = 190;
    const node = (x: number, y: number) => ({ x, y });
    const home = node(W / 2, H / 2);
    const sun = node(W * 0.16, 36);
    const bat = node(W * 0.16, H - 36);
    const grid = node(W * 0.84, H / 2);
    const link = (
      a: { x: number; y: number },
      b: { x: number; y: number },
      kw: number,
      color: string,
      reverse: boolean,
    ) => {
      const active = Math.abs(kw) > 0.02;
      const d = `M${a.x},${a.y} C${(a.x + b.x) / 2},${a.y} ${(a.x + b.x) / 2},${b.y} ${b.x},${b.y}`;
      const dur = Math.max(0.8, 4 - Math.abs(kw) * 0.6);
      return svg`
        <path d=${d} class="wire"/>
        ${
          active
            ? svg`<path d=${d} class="flow ${reverse ? "rev" : ""}" stroke=${color} style="animation-duration:${dur}s"/>`
            : nothing
        }`;
    };
    const circle = (
      n: { x: number; y: number },
      path: string,
      color: string,
      label: string,
      value: string,
      r = 26,
    ) => svg`
      <g transform="translate(${n.x} ${n.y})">
        <circle r=${r + 6} fill=${color} opacity="0.14"/>
        <circle r=${r} class="node" stroke=${color}/>
        <svg x="-11" y="-11" width="22" height="22" viewBox="0 0 24 24" fill=${color}>${svgIcon(path)}</svg>
        <text y=${r + 18} text-anchor="middle" class="lbl">${label}</text>
        <text y=${r + 33} text-anchor="middle" class="v">${value}</text>
      </g>`;
    return html`
      <svg width=${W} height=${H + 40} viewBox="0 -4 ${W} ${H + 40}">
        ${link(sun, home, this.pv, "var(--amber)", false)}
        ${link(bat, home, this.battery, "var(--sage)", this.battery > 0)}
        ${link(grid, home, this.grid, "var(--lilac)", this.grid > 0)}
        ${circle(sun, mdiSolarPower, "var(--amber)", "Solar", `${fmt(this.pv, 2)} kW`)}
        ${svg`
          <g transform="translate(${bat.x} ${bat.y})">
            <circle r="32" fill="var(--sage)" opacity="0.14"/>
            <circle r="26" class="node" stroke="var(--sage)"/>
            <rect x="-9" y="-13" width="18" height="26" rx="4" class="batt"/>
            <rect x="-6" y=${10 - 20 * (this.soc / 100)} width="12" height=${20 * (this.soc / 100)} rx="2" fill="var(--sage)"/>
            <rect x="-4" y="-16" width="8" height="3" rx="1" class="batt-cap"/>
            <text y="44" text-anchor="middle" class="lbl">Batería ${Math.round(this.soc)} %</text>
            <text y="59" text-anchor="middle" class="v">${this.battery > 0.02 ? "▲ " : this.battery < -0.02 ? "▼ " : ""}${fmt(Math.abs(this.battery), 2)} kW</text>
          </g>`}
        ${circle(grid, mdiTransmissionTower, "var(--lilac)", this.grid > 0.02 ? "Vertiendo" : "Red", `${fmt(Math.abs(this.grid), 2)} kW`)}
        ${circle(home, mdiHomeOutline, "var(--terracotta)", "Casa", `${fmt(this.load, 2)} kW`, 34)}
      </svg>
    `;
  }

  static styles = css`
    :host {
      display: block;
      width: 100%;
    }
    svg {
      display: block;
      overflow: visible;
    }
    .wire {
      fill: none;
      stroke: var(--track);
      stroke-width: 3;
    }
    .flow {
      fill: none;
      stroke-width: 3.5;
      stroke-linecap: round;
      stroke-dasharray: 2 16;
      animation: flow linear infinite;
    }
    .flow.rev {
      animation-direction: reverse;
    }
    @keyframes flow {
      to {
        stroke-dashoffset: -72;
      }
    }
    .node {
      fill: var(--glass-strong);
      stroke-width: 2;
    }
    .batt {
      fill: none;
      stroke: var(--sage);
      stroke-width: 2;
    }
    .batt-cap {
      fill: var(--sage);
    }
    .lbl {
      fill: var(--text-muted);
      font-size: calc(11px * var(--fs-scale));
      font-weight: 600;
      font-family: var(--font-ui);
    }
    .v {
      fill: var(--text);
      font-size: calc(13px * var(--fs-scale));
      font-weight: 700;
      font-family: var(--font-ui);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "fv2-area-chart": AreaChart;
    "fv2-bar-chart": BarChart;
    "fv2-ring": Ring;
    "fv2-timeline": Timeline;
    "fv2-energy-flow": EnergyFlow;
  }
}
