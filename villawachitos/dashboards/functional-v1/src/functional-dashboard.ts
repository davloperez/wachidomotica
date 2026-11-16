import { LitElement, css, html, nothing, unsafeCSS, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { styleMap } from "lit/directives/style-map.js";
import {
  mdiGarageOpenVariant,
  mdiGarageVariant,
  mdiBrightnessAuto,
  mdiHomeOutline,
  mdiMoonWaningCrescent,
  mdiWhiteBalanceSunny,
} from "@mdi/js";

import type { DashboardConfig, HomeAssistant, ImagePoint, ThemeMode } from "./types";
import { shared, tokens } from "./styles/tokens";
import { loadThemeMode, resolveTheme, saveThemeMode } from "./lib/theme";
import { call, fmt, icon, isOn, lightColor, num, relTime, st } from "./lib/ha";
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
import { ROOMS_DEF, ROOM_BY_ID, deviceSpot, lampPos, type RoomDef } from "./house/rooms";
import type { RoomView } from "./views/room-view";
import type { LayerView } from "./views/layer-view";
import { LAYERS, itemActive, itemAlert, layerItems, rowState, type LayerId, type LayerItem } from "./house/layers";
import { DEVICE_ICONS, deviceBrief } from "./widgets/devices";
import { causticUrl } from "./house/materials";
import { lightIcon } from "./widgets/lights";
import { BASE_VIEW, CUT3D, CalmScene, Vector2, Vector3, type ViewAngle } from "./scene3d/calm-scene";
import { FOOTPRINT, GATES, PLOT, POOL, POOL_DECK, type Rect } from "../../house-3d-v1/src/scene/plan";
import "./views/home-view";
import "./views/room-view";
import "./views/layer-view";
import "./widgets/lights";
import "./widgets/solar-sheet";
import "./widgets/pump-sheet";

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
const POOL_LAYER = poolLayer();
const CAUSTICS = [causticUrl(1.6, 1, 0.035), causticUrl(1.1, 3, 0.022)];
const DEFAULT_LOCATION = { latitude: 38.0506, longitude: -1.2114 };
const ZOOM_MS = 1400;
/** Texturas: en desarrollo las sirve Vite desde `public/`; en HA van junto al bundle. */
const TEXTURES = import.meta.env.DEV
  ? "/textures/"
  : new URL(/* @vite-ignore */ "textures/", import.meta.url).href;

type Box3 = [Vector3, Vector3];
const boxOf = (rects: Rect[], y1 = CUT3D): Box3 => [
  new Vector3(Math.min(...rects.map((r) => r[0])), 0, Math.min(...rects.map((r) => r[1]))),
  new Vector3(Math.max(...rects.map((r) => r[2])), y1, Math.max(...rects.map((r) => r[3]))),
];
const HOME_BOX = boxOf([...FOOTPRINT, POOL_DECK]);
/** Suma de los bordes norte y sur de la casa (sin la piscina), para hallar su centro */
const FOOT_Z = Math.min(...FOOTPRINT.map((r) => r[1])) + Math.max(...FOOTPRINT.map((r) => r[3]));
/** El exterior se ve entero (calle, jardín norte, porche y piscina), casi al mismo zoom que la casa */
const EXTERIOR_BOX = boxOf(
  [
    [
      Math.min(...PLOT.map((p) => p[0])),
      Math.min(...PLOT.map((p) => p[1])),
      Math.max(...PLOT.map((p) => p[0])),
      Math.max(...PLOT.map((p) => p[1])),
    ],
  ],
  0.5,
);
/** Vista del exterior: desde el suroeste y más baja, para diferenciarla de la general */
const EXTERIOR_VIEW: ViewAngle = { yaw: BASE_VIEW.yaw - (12 * Math.PI) / 180, elev: (36 * Math.PI) / 180 };
/** Puntos que la cámara debe ver de una estancia: una rejilla de su suelo y sus dispositivos. */
function roomPoints(room: RoomDef): Vector3[] {
  const pts: Vector3[] = [];
  for (const [x1, z1, x2, z2] of room.rects)
    for (const fx of [0.2, 0.5, 0.8])
      for (const fz of [0.2, 0.5, 0.8]) pts.push(new Vector3(x1 + (x2 - x1) * fx, 0.35, z1 + (z2 - z1) * fz));
  // Los dispositivos cuentan doble: que se vean importa más que un trozo de suelo
  for (const d of room.devices) {
    const p = deviceSpot(d);
    if (p)
      pts.push(new Vector3(p[0], Math.min(p[1], 0.9), p[2]), new Vector3(p[0], Math.min(p[1], 0.9), p[2]));
  }
  return pts;
}
const EXTERIOR_ROOM = ROOMS_DEF.find((r) => r.rects.length === 0);
const area3 = ([x1, z1, x2, z2]: Rect) => Math.abs((x2 - x1) * (z2 - z1));

/** Punto de cada acceso en la maqueta 3D (centro de su estancia más grande, o la piscina). */
function anchor3(id: string): Vector3 {
  const room = ROOM_BY_ID.get(id);
  if (!room || room.rects.length === 0) {
    const [x1, z1, x2, z2] = POOL.rect;
    return new Vector3((x1 + x2) / 2, 0.2, (z1 + z2) / 2);
  }
  if (room.anchor) return new Vector3(room.anchor[0], 0.6, room.anchor[1]);
  const [x1, z1, x2, z2] = [...room.rects].sort((a, b) => area3(b) - area3(a))[0];
  return new Vector3((x1 + x2) / 2, 0.6, (z1 + z2) / 2);
}

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
  @state() private solarOpen = false;
  @state() private pumpOpen = false;
  /** Capa activa (todos los dispositivos de un tipo en la vista general) */
  @state() private layer?: LayerId;
  private layerCache = new Map<LayerId, LayerItem[]>();
  /** Tamaño natural de las imágenes reales (cuando se configuran) */
  @state() private natural: Record<string, [number, number]> = {};

  /** La maqueta 3D (si el navegador no tiene WebGL se usa el dibujo isométrico) */
  @state() private no3d = false;
  private scene?: CalmScene;
  private homeDistance = 0;

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
    this.scene?.dispose();
    this.scene = undefined;
  }

  private onKey = (e: KeyboardEvent) => {
    this.lastTouch = Date.now();
    if (e.key === "Escape") {
      if (this.sheet) this.sheet = undefined;
      else if (this.layer) this.layer = undefined;
      else this.go(HOME);
    }
  };

  private checkIdle(): void {
    const secs = this.config.idle_return_seconds ?? 180;
    if (!secs || (this.view === HOME && !this.layer)) return;
    if (Date.now() - this.lastTouch > secs * 1000) {
      this.go(HOME);
    }
  }

  private go(view: string): void {
    this.lastTouch = Date.now();
    if (view !== HOME && !ROOM_BY_ID.has(view)) return;
    this.sheet = undefined;
    this.solarOpen = false;
    this.pumpOpen = false;
    this.layer = undefined;
    this.view = view;
  }

  /** Elige una capa (vuelve a la vista general); tocar la capa activa la cierra. */
  private setLayer(id?: LayerId): void {
    this.lastTouch = Date.now();
    this.sheet = undefined;
    this.solarOpen = false;
    this.pumpOpen = false;
    this.view = HOME;
    this.layer = id === this.layer ? undefined : id;
  }

  private items(id: LayerId): LayerItem[] {
    let its = this.layerCache.get(id);
    if (!its) this.layerCache.set(id, (its = layerItems(id)));
    return its;
  }

  protected willUpdate(): void {
    const theme = resolveTheme(this.themeMode, this.hass?.themes?.darkMode);
    if (this.getAttribute("data-theme") !== theme) this.setAttribute("data-theme", theme);
  }

  private get use3d(): boolean {
    return !this.homeImage && !this.no3d;
  }

  protected updated(changed: PropertyValues): void {
    if (!this.use3d) return;
    const theme = this.getAttribute("data-theme") === "dark" ? "dark" : "light";
    if (!this.scene) {
      const el = this.renderRoot.querySelector<HTMLElement>(".three");
      if (!el) return;
      try {
        this.scene = new CalmScene(el, {
          latitude: this.config.latitude ?? DEFAULT_LOCATION.latitude,
          longitude: this.config.longitude ?? DEFAULT_LOCATION.longitude,
          textures: TEXTURES,
        });
      } catch (err) {
        console.warn("[functional-v1] Sin WebGL, se usa el dibujo isométrico", err);
        this.no3d = true;
        return;
      }
      this.scene.onCamera = () => this.placePins();
      this.scene.setTheme(theme);
      if (this.hass) this.scene.update(this.hass, this.config.weather);
      this.frame3d(false);
      return;
    }
    if (theme !== this.scene.currentTheme) this.scene.setTheme(theme);
    if (changed.has("hass") && this.hass) this.scene.update(this.hass, this.config.weather);
    if (changed.has("view") || changed.has("size") || changed.has("layer"))
      this.frame3d((changed.has("view") || changed.has("layer")) && this.ready);
    // Los accesos recién pintados necesitan su posición
    this.placePins();
  }

  /** Mejor ángulo de cada estancia (se calcula una vez por estancia y forma de pantalla). */
  private bestViews = new Map<string, ViewAngle>();

  /** Mueve la cámara a la vista general o a la estancia actual. */
  private frame3d(animate: boolean): void {
    const scene = this.scene;
    if (!scene) return;
    const ms = animate ? ZOOM_MS : 0;
    this.homeDistance = scene.distanceFor(HOME_BOX, this.area(false), 0.96);
    scene.setDrift(this.view === HOME);
    // Capa: la casa y todos sus dispositivos (las cámaras y luces del jardín amplían el encuadre)
    if (this.view === HOME && this.layer) {
      const pts = this.items(this.layer).flatMap((it) => (it.pos ? [it.pos] : []));
      const box: Box3 = [HOME_BOX[0].clone(), HOME_BOX[1].clone()];
      for (const [x, , z] of pts) {
        box[0].x = Math.min(box[0].x, x - 0.6);
        box[0].z = Math.min(box[0].z, z - 0.6);
        box[1].x = Math.max(box[1].x, x + 0.6);
        box[1].z = Math.max(box[1].z, z + 0.6);
      }
      return scene.frame(box, this.area(false), { fill: 0.92, ms });
    }
    // La vista general deja algo de margen para el balanceo lento
    if (this.view === HOME) return scene.frame(HOME_BOX, this.area(false), { fill: 0.92, ms });
    const room = ROOM_BY_ID.get(this.view);
    if (!room || !room.rects.length)
      // Toda la parcela entre los paneles (nada queda tapado), con el menor alejamiento posible
      return scene.frame(
        EXTERIOR_BOX,
        { ...this.area(true), y: this.narrow ? this.area(true).y : 80 },
        {
          fill: 1,
          ms: ms && ms * 1.6,
          view: EXTERIOR_VIEW,
        },
      );
    const box = boxOf(room.rects);
    const area = this.area(true);
    const key = `${room.id}|${Math.round((area.w / area.h) * 8)}`;
    let view = this.bestViews.get(key);
    if (!view)
      this.bestViews.set(
        key,
        (view = scene.bestView(box, roomPoints(room), area, {
          minDistance: this.homeDistance / 2.8,
          // De la casa hacia la estancia, en el plano (x, z)
          outward: new Vector2(
            (box[0].x + box[1].x - HOME_BOX[0].x - HOME_BOX[1].x) / 2,
            (box[0].z + box[1].z - FOOT_Z) / 2,
          ),
        })),
      );
    scene.frame(box, area, { fill: 0.82, ms: ms && ms * 1.3, minDistance: this.homeDistance / 2.8, view });
  }

  /** Coloca los accesos y las luces sobre la maqueta 3D (cada fotograma mientras se mueve la cámara). */
  private placePins(): void {
    const scene = this.scene;
    if (!scene) return;
    for (const el of this.renderRoot.querySelectorAll<HTMLElement>("[data-anchor]")) {
      const [kind, id] = el.dataset.anchor!.split("|");
      let p: Vector3 | undefined;
      if (kind === "room") p = anchor3(id);
      else if (kind === "gate") {
        const gs = GATES.filter((x) => id.split(",").includes(x.entity));
        if (gs.length) {
          const xs = gs.flatMap((g) => [g.from[0], g.to[0]]);
          const zs = gs.flatMap((g) => [g.from[1], g.to[1]]);
          const mid = (v: number[]) => (Math.min(...v) + Math.max(...v)) / 2;
          p = new Vector3(mid(xs), 1.3, mid(zs) + 0.4);
        }
      } else if (kind === "pt") {
        const [x, y, z] = id.split(",").map(Number);
        p = new Vector3(x, y, z);
      } else {
        const pos = lampPos(id);
        if (pos) p = new Vector3(pos[0], Math.min(pos[1], CUT3D + 0.3), pos[2]);
      }
      const xy = p && scene.project(p);
      if (xy) el.style.transform = `translate(${xy[0].toFixed(1)}px, ${xy[1].toFixed(1)}px)`;
    }
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
    // Arriba queda el selector de capas
    const top = room ? 110 : 76;
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
        ${this.use3d ? html`<div class="three" aria-hidden="true"></div>` : nothing}
        <div
          class="world ${this.use3d ? "off" : ""}"
          style=${styleMap({ transform: `translate(${base.tx}px, ${base.ty}px) scale(${base.s})`, ...glow })}
        >
          ${
            this.use3d
              ? nothing
              : this.homeImage
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
        <div class="pins ${this.use3d ? "live" : ""}">
          ${this.renderHotspots(base)} ${room ? this.renderMarkers(room.id, base) : nothing}
          ${
            !room && this.use3d && !this.layer
              ? html`<div class="markers">${this.renderGatePins(EXTERIOR_ROOM, 0, true)}</div>`
              : nothing
          }
          ${!room && this.use3d && this.layer ? this.renderLayerMarkers(this.layer) : nothing}
        </div>
      </div>

      ${
        room
          ? html`<fv1-room
              .hass=${this.hass}
              .config=${this.config}
              .room=${room}
              @go=${(e: CustomEvent<string>) => this.go(e.detail)}
              @open-light=${(e: CustomEvent<{ entity: string; name: string }>) => (this.sheet = e.detail)}
              @open-solar=${() => (this.solarOpen = true)}
              @open-pump=${() => (this.pumpOpen = true)}
            ></fv1-room>`
          : this.layer
            ? html`<fv1-layer
                .hass=${this.hass}
                .layer=${this.layer}
                .items=${this.items(this.layer)}
                @layer=${() => this.setLayer(undefined)}
                @open-light=${(e: CustomEvent<{ entity: string; name: string }>) => (this.sheet = e.detail)}
                @open-solar=${() => (this.solarOpen = true)}
                @open-pump=${() => (this.pumpOpen = true)}
              ></fv1-layer>`
            : html`<fv1-home
                .hass=${this.hass}
                .config=${this.config}
                @go=${(e: CustomEvent<string>) => this.go(e.detail)}
              ></fv1-home>`
      }
      ${this.renderLayerBar()} ${this.renderDock()}
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
      ${
        this.solarOpen
          ? html`<fv1-solar-sheet
              .hass=${this.hass}
              @close=${() => (this.solarOpen = false)}
            ></fv1-solar-sheet>`
          : nothing
      }
      ${
        this.pumpOpen
          ? html`<fv1-pump-sheet .hass=${this.hass} @close=${() => (this.pumpOpen = false)}></fv1-pump-sheet>`
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
    const home = this.view === HOME && !this.layer;
    return html`<div class="hotspots ${home ? "" : "hidden"}">
      ${ROOMS_DEF.map((r, i) => {
        const p = this.use3d ? undefined : this.hotspotPoint(r.id);
        if (!this.use3d && !p) return nothing;
        const pos = p ? this.toScreen(base, p) : undefined;
        const on = r.lights.filter((l) => isOn(this.hass, l.entity)).length;
        const t = num(this.hass, r.temperature);
        const motion = r.devices.some(
          (d) =>
            (d.type === "presence" && isOn(this.hass, d.occupancy)) ||
            (d.type === "cameras" && d.cameras.some((c) => isOn(this.hass, c.person))),
        );
        // Lavadora terminada: la estancia lo anuncia con un distintivo hasta que se apaga o pasan 3 h
        const washerDone = r.devices.some(
          (d) => d.type === "washer" && st(this.hass, d.status)?.state === "Terminada",
        );
        return html`<button
          class="spot ${on ? "lit" : ""} ${washerDone ? "notify" : ""}"
          data-anchor=${this.use3d ? `room|${r.id}` : nothing}
          style=${styleMap({ "--i": String(i), ...(pos ? { transform: `translate(${pos[0]}px, ${pos[1]}px)` } : {}) })}
          @click=${() => this.go(r.id)}
          aria-label=${r.name}
        >
          <span class="pin">${icon(r.icon)}</span>
          <span class="label">
            <b>${r.short ?? r.name}</b>
            ${t !== undefined ? html`<span class="num">${fmt(t, 1)}°</span>` : nothing}
            ${on ? html`<span class="lights num">● ${on}</span>` : nothing}
            ${motion ? html`<span class="motion">◉</span>` : nothing}
            ${washerDone ? html`<span class="badge">${icon(DEVICE_ICONS.washer)} Lavadora lista</span>` : nothing}
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
        } else if (this.use3d) {
          p = lampPos(l.entity) ? [0, 0] : undefined;
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
            data-anchor=${this.use3d ? `lamp|${l.entity}` : nothing}
            style=${styleMap({
              "--lamp": lightColor(e),
              "--i": String(i),
              ...(this.use3d ? {} : { transform: `translate(${p[0]}px, ${p[1]}px)` }),
            })}
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
      ${this.use3d ? this.renderDevicePins(room, pts.length) : nothing}
    </div>`;
  }

  /** Dispositivos con sitio en la maqueta (frigorífico, robot, impresora): tocar lleva a su tarjeta. */
  /**
   * Puertas del garaje sobre la maqueta, cada una con su estado. En la vista general solo
   * aparecen las abiertas (como aviso); en el exterior, siempre.
   */
  private renderGatePins(room: RoomDef | undefined, offset: number, onlyOpen = false) {
    // Las dos puertas están juntas (se ven a pocos píxeles): un solo marcador con una línea por puerta
    const gates = (room?.devices.flatMap((d) => (d.type === "gates" ? d.gates : [])) ?? []).filter(
      (g) => !onlyOpen || isOn(this.hass, g.entity),
    );
    if (!gates.length) return [];
    const anyOpen = gates.some((g) => isOn(this.hass, g.entity));
    return [
      html`<button
        class="marker device gate ${anyOpen ? "open" : ""}"
        data-anchor="gate|${gates.map((g) => g.entity).join(",")}"
        style=${styleMap({ "--i": String(offset) })}
        aria-label="Puertas del garaje"
        @click=${() =>
          onlyOpen
            ? this.go(room!.id)
            : this.renderRoot.querySelector<RoomView>("fv1-room")?.focusDevice("gates")}
      >
        <span class="m-dot">${icon(anyOpen ? mdiGarageOpenVariant : mdiGarageVariant)}</span>
        <span class="m-name gates">
          ${gates.map((g) => {
            const e = st(this.hass, g.entity);
            const open = e?.state === "on";
            const state = !e || e.state === "unavailable" ? "sin sensor" : open ? "abierta" : "cerrada";
            return html`<span class=${open ? "g-open" : ""}
              >${g.name} ${state}${open && e ? ` · ${relTime(e.last_changed)}` : ""}</span
            >`;
          })}
        </span>
      </button>`,
    ];
  }

  private renderDevicePins(room: RoomDef, offset: number) {
    const devices = room.devices.filter((d) => deviceSpot(d));
    return [
      ...this.renderGatePins(room, offset + devices.length),
      ...devices.map(
        (d, i) =>
          html`<button
            class="marker device"
            data-anchor="pt|${deviceSpot(d)!.join(",")}"
            data-dev=${d.type}
            style=${styleMap({ "--i": String(offset + i) })}
            aria-label=${d.name}
            @click=${() =>
              d.type === "energy"
                ? (this.solarOpen = true)
                : d.type === "pump"
                  ? (this.pumpOpen = true)
                  : this.renderRoot.querySelector<RoomView>("fv1-room")?.focusDevice(d.type)}
          >
            <span class="m-dot">${icon(DEVICE_ICONS[d.type])}</span>
            <span class="m-name">${deviceBrief(this.hass, d)}</span>
          </button>`,
      ),
    ];
  }

  /** Selector de capas, arriba en el centro. */
  private renderLayerBar() {
    return html`<nav class="layers glass scroll" aria-label="Capas">
      ${LAYERS.map((l) => {
        const busy = this.items(l.id).some((it) => itemAlert(this.hass, it));
        return html`<button
          class="tab ${this.layer === l.id ? "on" : ""} ${busy ? "alert" : ""}"
          title=${l.name}
          aria-pressed=${this.layer === l.id}
          @click=${() => this.setLayer(l.id)}
        >
          ${icon(l.icon)}<span>${l.name}</span>
        </button>`;
      })}
    </nav>`;
  }

  /** Marcadores de todos los dispositivos de la capa sobre la maqueta. */
  private renderLayerMarkers(id: LayerId) {
    const its = this.items(id).filter((it) => it.pos);
    const h = this.hass;
    const panel = () => this.renderRoot.querySelector<LayerView>("fv1-layer");
    return html`<div class="markers layer ${its.length > 14 ? "dense" : ""}">
      ${repeat(
        its,
        (it) => it.key,
        (it, i) => {
          const on = itemActive(h, it);
          const alert = itemAlert(h, it);
          const [x, y, z] = it.pos!;
          const anchor = `pt|${x},${Math.min(y, CUT3D + 0.3)},${z}`;
          const style = { "--i": String(Math.min(i, 30)) };
          if (it.kind === "light") {
            const e = st(h, it.entity);
            return html`<button
              class="marker ${on ? "on" : ""}"
              data-anchor=${anchor}
              style=${styleMap({ ...style, "--lamp": lightColor(e) })}
              aria-label=${it.name}
              @pointerdown=${() => {
                window.clearTimeout(this.press);
                this.press = window.setTimeout(() => {
                  this.press = -1;
                  this.sheet = { entity: it.entity, name: it.name };
                }, 550);
              }}
              @pointerup=${() => {
                if (this.press !== -1) {
                  window.clearTimeout(this.press);
                  call(h, "light", "toggle", { entity_id: it.entity });
                  panel()?.focusItem(it.key);
                }
                this.press = 0;
              }}
              @pointerleave=${() => window.clearTimeout(this.press)}
            >
              <span class="m-dot">${icon(lightIcon(it.entity))}</span>
              <span class="m-name">${it.name}</span>
            </button>`;
          }
          const ico =
            it.kind === "device" ? DEVICE_ICONS[it.device.type] : it.kind === "row" ? it.icon : LAYERS[1].icon;
          const label =
            it.kind === "device"
              ? deviceBrief(h, it.device)
              : it.kind === "row"
                ? `${it.name} · ${rowState(h, it)}`
                : `${it.name} · ${fmt(st(h, it.entity)?.attributes.current_position as number, 0)} %`;
          return html`<button
            class="marker device ${on ? "active" : ""} ${alert ? "alert" : ""}"
            data-anchor=${anchor}
            style=${styleMap(style)}
            aria-label=${it.name}
            @click=${() => {
              this.lastTouch = Date.now();
              if (it.kind === "device" && it.device.type === "energy") this.solarOpen = true;
              else if (it.kind === "device" && it.device.type === "pump") this.pumpOpen = true;
              else panel()?.focusItem(it.key);
            }}
          >
            <span class="m-dot">${icon(ico)}</span>
            <span class="m-name">${label}</span>
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
      .three {
        position: absolute;
        inset: 0;
        opacity: 0;
        transition: opacity 1.4s ease;
      }
      .ready .three {
        opacity: 1;
      }
      .three canvas {
        display: block;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }
      .world.off {
        display: none;
      }
      .pins {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }
      /* Con la maqueta 3D la posición la pone cada fotograma: sin transiciones de transform */
      .pins.live .spot,
      .pins.live .marker,
      .pins.live .hotspots.hidden .spot {
        transition: opacity 400ms ease;
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
      .spot.notify .pin {
        background: var(--sage);
        color: #fff;
      }
      .spot.notify .pin::after {
        --ripple: color-mix(in srgb, var(--sage) 75%, transparent);
        animation-duration: 1.6s;
      }
      .spot .badge {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 1px 7px 1px 4px;
        border-radius: 999px;
        background: var(--sage);
        color: #fff;
        font-weight: 700;
      }
      .spot .badge svg {
        width: 13px;
        height: 13px;
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
      .marker.device .m-dot {
        border-radius: 14px;
        color: var(--text-muted);
      }
      .m-name.gates {
        display: grid;
        text-align: left;
      }
      .m-name.gates .g-open {
        color: var(--amber);
        font-weight: 700;
      }
      .marker.gate.open .m-dot {
        color: #fff;
        background: var(--amber);
        box-shadow: 0 0 0 4px var(--amber-soft);
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

      /* ----- Marcadores de una capa ----- */
      .marker.device.active .m-dot {
        color: #fff;
        background: var(--sage);
        box-shadow: 0 0 0 4px var(--sage-soft);
      }
      .marker.device.alert .m-dot {
        color: #fff;
        background: var(--amber);
        box-shadow: 0 0 0 4px var(--amber-soft);
      }
      /* Muchas luces o dispositivos: solo se rotulan los encendidos o con aviso */
      .markers.dense .marker .m-dot {
        width: 32px;
        height: 32px;
      }
      .markers.dense .marker:not(.on):not(.active):not(.alert) .m-name {
        opacity: 0;
        transition: opacity 300ms;
      }
      .markers.dense .marker:hover .m-name {
        opacity: 1;
      }

      /* ----- Selector de capas (arriba) ----- */
      .layers {
        position: absolute;
        left: 50%;
        top: var(--space-3);
        transform: translateX(-50%);
        z-index: 6;
        max-width: calc(100% - 2 * var(--col-w) - 80px);
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 5px;
        border-radius: 999px;
        overflow-x: auto;
        animation: layers-in 900ms var(--ease) both 300ms;
      }
      @keyframes layers-in {
        from {
          opacity: 0;
          transform: translate(-50%, -24px);
        }
      }
      .layers .tab {
        padding: 9px 12px;
      }
      .layers .tab:not(.on) span {
        display: none;
      }
      .tab.alert::after {
        content: "";
        position: absolute;
        top: 6px;
        right: 7px;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--amber);
        box-shadow: 0 0 8px var(--amber);
      }
      /* En una estancia, el selector se aparta del título (queda arriba en el centro, más discreto) */
      .stage.in-room ~ .layers {
        opacity: 0.85;
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
        .layers {
          max-width: calc(100% - 24px);
          top: 8px;
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
