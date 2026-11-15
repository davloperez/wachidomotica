import { LitElement, css, html, nothing, unsafeCSS } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { styleMap } from "lit/directives/style-map.js";
import { mdiBrightnessAuto, mdiHomeOutline, mdiMoonWaningCrescent, mdiWhiteBalanceSunny } from "@mdi/js";

import type { DashboardConfig, HomeAssistant, ImagePoint, ThemeMode } from "./types";
import { shared, tokens } from "./styles/tokens";
import { loadThemeMode, resolveTheme, saveThemeMode } from "./lib/theme";
import { call, fmt, icon, isOn, lightColor, num, st } from "./lib/ha";
import {
  ISO_HEIGHT,
  ISO_WIDTH,
  homeBounds,
  isoCss,
  isoSvg,
  lampPoint,
  poolLayer,
  roomAnchor,
  roomBounds,
  type Box2,
} from "./house/iso";
import { ROOMS_DEF, ROOM_BY_ID, lampPos } from "./house/rooms";
import { causticUrl } from "./house/materials";

const POOL_LAYER = poolLayer();
const CAUSTICS = [causticUrl(1.6, 1, 0.035), causticUrl(1.1, 3, 0.022)];
import { lightIcon } from "./widgets/lights";
import "./views/home-view";
import "./views/room-view";
import "./widgets/lights";

interface View {
  s: number;
  tx: number;
  ty: number;
}

interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

const HOME = "home";

function fit(b: Box2, a: Area, fill: number, maxS = Infinity): View {
  const s = Math.min((a.w / b.w) * fill, (a.h / b.h) * fill, maxS);
  return { s, tx: a.x + a.w / 2 - s * (b.x + b.w / 2), ty: a.y + a.h / 2 - s * (b.y + b.h / 2) };
}

/**
 * Functional v1: panel de pared con la imagen general de la casa (interior y exterior),
 * datos de toda la vivienda a los lados y un acceso por estancia. Al entrar en una estancia
 * la imagen se acerca suavemente a ella y aparecen sus controles y gráficas.
 */
@customElement("functional-v1")
export class FunctionalDashboard extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config: DashboardConfig = { type: "custom:functional-v1" };
  @state() private themeMode: ThemeMode = "auto";
  @state() private view = HOME;
  @state() private size = { w: 1280, h: 800 };
  /** La primera medida coloca la imagen sin animación; después se activan las transiciones. */
  @state() private ready = false;
  @state() private sheet?: { entity: string; name: string };
  /** Tamaño natural de las imágenes reales (cuando se configuran) */
  @state() private natural: Record<string, [number, number]> = {};

  private ro?: ResizeObserver;
  private lastTouch = Date.now();
  private idleTimer = 0;
  private press = 0;

  setConfig(config: DashboardConfig): void {
    this.config = { title: "Villawachitos", theme: "auto", idle_return_seconds: 180, ...config };
    this.themeMode = loadThemeMode(this.config.theme ?? "auto");
  }

  getCardSize(): number {
    return 12;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (width && height) this.size = { w: Math.round(width), h: Math.round(height) };
      if (!this.ready) requestAnimationFrame(() => requestAnimationFrame(() => (this.ready = true)));
    });
    this.ro.observe(this);
    window.addEventListener("keydown", this.onKey);
    this.idleTimer = window.setInterval(() => this.checkIdle(), 5000);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.ro?.disconnect();
    window.removeEventListener("keydown", this.onKey);
    window.clearInterval(this.idleTimer);
  }

  private onKey = (e: KeyboardEvent) => {
    this.lastTouch = Date.now();
    if (e.key === "Escape") {
      if (this.sheet) this.sheet = undefined;
      else this.go(HOME);
    }
  };

  private checkIdle(): void {
    const secs = this.config.idle_return_seconds ?? 180;
    if (!secs || this.view === HOME) return;
    if (Date.now() - this.lastTouch > secs * 1000) {
      this.sheet = undefined;
      this.go(HOME);
    }
  }

  private go(view: string): void {
    this.lastTouch = Date.now();
    if (view !== HOME && !ROOM_BY_ID.has(view)) return;
    this.sheet = undefined;
    this.view = view;
  }

  protected willUpdate(): void {
    const theme = resolveTheme(this.themeMode, this.hass?.themes?.darkMode);
    if (this.getAttribute("data-theme") !== theme) this.setAttribute("data-theme", theme);
  }

  private setTheme(): void {
    const order: ThemeMode[] = ["auto", "light", "dark"];
    this.themeMode = order[(order.indexOf(this.themeMode) + 1) % order.length];
    saveThemeMode(this.themeMode);
  }

  /* ---------------------------------------------------------------- */
  /* Encuadre de la imagen                                             */
  /* ---------------------------------------------------------------- */

  private get narrow(): boolean {
    return this.size.w < 900;
  }

  /** Zona libre entre las columnas de paneles, donde se encuadra la casa o la estancia. */
  private area(room: boolean): Area {
    const { w, h } = this.size;
    if (this.narrow) return { x: 8, y: room ? 90 : 8, w: w - 16, h: h * 0.42 - (room ? 90 : 16) };
    const col = Math.min(400, Math.max(290, w * 0.23));
    const gut = Math.min(28, Math.max(16, w * 0.015));
    const side = col + gut * 2;
    const top = room ? 110 : 24;
    const bottom = 96;
    return { x: side, y: top, w: w - side * 2, h: h - top - bottom };
  }

  private get homeImage(): string | undefined {
    return this.config.images?.home;
  }

  private roomImage(id: string): string | undefined {
    return this.config.images?.rooms?.[id];
  }

  /** Tamaño natural de una imagen real (o de la maqueta). */
  private dims(src?: string): [number, number] {
    if (!src) return [ISO_WIDTH, ISO_HEIGHT];
    return this.natural[src] ?? [1600, 1000];
  }

  /** Imagen real ajustada para cubrir toda la pantalla. */
  private cover(src: string): View {
    const [iw, ih] = this.dims(src);
    const { w, h } = this.size;
    const hh = this.narrow ? h * 0.42 : h;
    const s = Math.max(w / iw, hh / ih);
    return { s, tx: (w - iw * s) / 2, ty: (hh - ih * s) / 2 };
  }

  private hotspotPoint(id: string): [number, number] | undefined {
    if (!this.homeImage) return roomAnchor(id);
    const p: ImagePoint | undefined = this.config.images?.hotspots?.[id];
    if (!p) return undefined;
    const [iw, ih] = this.dims(this.homeImage);
    return [(p[0] / 100) * iw, (p[1] / 100) * ih];
  }

  private baseView(): View {
    const room = this.view !== HOME;
    if (!this.homeImage) {
      const home = fit(homeBounds(), this.area(false), 0.96);
      if (!room) return home;
      return fit(roomBounds(this.view), this.area(true), 0.8, home.s * 2.6);
    }
    const home = this.cover(this.homeImage);
    if (!room) return home;
    const p = this.hotspotPoint(this.view);
    if (!p) return home;
    const a = this.area(true);
    const s = home.s * 2.2;
    return { s, tx: a.x + a.w / 2 - s * p[0], ty: a.y + a.h / 2 - s * p[1] };
  }

  private toScreen(v: View, [x, y]: [number, number]): [number, number] {
    return [v.tx + v.s * x, v.ty + v.s * y];
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  render() {
    const room = this.view !== HOME ? ROOM_BY_ID.get(this.view) : undefined;
    const base = this.baseView();
    const roomImg = room ? this.roomImage(room.id) : undefined;
    const glow = this.glowVars();

    return html`
      <div
        class="stage ${room ? "in-room" : ""} ${roomImg ? "has-room-img" : ""} ${this.ready ? "ready" : ""}"
        @pointerdown=${() => (this.lastTouch = Date.now())}
      >
        <div class="sky" aria-hidden="true">
          <i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i>
        </div>
        <div
          class="world"
          style=${styleMap({ transform: `translate(${base.tx}px, ${base.ty}px) scale(${base.s})`, ...glow })}
        >
          ${
            this.homeImage
              ? html`<img
                  src=${this.homeImage}
                  alt=""
                  @load=${(e: Event) => this.onImg(e, this.homeImage!)}
                />`
              : html`<svg
                  class="iso"
                  width=${ISO_WIDTH}
                  height=${ISO_HEIGHT}
                  viewBox="0 0 ${ISO_WIDTH} ${ISO_HEIGHT}"
                >
                  ${unsafeSVG(isoSvg())}
                </svg>
                <div
                  class="pool"
                  aria-hidden="true"
                  style="width:${POOL_LAYER.width}px;height:${POOL_LAYER.height}px;transform:${POOL_LAYER.matrix}"
                >
                  <i class="c1" style="background-image:${CAUSTICS[0]}"></i>
                  <i class="c2" style="background-image:${CAUSTICS[1]}"></i>
                </div>`
          }
        </div>
        ${this.renderRoomImages(room?.id)}
        <div class="vignette" aria-hidden="true"></div>
        ${this.renderHotspots(base)} ${room ? this.renderMarkers(room.id, base) : nothing}
      </div>

      ${
        room
          ? html`<fv1-room
              .hass=${this.hass}
              .config=${this.config}
              .room=${room}
              @go=${(e: CustomEvent<string>) => this.go(e.detail)}
              @open-light=${(e: CustomEvent<{ entity: string; name: string }>) => (this.sheet = e.detail)}
            ></fv1-room>`
          : html`<fv1-home
              .hass=${this.hass}
              .config=${this.config}
              @go=${(e: CustomEvent<string>) => this.go(e.detail)}
            ></fv1-home>`
      }
      ${this.renderDock()}
      ${
        this.sheet
          ? html`<fv1-light-sheet
              .hass=${this.hass}
              .entity=${this.sheet.entity}
              .name=${this.sheet.name}
              @close=${() => (this.sheet = undefined)}
            ></fv1-light-sheet>`
          : nothing
      }
      ${this.hass && !this.hass.connected ? html`<div class="offline">Sin conexión con Home Assistant…</div>` : nothing}
    `;
  }

  private onImg(e: Event, src: string): void {
    const img = e.target as HTMLImageElement;
    if (!this.natural[src]) this.natural = { ...this.natural, [src]: [img.naturalWidth, img.naturalHeight] };
  }

  /** Imágenes propias de las estancias (si se configuran): aparecen al entrar, con un leve zoom. */
  private renderRoomImages(current?: string) {
    const rooms = this.config.images?.rooms ?? {};
    return repeat(
      Object.entries(rooms),
      ([id]) => id,
      ([id, src]) => {
        const v = this.cover(src);
        return html`<img
          class="room-img ${id === current ? "show" : ""}"
          src=${src}
          alt=""
          loading="lazy"
          style="transform: translate(${v.tx}px, ${v.ty}px) scale(${v.s * (id === current ? 1 : 1.06)})"
          @load=${(e: Event) => this.onImg(e, src)}
        />`;
      },
    );
  }

  /** Opacidad del brillo de cada estancia según las luces encendidas (solo maqueta). */
  private glowVars(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const r of ROOMS_DEF) {
      const on = r.lights.filter((l) => isOn(this.hass, l.entity)).length;
      out[`--glow-${r.id}`] = on ? String(0.32 + 0.4 * (on / r.lights.length)) : "0";
    }
    out["--glow-pool"] = isOn(this.hass, "light.luz_piscina") ? "0.85" : "0";
    return out;
  }

  private renderHotspots(base: View) {
    const home = this.view === HOME;
    return html`<div class="hotspots ${home ? "" : "hidden"}">
      ${ROOMS_DEF.map((r, i) => {
        const p = this.hotspotPoint(r.id);
        if (!p) return nothing;
        const [x, y] = this.toScreen(base, p);
        const on = r.lights.filter((l) => isOn(this.hass, l.entity)).length;
        const t = num(this.hass, r.temperature);
        const motion = r.devices.some(
          (d) =>
            (d.type === "presence" && isOn(this.hass, d.occupancy)) ||
            (d.type === "cameras" && d.cameras.some((c) => isOn(this.hass, c.person))),
        );
        return html`<button
          class="spot ${on ? "lit" : ""}"
          style="transform: translate(${x}px, ${y}px); --i:${i}"
          @click=${() => this.go(r.id)}
          aria-label=${r.name}
        >
          <span class="pin">${icon(r.icon)}</span>
          <span class="label">
            <b>${r.short ?? r.name}</b>
            ${t !== undefined ? html`<span class="num">${fmt(t, 1)}°</span>` : nothing}
            ${on ? html`<span class="lights num">● ${on}</span>` : nothing}
            ${motion ? html`<span class="motion">◉</span>` : nothing}
          </span>
        </button>`;
      })}
    </div>`;
  }

  /** Luces de la estancia sobre la imagen: tocar enciende/apaga, mantener pulsado abre el detalle. */
  private renderMarkers(id: string, base: View) {
    const room = ROOM_BY_ID.get(id)!;
    const roomImg = this.roomImage(id);
    const markers = this.config.images?.markers ?? {};
    const pts = room.lights
      .map((l) => {
        let p: [number, number] | undefined;
        if (roomImg) {
          const m = markers[l.entity];
          if (m) {
            const [iw, ih] = this.dims(roomImg);
            p = this.toScreen(this.cover(roomImg), [(m[0] / 100) * iw, (m[1] / 100) * ih]);
          }
        } else if (!this.homeImage) {
          const pos = lampPos(l.entity);
          if (pos) p = this.toScreen(base, lampPoint(pos));
        }
        return p ? { l, p } : undefined;
      })
      .filter((x) => !!x);
    return html`<div class="markers">
      ${repeat(
        pts,
        ({ l }) => l.entity,
        ({ l, p }, i) => {
          const e = st(this.hass, l.entity);
          const on = e?.state === "on";
          return html`<button
            class="marker ${on ? "on" : ""}"
            style="transform: translate(${p[0]}px, ${p[1]}px); --lamp:${lightColor(e)}; --i:${i}"
            aria-label=${l.name}
            @pointerdown=${() => {
              window.clearTimeout(this.press);
              this.press = window.setTimeout(() => {
                this.press = -1;
                this.sheet = { entity: l.entity, name: l.name };
              }, 550);
            }}
            @pointerup=${() => {
              if (this.press !== -1) {
                window.clearTimeout(this.press);
                call(this.hass, "light", "toggle", { entity_id: l.entity });
              }
              this.press = 0;
            }}
            @pointerleave=${() => window.clearTimeout(this.press)}
          >
            <span class="m-dot">${icon(lightIcon(l.entity))}</span>
            <span class="m-name">${l.name}</span>
          </button>`;
        },
      )}
    </div>`;
  }

  private renderDock() {
    const themeIcon =
      this.themeMode === "auto"
        ? mdiBrightnessAuto
        : this.themeMode === "light"
          ? mdiWhiteBalanceSunny
          : mdiMoonWaningCrescent;
    return html`<nav class="dock glass scroll">
      <button class="tab ${this.view === HOME ? "on" : ""}" @click=${() => this.go(HOME)}>
        ${icon(mdiHomeOutline)}<span>Casa</span>
      </button>
      <span class="sep"></span>
      ${ROOMS_DEF.map((r) => {
        const on = r.lights.some((l) => isOn(this.hass, l.entity));
        return html`<button
          class="tab ${this.view === r.id ? "on" : ""} ${on ? "lit" : ""}"
          @click=${() => this.go(r.id)}
        >
          ${icon(r.icon)}<span>${r.short ?? r.name}</span>
        </button>`;
      })}
      <span class="sep"></span>
      <button class="tab theme" title="Tema: ${this.themeMode}" @click=${this.setTheme}>
        ${icon(themeIcon)}
      </button>
    </nav>`;
  }

  static styles = [
    tokens,
    shared,
    unsafeCSS(isoCss()),
    css`
      :host {
        --top-gap: var(--space-3);
        --dock-gap: 92px;
        display: block;
        position: relative;
        height: var(--fv1-height, 100dvh);
        overflow: hidden;
        background: var(--bg);
        color: var(--text);
        font-family: var(--font-ui);
        font-size: var(--fs-body);
        user-select: none;
        -webkit-user-select: none;
        -webkit-tap-highlight-color: transparent;
      }

      /* ----- Escena ----- */
      .stage {
        position: absolute;
        inset: 0;
        overflow: hidden;
        isolation: isolate;
      }
      .sky {
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, var(--sky-top), var(--sky-bottom) 70%);
        overflow: hidden;
      }
      .blob {
        position: absolute;
        width: 60vmax;
        height: 60vmax;
        border-radius: 50%;
        filter: blur(40px);
        opacity: 0.55;
        animation: drift 48s ease-in-out infinite alternate;
      }
      .b1 {
        left: -15vmax;
        top: -25vmax;
        background: radial-gradient(circle, var(--sage-soft), transparent 65%);
      }
      .b2 {
        right: -20vmax;
        top: -10vmax;
        background: radial-gradient(circle, var(--amber-soft), transparent 65%);
        animation-duration: 62s;
        animation-delay: -20s;
      }
      .b3 {
        left: 25vw;
        bottom: -35vmax;
        background: radial-gradient(circle, var(--terracotta-soft), transparent 65%);
        animation-duration: 70s;
      }
      @keyframes drift {
        to {
          transform: translate(8vmax, 5vmax) scale(1.12);
        }
      }
      .world {
        position: absolute;
        left: 0;
        top: 0;
        transform-origin: 0 0;
        will-change: transform;
        opacity: 0;
      }
      .ready .world {
        opacity: 1;
        transition:
          transform var(--zoom-ms) var(--ease-soft),
          opacity 1.2s ease;
      }
      .world svg,
      .world img {
        display: block;
      }
      /* Cáusticas de la piscina: capa propia animada solo con transform (no repinta la maqueta) */
      .pool {
        position: absolute;
        left: 0;
        top: 0;
        transform-origin: 0 0;
        overflow: hidden;
        pointer-events: none;
        opacity: var(--iso-caustic-op);
      }
      .pool i {
        position: absolute;
        left: 0;
        top: 0;
        width: calc(100% + 320px);
        height: calc(100% + 320px);
        background-size: 160px 160px;
        will-change: transform;
        animation: caustic-a 26s linear infinite;
      }
      .pool i.c2 {
        background-size: 110px 110px;
        opacity: 0.7;
        animation: caustic-b 19s linear infinite;
      }
      @keyframes caustic-a {
        from {
          transform: translate(-160px, -160px);
        }
        to {
          transform: translate(0, 0);
        }
      }
      @keyframes caustic-b {
        from {
          transform: translate(0, -110px);
        }
        to {
          transform: translate(-110px, 0);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .pool i {
          animation: none;
        }
      }
      .ready.has-room-img .world {
        opacity: 0;
        transition:
          transform var(--zoom-ms) var(--ease-soft),
          opacity 700ms ease 300ms;
      }
      .room-img {
        position: absolute;
        left: 0;
        top: 0;
        transform-origin: 0 0;
        opacity: 0;
        transition:
          opacity 900ms ease,
          transform 1600ms var(--ease);
        pointer-events: none;
      }
      .room-img.show {
        opacity: 1;
        transition-delay: 250ms;
      }
      .vignette {
        position: absolute;
        inset: 0;
        pointer-events: none;
        background:
          radial-gradient(
            ellipse 60% 70% at 50% 52%,
            transparent 45%,
            color-mix(in srgb, var(--bg) 70%, transparent) 100%
          ),
          linear-gradient(
            90deg,
            color-mix(in srgb, var(--bg) 35%, transparent),
            transparent 30%,
            transparent 70%,
            color-mix(in srgb, var(--bg) 35%, transparent)
          );
        opacity: 0.35;
        transition: opacity 1s ease;
      }
      .in-room .vignette {
        opacity: 1;
      }

      /* ----- Accesos a las estancias ----- */
      .hotspots,
      .markers {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }
      .hotspots.hidden .spot {
        opacity: 0;
        pointer-events: none;
        transition:
          transform var(--zoom-ms) var(--ease-soft),
          opacity 300ms ease;
      }
      .spot {
        position: absolute;
        left: 0;
        top: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 5px;
        pointer-events: auto;
        transition:
          transform var(--zoom-ms) var(--ease-soft),
          opacity 500ms ease 500ms;
        animation: pop 700ms var(--ease) both;
        animation-delay: calc(var(--i) * 45ms + 400ms);
        /* el punto queda sobre la estancia; la etiqueta, encima */
        translate: -50% calc(-100% + 17px);
      }
      @keyframes pop {
        from {
          opacity: 0;
          scale: 0.7;
        }
      }
      .spot .label {
        order: -1;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 11px;
        border-radius: 999px;
        background: var(--glass-strong);
        border: 1px solid var(--glass-border);
        box-shadow: var(--glass-shadow);
        backdrop-filter: blur(10px);
        font-size: var(--fs-label);
        white-space: nowrap;
        color: var(--text-muted);
        transition: transform 300ms var(--ease);
      }
      .spot .label b {
        color: var(--text);
        font-weight: 700;
      }
      .spot .lights {
        color: var(--amber);
        font-weight: 700;
      }
      .spot .motion {
        color: var(--sage);
      }
      .spot .pin {
        position: relative;
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        background: var(--glass-strong);
        border: 2px solid var(--glass-border);
        color: var(--text-muted);
        box-shadow: 0 6px 16px -6px rgba(0, 0, 0, 0.35);
        font-size: 13px;
      }
      .spot .pin::after {
        content: "";
        position: absolute;
        inset: -2px;
        border-radius: 50%;
        --ripple: color-mix(in srgb, var(--sage) 50%, transparent);
        animation: ripple 3.2s ease-out infinite;
        animation-delay: calc(var(--i) * 230ms);
      }
      .spot.lit .pin {
        background: var(--amber);
        color: #fff;
      }
      .spot.lit .pin::after {
        --ripple: color-mix(in srgb, var(--amber) 60%, transparent);
      }
      .spot:active .label {
        transform: scale(0.95);
      }

      /* ----- Luces de la estancia sobre la imagen ----- */
      .marker {
        position: absolute;
        left: 0;
        top: 0;
        translate: -50% -50%;
        display: grid;
        justify-items: center;
        gap: 4px;
        pointer-events: auto;
        transition: transform var(--zoom-ms) var(--ease-soft);
        animation: pop 600ms var(--ease) both;
        animation-delay: calc(var(--i) * 70ms + 700ms);
      }
      .m-dot {
        position: relative;
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--glass-strong);
        color: var(--text-faint);
        border: 1px solid var(--glass-border);
        box-shadow: 0 6px 18px -8px rgba(0, 0, 0, 0.4);
        transition:
          background 400ms,
          color 400ms,
          box-shadow 400ms;
      }
      .marker.on .m-dot {
        color: #fff;
        background: var(--lamp);
        box-shadow:
          0 0 0 4px color-mix(in srgb, var(--lamp) 30%, transparent),
          0 0 46px 10px color-mix(in srgb, var(--lamp) 55%, transparent);
      }
      .marker.on .m-dot::after {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: 50%;
        --ripple: color-mix(in srgb, var(--lamp) 60%, transparent);
        animation: ripple 2.4s ease-out infinite;
      }
      .m-name {
        font-size: 11px;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 999px;
        background: var(--glass);
        color: var(--text-muted);
        backdrop-filter: blur(8px);
        white-space: nowrap;
      }

      /* ----- Barra inferior ----- */
      .dock {
        position: absolute;
        left: 50%;
        bottom: var(--space-3);
        transform: translateX(-50%);
        z-index: 5;
        max-width: calc(100% - 32px);
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px;
        border-radius: 999px;
        overflow-x: auto;
        animation: dock-in 900ms var(--ease) both 200ms;
      }
      @keyframes dock-in {
        from {
          opacity: 0;
          transform: translate(-50%, 30px);
        }
      }
      .tab {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 10px 14px;
        border-radius: 999px;
        font-size: var(--fs-small);
        font-weight: 600;
        color: var(--text-muted);
        white-space: nowrap;
        transition:
          background 400ms var(--ease),
          color 300ms;
      }
      .tab.on {
        background: var(--text);
        color: var(--bg);
      }
      .tab.lit::after {
        content: "";
        position: absolute;
        top: 7px;
        right: 8px;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--amber);
        box-shadow: 0 0 8px var(--amber);
      }
      .tab.theme {
        padding: 10px 12px;
      }
      .sep {
        width: 1px;
        height: 24px;
        background: var(--track);
        flex: none;
      }
      @media (max-width: 1500px) {
        .tab:not(.on) span {
          display: none;
        }
      }

      .offline {
        position: absolute;
        top: 12px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 30;
        padding: 8px 16px;
        border-radius: 999px;
        background: var(--danger);
        color: #fff;
        font-size: var(--fs-small);
        font-weight: 600;
      }

      /* ----- Pantallas estrechas: imagen arriba y paneles debajo ----- */
      @media (max-width: 900px) {
        :host {
          overflow-y: auto;
        }
        .stage {
          position: relative;
          height: 42vh;
        }
        .dock {
          position: fixed;
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "functional-v1": FunctionalDashboard;
  }
}
