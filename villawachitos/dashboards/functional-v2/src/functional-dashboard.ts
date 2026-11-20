import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import {
  mdiBrightnessAuto,
  mdiCogOutline,
  mdiFullscreen,
  mdiCheck,
  mdiCodeJson,
  mdiContentCopy,
  mdiPencilOutline,
  mdiCurtains,
  mdiCurtainsClosed,
  mdiRestore,
  mdiGarageOpenVariant,
  mdiGarageVariant,
  mdiHomeOutline,
  mdiMoonWaningCrescent,
  mdiWhiteBalanceSunny,
} from "@mdi/js";

import type { DashboardConfig, HomeAssistant, ThemeMode } from "./types";
import { shared, tokens } from "./styles/tokens";
import { LuxTheme, loadThemeMode, resolveTheme, saveThemeMode } from "./lib/theme";
import { fmt, icon, isOn, lightColor, num, relTime, st } from "./lib/ha";
import { ROOMS_DEF, ROOM_BY_ID, lampPos, type DeviceDef, type RoomDef } from "./house/rooms";
import {
  LAYERS,
  deviceKey,
  itemActive,
  itemAlert,
  layerItems,
  rowState,
  type LayerId,
  type LayerItem,
} from "./house/layers";
import { deviceIcon, deviceBrief } from "./widgets/devices";
import { lightIcon, toggleLight } from "./widgets/lights";
import { GATES } from "./plan/house-plan";
import { HOME_BOX, fromWorld, roomAnchor, roomBox, toWorld, unionBox, type Box } from "./plan/geometry";
import type { FloorPlan } from "./plan/floor-plan";
import { DOORBELL, PriorityWatcher, type PriorityAlert } from "./lib/priority";
import type { RoomView } from "./views/room-view";
import type { LayerView } from "./views/layer-view";
import { HOME, currentPanel } from "./lib/panels";
import "./plan/floor-plan";
import "./views/home-view";
import "./views/room-view";
import "./views/layer-view";
import "./widgets/lights";
import "./widgets/solar-sheet";
import "./widgets/alerts-sheet";
import "./widgets/pump-sheet";
import "./widgets/vacuum-sheet";
import "./widgets/priority-alert";
import "./widgets/camera-viewer";

/** El modo Editar solo existe con ratón y pantalla grande (nunca en las Shelly ni en el móvil). */
const DESKTOP_MQ = "(min-width: 900px) and (hover: hover) and (pointer: fine)";
const DRAFT_KEY = "fv2-marker-draft";
type Positions = Record<string, [number, number]>;
const round2 = (n: number) => Math.round(n * 100) / 100;
const HOLD_MS = 550;

/**
 * Separación (en metros) de marcadores que caen casi en el mismo punto del plano,
 * sin mover el dispositivo de sitio.
 */
const NUDGE: Record<string, [dx: number, dz: number]> = {
  "binary_sensor.sensor_agua_dreame_water_leak": [-0.9, 0.5],
  "vacuum:vacuum.x60_pro_master": [-0.85, -0.55],
};

/** Animación del icono de un elemento activo (todas son transform/opacity). */
function animOf(h: HomeAssistant | undefined, it: LayerItem): string {
  if (it.kind === "cover") {
    const s = st(h, it.entity)?.state;
    return s === "opening" ? "anim-up" : s === "closing" ? "anim-down" : "";
  }
  if (it.kind === "row") return itemAlert(h, it) ? "anim-shake" : "";
  if (it.kind !== "device" || !itemActive(h, it)) {
    if (it.kind === "device" && it.device.type === "lock" && isOn(h, DOORBELL.ringing)) return "anim-shake";
    return "";
  }
  const d: DeviceDef = it.device;
  switch (d.type) {
    case "washer":
    case "pump":
      return "anim-spin";
    case "switch":
      return /ventila/i.test(d.name) ? "anim-spin" : "anim-glow";
    case "dishwasher":
      return "anim-wobble";
    case "vacuum":
    case "towel":
      return "anim-bob";
    case "cameras":
      return itemAlert(h, it) ? "anim-shake" : "anim-glow";
    case "lock":
      return "anim-shake";
    case "gates":
      return "";
    default:
      return "anim-glow";
  }
}

/**
 * Functional v2: la misma casa, estancias, capas y controles que la v1, pero ligera para pantallas
 * pequeñas y verticales (Shelly Wall Display): plano 2D navegable en lugar de la maqueta 3D,
 * colores opacos (sin transparencias ni desenfoques) y animaciones baratas (solo transform/opacity).
 */
@customElement("functional-v2")
export class FunctionalDashboard extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config: DashboardConfig = { type: "custom:functional-v2" };
  @state() private themeMode: ThemeMode = "auto";
  /** Este dashboard (ver `lib/panels.ts`): vista con la que arranca y a la que vuelve por inactividad, y sensor de luz */
  private readonly panel = currentPanel();
  private readonly startView = this.panel.view;
  /** Tema «auto» según el sensor de luz del propio panel (solo paneles de pared) */
  private readonly lux = this.panel.lux ? new LuxTheme(this.panel.lux) : undefined;
  @state() private view = this.startView;
  @state() private sheet?: { entity: string; name: string };
  @state() private solarOpen = false;
  @state() private alertsOpen = false;
  @state() private cameras?: { entity: string; mode: "single" | "grid" };
  @state() private pumpOpen = false;
  @state() private vacuumOpen = false;
  /** Capa activa (todos los dispositivos de un tipo en la vista general) */
  @state() private layer?: LayerId;
  /** Refresco periódico (caducidad de las alertas prioritarias) */
  @state() private tick = 0;
  /** Pantalla de escritorio: única en la que se puede editar la posición de los iconos */
  @state() private desktop = false;
  @state() private editing = false;
  @state() private exporting = false;
  @state() private copied = false;
  /** Posiciones en edición (solo escritorio): sustituyen a las de la configuración hasta descartarlas */
  @state() private draft?: Positions;
  private mq?: MediaQueryList;
  private layerCache = new Map<LayerId, LayerItem[]>();
  private priority = new PriorityWatcher();
  private alerts: PriorityAlert[] = [];

  private lastTouch = Date.now();
  private idleTimer = 0;
  private press = 0;
  /** Cajas de encuadre memorizadas (la misma referencia evita reencuadrar en cada render) */
  private focusCache = new Map<string, Box>();
  private litCache: { key: string; set: Set<string> } = { key: "", set: new Set() };

  setConfig(config: DashboardConfig): void {
    this.config = { title: "Villawachitos", theme: "auto", idle_return_seconds: 180, ...config };
    this.themeMode = loadThemeMode(this.config.theme ?? "auto");
  }

  getCardSize(): number {
    return 12;
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("keydown", this.onKey);
    this.addEventListener("open-cameras", this.onOpenCameras as EventListener);
    window.addEventListener("resize", this.fit);
    // La cabecera de HA (modo no kiosko) tarda en colocarse: se recalcula también un poco después
    this.fitTimers = [0, 300, 1200].map((ms) => window.setTimeout(this.fit, ms));
    this.mq = window.matchMedia(DESKTOP_MQ);
    this.mq.addEventListener("change", this.onMq);
    this.onMq();
    this.idleTimer = window.setInterval(() => {
      this.checkIdle();
      if (this.alerts.length) this.tick++;
      // Un cambio de tema por luz espera a mantenerse un rato: se reevalúa aunque no llegue un `hass` nuevo
      else if (this.lux?.pending && this.themeMode === "auto") this.requestUpdate();
    }, 5000);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("keydown", this.onKey);
    this.removeEventListener("open-cameras", this.onOpenCameras as EventListener);
    window.removeEventListener("resize", this.fit);
    this.fitTimers.forEach((t) => window.clearTimeout(t));
    this.mq?.removeEventListener("change", this.onMq);
    window.clearInterval(this.idleTimer);
  }

  protected firstUpdated(): void {
    // En captura y sobre el propio plano: en modo edición los iconos se arrastran en vez de pulsarse
    const plan = this.renderRoot.querySelector("fv2-plan");
    plan?.addEventListener("pointerdown", this.onEditDown as EventListener, true);
    plan?.addEventListener("click", this.onEditClick, true);
    plan?.addEventListener("dblclick", this.onEditDouble, true);
    // Paneles que arrancan en una estancia: su pestaña de la barra inferior, a la vista
    if (this.view !== HOME) this.toTop();
  }

  private fitTimers: number[] = [];

  /** Alto disponible bajo lo que HA deje encima (su cabecera si no está en kiosko), para que no se recorte la barra inferior. */
  private fit = () => {
    const top = Math.max(0, this.getBoundingClientRect().top);
    this.style.setProperty("--fv2-height", `${Math.round(window.innerHeight - top)}px`);
  };

  private onMq = () => {
    this.desktop = !!this.mq?.matches;
    if (!this.desktop) {
      this.editing = false;
      this.exporting = false;
    } else if (!this.draft) {
      try {
        const v = localStorage.getItem(DRAFT_KEY);
        if (v) this.draft = JSON.parse(v) as Positions;
      } catch {
        /* sin almacenamiento o borrador ilegible: se ignora */
      }
    }
  };

  /* ---------------------------------------------------------------- */
  /* Edición de la posición de los iconos (solo escritorio)            */
  /* ---------------------------------------------------------------- */

  /** Posiciones vigentes: el borrador (solo escritorio) o, si no hay, las de la configuración. */
  private overrides(): Positions {
    return (this.desktop && this.draft) || this.config.marker_positions || {};
  }

  private setDraft(d?: Positions): void {
    this.draft = d;
    try {
      if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
      else localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignorar */
    }
  }

  private markerAt(e: Event): HTMLElement | undefined {
    return e
      .composedPath()
      .find(
        (n): n is HTMLElement => n instanceof HTMLElement && n.classList.contains("mk") && !!n.dataset.key,
      );
  }

  private inControls(e: Event): boolean {
    return e.composedPath().some((n) => n instanceof HTMLElement && n.classList.contains("ctl"));
  }

  private onEditDown = (e: PointerEvent) => {
    if (!this.editing || (e.pointerType === "mouse" && e.button !== 0)) return;
    const mk = this.markerAt(e);
    const plan = this.renderRoot.querySelector<FloorPlan>("fv2-plan");
    if (!mk || !plan) return;
    e.stopPropagation();
    e.preventDefault();
    // El icono sigue al puntero conservando el punto por el que se agarró
    const [gx, gy] = plan.worldPoint(e.clientX, e.clientY);
    const ox = parseFloat(mk.style.left) - gx;
    const oy = parseFloat(mk.style.top) - gy;
    mk.classList.add("dragging");
    const move = (ev: PointerEvent) => {
      const [x, y] = plan.worldPoint(ev.clientX, ev.clientY);
      mk.style.left = `${(x + ox).toFixed(1)}px`;
      mk.style.top = `${(y + oy).toFixed(1)}px`;
    };
    const end = (ev: PointerEvent, commit: boolean) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      mk.classList.remove("dragging");
      if (!commit) return;
      const [x, y] = plan.worldPoint(ev.clientX, ev.clientY);
      const [mx, mz] = fromWorld(x + ox, y + oy);
      this.setDraft({ ...this.overrides(), [mk.dataset.key!]: [round2(mx), round2(mz)] });
    };
    const up = (ev: PointerEvent) => end(ev, true);
    const cancel = (ev: PointerEvent) => end(ev, false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  };

  /** En modo edición, ningún clic llega a los iconos ni a las estancias (salvo los botones del plano). */
  private onEditClick = (e: Event) => {
    if (!this.editing || this.inControls(e)) return;
    e.stopPropagation();
    e.preventDefault();
  };

  /** Doble clic sobre un icono: vuelve a su posición original. */
  private onEditDouble = (e: Event) => {
    if (!this.editing || this.inControls(e)) return;
    e.stopPropagation();
    const mk = this.markerAt(e);
    if (!mk) return;
    const next = { ...this.overrides() };
    delete next[mk.dataset.key!];
    this.setDraft(next);
  };

  private exportJson(): string {
    const eff = this.overrides();
    const keys = Object.keys(eff).sort();
    if (!keys.length) return `"marker_positions": {}`;
    const body = keys.map((k) => `    ${JSON.stringify(k)}: [${eff[k][0]}, ${eff[k][1]}]`).join(",\n");
    return `"marker_positions": {\n${body}\n  }`;
  }

  private async copyJson(): Promise<void> {
    const text = this.exportJson();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Sin portapapeles (HA por http): se selecciona el texto y se copia a la antigua
      const ta = this.renderRoot.querySelector<HTMLTextAreaElement>(".export textarea");
      ta?.select();
      document.execCommand("copy");
    }
    this.copied = true;
    window.setTimeout(() => (this.copied = false), 2000);
  }

  private onOpenCameras = (e: CustomEvent<{ entity: string; mode?: "single" | "grid" }>) => {
    this.lastTouch = Date.now();
    this.cameras = { entity: e.detail.entity, mode: e.detail.mode ?? "single" };
  };

  private onKey = (e: KeyboardEvent) => {
    this.lastTouch = Date.now();
    if (e.key === "Escape") {
      if (this.cameras) this.cameras = undefined;
      else if (this.exporting) this.exporting = false;
      else if (this.sheet) this.sheet = undefined;
      else if (this.layer) this.layer = undefined;
      else this.go(HOME);
    }
  };

  /** Sin tocar la pantalla un rato: vuelve a la vista por defecto de este dashboard, con su encuadre. */
  private checkIdle(): void {
    const secs = this.config.idle_return_seconds ?? 180;
    if (!secs || this.editing || Date.now() - this.lastTouch <= secs * 1000) return;
    if (this.view !== this.startView || this.layer) this.go(this.startView);
    else {
      // Ya en su vista: solo se deshace el zoom o desplazamiento que se haya dejado en el plano
      this.lastTouch = Date.now();
      this.renderRoot.querySelector<FloorPlan>("fv2-plan")?.recenter();
      this.toTop();
    }
  }

  private go(view: string): void {
    this.lastTouch = Date.now();
    if (view !== HOME && !ROOM_BY_ID.has(view)) return;
    this.sheet = undefined;
    this.cameras = undefined;
    this.solarOpen = false;
    this.pumpOpen = false;
    this.vacuumOpen = false;
    this.alertsOpen = false;
    this.layer = undefined;
    if (view !== this.view) {
      this.view = view;
      this.toTop();
    }
  }

  /** Elige una capa (vuelve a la vista general); tocar la capa activa la cierra. */
  private setLayer(id?: LayerId): void {
    this.lastTouch = Date.now();
    this.sheet = undefined;
    this.solarOpen = false;
    this.pumpOpen = false;
    this.vacuumOpen = false;
    this.alertsOpen = false;
    this.view = HOME;
    this.layer = id === this.layer ? undefined : id;
    this.toTop();
  }

  /** Al cambiar de vista, el plano vuelve a quedar arriba y la pestaña de la barra, a la vista. */
  private toTop(): void {
    this.updateComplete.then(() => {
      const main = this.renderRoot.querySelector<HTMLElement>(".main");
      // Paneles estrechos (vertical) en su estancia por defecto: el plano queda replegado arriba y los
      // controles parten del borde superior. Basta deslizar hacia abajo para volver a ver el plano.
      const stacked = !window.matchMedia("(min-width: 900px) and (min-aspect-ratio: 1/1)").matches;
      const plan = this.renderRoot.querySelector<HTMLElement>(".planbox");
      const hide = stacked && this.startView !== HOME && this.view === this.startView && !this.layer;
      main?.scrollTo({ top: hide && plan ? plan.offsetHeight : 0 });
      if (hide) this.holdHidden();
      const tab = this.renderRoot.querySelector<HTMLElement>(".dock .tab.on");
      const dock = tab?.parentElement;
      if (tab && dock) dock.scrollTo({ left: tab.offsetLeft - dock.clientWidth / 2 + tab.offsetWidth / 2 });
    });
  }

  /**
   * Al arrancar, el contenido aún crece (datos, fuentes, imágenes) y el navegador recorta el scroll a la
   * altura que haya en ese momento. Se reaplica unos segundos, salvo que se toque la pantalla.
   */
  private holdHidden(): void {
    const touched = this.lastTouch;
    const apply = (): void => {
      if (this.lastTouch !== touched || this.view !== this.startView || this.layer) return;
      const main = this.renderRoot.querySelector<HTMLElement>(".main");
      const plan = this.renderRoot.querySelector<HTMLElement>(".planbox");
      if (main && plan && Math.abs(main.scrollTop - plan.offsetHeight) > 1)
        main.scrollTo({ top: plan.offsetHeight });
    };
    for (const ms of [100, 300, 700, 1500, 3000, 6000]) window.setTimeout(apply, ms);
  }

  private items(id: LayerId): LayerItem[] {
    let its = this.layerCache.get(id);
    if (!its) this.layerCache.set(id, (its = layerItems(id)));
    return its;
  }

  /** ¿Se ha salido del modo kiosko (cabecera y barra lateral de HA visibles)? Kiosk-mode lo desactiva con `?disable_km`. */
  private get kioskOff(): boolean {
    return new URLSearchParams(window.location.search).has("disable_km");
  }

  /** Alterna el modo kiosko recargando la página con o sin `?disable_km` (kiosk-mode lo lee al cargar). */
  private toggleKiosk(): void {
    const url = new URL(window.location.href);
    if (this.kioskOff) url.searchParams.delete("disable_km");
    else url.searchParams.set("disable_km", "");
    window.location.assign(url.toString().replace("disable_km=", "disable_km"));
  }

  private setTheme(): void {
    const order: ThemeMode[] = ["auto", "light", "dark"];
    this.themeMode = order[(order.indexOf(this.themeMode) + 1) % order.length];
    saveThemeMode(this.themeMode);
  }

  protected willUpdate(): void {
    const theme = resolveTheme(this.themeMode, this.hass?.themes?.darkMode, this.lux?.update(this.hass));
    if (this.getAttribute("data-theme") !== theme) this.setAttribute("data-theme", theme);
    this.alerts = this.config.priority_alerts === false ? [] : this.priority.update(this.hass);
  }

  /* ---------------------------------------------------------------- */
  /* Encuadre del plano                                                */
  /* ---------------------------------------------------------------- */

  private focusBox(): Box {
    const key = this.layer ? `layer:${this.layer}` : this.view;
    let b = this.focusCache.get(key);
    if (b) return b;
    if (this.layer) {
      const pts = this.items(this.layer).flatMap((it) => (it.pos ? [toWorld(it.pos[0], it.pos[2])] : []));
      b = unionBox([HOME_BOX, ...pts.map(([x, y]) => ({ x: x - 20, y: y - 20, w: 40, h: 40 }))]);
    } else if (this.view === HOME) b = HOME_BOX;
    else b = roomBox(ROOM_BY_ID.get(this.view)!);
    this.focusCache.set(key, b);
    return b;
  }

  /** Estancias con luces encendidas (misma referencia mientras no cambie nada). */
  private litRooms(): Set<string> {
    const ids = ROOMS_DEF.filter(
      (r) => r.rects.length && r.lights.some((l) => isOn(this.hass, l.entity)),
    ).map((r) => r.id);
    const key = ids.join(",");
    if (key !== this.litCache.key) this.litCache = { key, set: new Set(ids) };
    return this.litCache.set;
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  render() {
    void this.tick;
    const room = this.view !== HOME ? ROOM_BY_ID.get(this.view) : undefined;
    const theme = this.themeMode;
    return html`
      <div class="app" @pointerdown=${() => (this.lastTouch = Date.now())}>
        <div class="main">
          <div class="planbox ${this.editing ? "editing" : ""}">
            <fv2-plan
              .frameBox=${this.focusBox()}
              .lit=${this.litRooms()}
              .selected=${room?.rects.length ? room.id : undefined}
              ?poolLit=${isOn(this.hass, "light.jardin_sur_luz_piscina")}
              .padTop=${56}
              class=${this.layer ? "layer" : room ? "room" : "home"}
              @room-tap=${(e: CustomEvent<string>) => !this.layer && this.go(e.detail)}
              @plan-drag=${() => window.clearTimeout(this.press)}
            >
              ${this.layer ? this.layerMarkers(this.layer) : room ? this.roomMarkers(room) : this.homeMarkers()}
            </fv2-plan>
            ${this.renderLayerBar()} ${this.desktop ? this.renderEditBar() : nothing}
          </div>
          <div class="content">
            ${
              room
                ? html`<fv2-room
                    .hass=${this.hass}
                    .config=${this.config}
                    .room=${room}
                    @go=${(e: CustomEvent<string>) => this.go(e.detail)}
                    @open-light=${(e: CustomEvent<{ entity: string; name: string }>) => (this.sheet = e.detail)}
                    @open-solar=${() => (this.solarOpen = true)}
                    @open-pump=${() => (this.pumpOpen = true)}
                    @open-vacuum=${() => (this.vacuumOpen = true)}
                  ></fv2-room>`
                : this.layer
                  ? html`<fv2-layer
                      .hass=${this.hass}
                      .layer=${this.layer}
                      .items=${this.items(this.layer)}
                      @layer=${() => this.setLayer(undefined)}
                      @open-light=${(e: CustomEvent<{ entity: string; name: string }>) => (this.sheet = e.detail)}
                      @open-solar=${() => (this.solarOpen = true)}
                      @open-pump=${() => (this.pumpOpen = true)}
                      @open-vacuum=${() => (this.vacuumOpen = true)}
                    ></fv2-layer>`
                  : html`<fv2-home
                      .hass=${this.hass}
                      .config=${this.config}
                      @go=${(e: CustomEvent<string>) => this.go(e.detail)}
                      @open-alerts=${() => (this.alertsOpen = true)}
                    ></fv2-home>`
            }
          </div>
        </div>
        ${this.renderDock(theme)}
      </div>
      ${
        this.sheet
          ? html`<fv2-light-sheet
              .hass=${this.hass}
              .entity=${this.sheet.entity}
              .name=${this.sheet.name}
              @close=${() => (this.sheet = undefined)}
            ></fv2-light-sheet>`
          : nothing
      }
      ${
        this.cameras
          ? html`<fv2-camera-viewer
              .hass=${this.hass}
              .entity=${this.cameras.entity}
              .mode=${this.cameras.mode}
              .live=${this.desktop}
              @close=${() => (this.cameras = undefined)}
            ></fv2-camera-viewer>`
          : nothing
      }
      ${this.solarOpen ? html`<fv2-solar-sheet .hass=${this.hass} @close=${() => (this.solarOpen = false)}></fv2-solar-sheet>` : nothing}
      ${
        this.alertsOpen
          ? html`<fv2-alerts-sheet
              .hass=${this.hass}
              .config=${this.config}
              @go=${(e: CustomEvent<string>) => this.go(e.detail)}
              @close=${() => (this.alertsOpen = false)}
            ></fv2-alerts-sheet>`
          : nothing
      }
      ${this.pumpOpen ? html`<fv2-pump-sheet .hass=${this.hass} @close=${() => (this.pumpOpen = false)}></fv2-pump-sheet>` : nothing}
      ${this.vacuumOpen ? html`<fv2-vacuum-sheet .hass=${this.hass} @close=${() => (this.vacuumOpen = false)}></fv2-vacuum-sheet>` : nothing}
      ${
        this.alerts.length
          ? html`<fv2-priority
              .hass=${this.hass}
              .alerts=${this.alerts}
              @dismiss=${(e: CustomEvent<string>) => {
                this.priority.dismiss(e.detail);
                this.tick++;
              }}
              @go=${(e: CustomEvent<string>) => this.go(e.detail)}
            ></fv2-priority>`
          : nothing
      }
      ${this.exporting ? this.renderExport() : nothing}
      ${this.hass && !this.hass.connected ? html`<div class="offline">Sin conexión con Home Assistant…</div>` : nothing}
    `;
  }

  /* ---------------------------------------------------------------- */
  /* Marcadores sobre el plano                                         */
  /* ---------------------------------------------------------------- */

  /** Posición de un elemento en el plano (píxeles de mundo), con su separación si hace falta. */
  private at(key: string, x: number, z: number): string {
    // Posición personalizada (modo Editar / configuración) o, si no, la del plano con su separación
    const o = this.overrides()[key];
    const n = NUDGE[key];
    const [px, py] = o ? toWorld(o[0], o[1]) : toWorld(x + (n?.[0] ?? 0), z + (n?.[1] ?? 0));
    return `left:${px.toFixed(1)}px;top:${py.toFixed(1)}px`;
  }

  /** Vista general: el acceso de cada estancia y, en vivo, luces encendidas y lo que está en marcha. */
  private homeMarkers(): TemplateResult[] {
    const h = this.hass;
    const out: TemplateResult[] = [];
    // Luces encendidas: un punto que late (sin rótulo ni toque, para no estorbar)
    for (const r of ROOMS_DEF)
      for (const l of r.lights) {
        if (!isOn(h, l.entity)) continue;
        const p = lampPos(l.entity);
        if (!p) continue;
        out.push(
          html`<div
            class="mk glow"
            style="${this.at(l.entity, p[0], p[2])};--lamp:${lightColor(st(h, l.entity))}"
          >
            <i></i>
          </div>`,
        );
      }
    // Dispositivos activos, persianas moviéndose y avisos (tocar lleva a la estancia)
    const seen = new Set<string>();
    for (const layer of LAYERS)
      for (const it of this.items(layer.id)) {
        if (!it.pos || it.kind === "light" || seen.has(it.key)) continue;
        seen.add(it.key);
        const anim = animOf(h, it);
        const alert = itemAlert(h, it);
        if (!anim && !alert && !(it.kind === "device" && it.device.type === "gates" && itemActive(h, it)))
          continue;
        out.push(this.itemMarker(it, { anim, label: false, onTap: () => this.go(it.room.id) }));
      }
    // Accesos a las estancias
    ROOMS_DEF.forEach((r, i) => {
      const o = this.overrides()[`room:${r.id}`];
      const [x, y] = o ? toWorld(o[0], o[1]) : roomAnchor(r);
      const on = r.lights.filter((l) => isOn(h, l.entity)).length;
      const t = num(h, r.temperature);
      const washerDone = r.devices.some((d) => d.type === "washer" && st(h, d.status)?.state === "Terminada");
      out.push(
        html`<div
          class="mk spot"
          data-key=${`room:${r.id}`}
          style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;--i:${i}"
        >
          <button
            class="sp ${on ? "lit" : ""} ${washerDone ? "notify" : ""}"
            aria-label=${r.name}
            @click=${() => this.go(r.id)}
          >
            ${icon(r.icon)}<b class="far-hide">${r.short ?? r.name}</b>
            ${t !== undefined ? html`<span class="num far-hide">${fmt(t, 0)}°</span>` : nothing}
            ${on ? html`<span class="n num">${on}</span>` : nothing}
            ${washerDone ? html`<span class="badge">Lavadora lista</span>` : nothing}
          </button>
        </div>`,
      );
    });
    return out;
  }

  /** Estancia: todas sus luces (tocar enciende/apaga, mantener abre el detalle) y sus dispositivos. */
  private roomMarkers(room: RoomDef): TemplateResult[] {
    const h = this.hass;
    const panel = () => this.renderRoot.querySelector<RoomView>("fv2-room");
    const out: TemplateResult[] = [];
    const seen = new Set<string>();
    for (const layer of LAYERS)
      for (const it of this.items(layer.id)) {
        if (it.room.id !== room.id || !it.pos || seen.has(it.key)) continue;
        seen.add(it.key);
        // La temperatura y humedad de la estancia se ven en su tarjeta «Ambiente»: sin marcador propio
        if (it.kind === "row" && it.row === "climate") continue;
        if (it.kind === "light") {
          out.push(this.lightMarker(it, "active"));
          continue;
        }
        if (it.kind === "device" && it.device.type === "gates") {
          out.push(this.gatesMarker(it.device));
          continue;
        }
        out.push(
          this.itemMarker(it, {
            anim: animOf(h, it),
            label: "active",
            onTap: () => {
              if (it.kind === "device" && it.device.type === "energy") this.solarOpen = true;
              else if (it.kind === "device" && it.device.type === "pump") this.pumpOpen = true;
              else if (it.kind === "device" && it.device.type === "vacuum") this.vacuumOpen = true;
              else
                panel()?.focusKey(
                  it.kind === "device" ? deviceKey(it.device) : it.key,
                  it.kind === "device" ? it.device : undefined,
                );
            },
          }),
        );
      }
    return out;
  }

  /** Capa: todos los elementos de ese tipo en la casa. */
  private layerMarkers(id: LayerId) {
    const h = this.hass;
    const panel = () => this.renderRoot.querySelector<LayerView>("fv2-layer");
    const its = this.items(id).filter((it) => it.pos);
    const dense = its.length > 14;
    return html`<div class="mks ${dense ? "dense" : ""}">
      ${repeat(
        its,
        (it) => it.key,
        (it) =>
          it.kind === "light"
            ? this.lightMarker(it, false, () => panel()?.focusItem(it.key))
            : this.itemMarker(it, {
                anim: animOf(h, it),
                label: true,
                onTap: () => {
                  this.lastTouch = Date.now();
                  if (it.kind === "device" && it.device.type === "energy") this.solarOpen = true;
                  else if (it.kind === "device" && it.device.type === "pump") this.pumpOpen = true;
                  else if (it.kind === "device" && it.device.type === "vacuum") this.vacuumOpen = true;
                  else panel()?.focusItem(it.key);
                },
              }),
      )}
    </div>`;
  }

  /** Luz: tocar enciende/apaga, mantener pulsado abre el detalle. */
  private lightMarker(it: LayerItem & { kind: "light" }, label: boolean | "active", after?: () => void) {
    const e = st(this.hass, it.entity);
    const on = e?.state === "on";
    const named = label === true || (label === "active" && on);
    const [x, , z] = it.pos!;
    return html`<div
      class="mk light ${on ? "on" : ""} ${named ? "named" : ""}"
      data-key=${it.key}
      style="${this.at(it.key, x, z)};--lamp:${lightColor(e)}"
    >
      <button
        class="b"
        aria-label=${it.name}
        @pointerdown=${() => {
          window.clearTimeout(this.press);
          this.press = window.setTimeout(() => {
            this.press = -1;
            this.sheet = { entity: it.entity, name: it.name };
          }, HOLD_MS);
        }}
        @pointerleave=${() => window.clearTimeout(this.press)}
        @click=${() => {
          window.clearTimeout(this.press);
          if (this.press !== -1) {
            toggleLight(this.hass, it.entity);
            after?.();
          }
          this.press = 0;
        }}
        @contextmenu=${(ev: Event) => ev.preventDefault()}
      >
        <span class="dot">${icon(lightIcon(it.entity))}</span>
        <span class="lbl">${it.name}</span>
      </button>
    </div>`;
  }

  /** `label`: rótulo siempre, nunca o solo si está activo / con aviso ("active"). */
  private itemMarker(it: LayerItem, o: { anim: string; label: boolean | "active"; onTap: () => void }) {
    const h = this.hass;
    const [x, , z] = it.pos!;
    const ico =
      it.kind === "device"
        ? deviceIcon(it.device)
        : it.kind === "row"
          ? it.icon
          : it.kind === "cover" && it.curtain
            ? st(h, it.entity)?.state === "closed"
              ? mdiCurtainsClosed
              : mdiCurtains
            : LAYERS[1].icon;
    const label =
      it.kind === "device"
        ? deviceBrief(h, it.device)
        : it.kind === "row"
          ? `${it.name} · ${rowState(h, it)}`
          : `${it.name} · ${fmt(st(h, it.entity)?.attributes.current_position as number, 0)} %`;
    const on = itemActive(h, it);
    const alert = itemAlert(h, it);
    const named = o.label === true || (o.label === "active" && (on || alert || !!o.anim));
    return html`<div
      class="mk dev ${on ? "active" : ""} ${alert ? "alert" : ""} ${named ? "named" : ""}"
      data-key=${it.key}
      style=${this.at(it.key, x, z)}
    >
      <button class="b" aria-label=${it.name} @click=${o.onTap}>
        <span class="dot ${o.anim}">${icon(ico)}</span>
        <span class="lbl">${label}</span>
      </button>
    </div>`;
  }

  /** Las dos puertas del garaje en un solo marcador, con una línea por puerta. */
  private gatesMarker(d: Extract<DeviceDef, { type: "gates" }>) {
    const gs = GATES.filter((g) => d.gates.some((x) => x.entity === g.entity));
    const xs = gs.flatMap((g) => [g.from[0], g.to[0]]);
    const zs = gs.flatMap((g) => [g.from[1], g.to[1]]);
    const mid = (v: number[]) => (Math.min(...v) + Math.max(...v)) / 2;
    const anyOpen = d.gates.some((g) => isOn(this.hass, g.entity));
    return html`<div
      class="mk dev named ${anyOpen ? "alert" : ""}"
      data-key="gates"
      style=${this.at("gates", mid(xs), mid(zs) + 1)}
    >
      <button
        class="b"
        aria-label="Puertas del garaje"
        @click=${() => this.renderRoot.querySelector<RoomView>("fv2-room")?.focusDevice("gates")}
      >
        <span class="dot">${icon(anyOpen ? mdiGarageOpenVariant : mdiGarageVariant)}</span>
        <span class="lbl gates">
          ${d.gates.map((g) => {
            const e = st(this.hass, g.entity);
            const open = e?.state === "on";
            const s = !e || e.state === "unavailable" ? "sin sensor" : open ? "abierta" : "cerrada";
            return html`<span class=${open ? "g-open" : ""}
              >${g.name} ${s}${open && e ? ` · ${relTime(e.last_changed)}` : ""}</span
            >`;
          })}
        </span>
      </button>
    </div>`;
  }

  /* ---------------------------------------------------------------- */
  /* Barras                                                            */
  /* ---------------------------------------------------------------- */

  /** Modo Editar (solo escritorio): botones abajo, entre la rosa de los vientos y el zoom. */
  private renderEditBar() {
    if (!this.editing)
      return html`<div class="editbar">
        <button class="chip" title="Colocar los iconos en el plano" @click=${() => (this.editing = true)}>
          ${icon(mdiPencilOutline)}<span>Editar</span>${this.draft ? html`<i class="pending"></i>` : nothing}
        </button>
      </div>`;
    return html`<div class="editbar">
      <span class="chip hint">Arrastra los iconos · doble clic: posición original</span>
      <button class="chip" @click=${() => ((this.exporting = true), (this.copied = false))}>
        ${icon(mdiCodeJson)}<span>Exportar JSON</span>
      </button>
      <button
        class="chip"
        title="Vuelve a lo que hay en dashboard.config.json"
        ?disabled=${!this.draft}
        @click=${() => this.setDraft(undefined)}
      >
        ${icon(mdiRestore)}<span>Descartar cambios</span>
      </button>
      <button class="chip" title="Todos los iconos a su sitio original" @click=${() => this.setDraft({})}>
        <span>Por defecto</span>
      </button>
      <button class="chip on" @click=${() => (this.editing = false)}>
        ${icon(mdiCheck)}<span>Listo</span>
      </button>
    </div>`;
  }

  private renderExport() {
    const n = Object.keys(this.overrides()).length;
    return html`<div class="export" role="dialog" aria-label="Exportar posiciones">
      <div class="panel">
        <h3>Exportar posiciones</h3>
        <p>
          ${n} icono${n === 1 ? "" : "s"} con posición personalizada. Pega este bloque dentro de
          <b>dashboard.config.json</b>, junto a «theme», «weather»… (sin olvidar la coma) y despliega: las
          pantallas de pared aplicarán estas posiciones.
        </p>
        <textarea readonly rows="12" spellcheck="false" .value=${this.exportJson()}></textarea>
        <div class="row">
          <button class="btn primary" @click=${this.copyJson}>
            ${icon(this.copied ? mdiCheck : mdiContentCopy)} ${this.copied ? "Copiado" : "Copiar"}
          </button>
          <button class="btn" @click=${() => (this.exporting = false)}>Cerrar</button>
        </div>
      </div>
    </div>`;
  }

  /** Selector de capas, sobre el plano (arriba). */
  private renderLayerBar() {
    const activeLayer = LAYERS.find((l) => l.id === this.layer);
    return html`<nav class="layers scroll-x" aria-label="Capas">
        <div class="layers-bar">
          ${LAYERS.map((l) => {
            const busy = this.items(l.id).some((it) => itemAlert(this.hass, it));
            const on = this.layer === l.id;
            return html`<button
              class="chip ${on ? "on" : ""} ${busy ? "alert" : ""}"
              title=${l.name}
              aria-label=${l.name}
              aria-pressed=${on}
              @click=${() => this.setLayer(l.id)}
            >
              ${icon(l.icon)}
            </button>`;
          })}
        </div>
      </nav>
      ${activeLayer ? html`<span class="layer-name">${activeLayer.name}</span>` : nothing}`;
  }

  private renderDock(theme: ThemeMode) {
    const themeIcon =
      theme === "auto" ? mdiBrightnessAuto : theme === "light" ? mdiWhiteBalanceSunny : mdiMoonWaningCrescent;
    return html`<nav class="dock scroll-x">
      <button class="tab ${this.view === HOME && !this.layer ? "on" : ""}" @click=${() => this.go(HOME)}>
        ${icon(mdiHomeOutline)}<span>Casa</span>
      </button>
      ${ROOMS_DEF.map((r) => {
        const on = r.lights.some((l) => isOn(this.hass, l.entity));
        return html`<button
          class="tab ${this.view === r.id ? "on" : ""} ${on ? "lit" : ""}"
          @click=${() => this.go(r.id)}
        >
          ${icon(r.icon)}<span>${r.short ?? r.name}</span>
        </button>`;
      })}
      <button
        class="tab theme"
        title="Tema: ${theme}${theme === "auto" && this.lux ? " (sensor de luz del panel)" : ""}"
        @click=${this.setTheme}
      >
        ${icon(themeIcon)}<span>Tema</span>
      </button>
      ${
        this.config.kiosk_toggle === false
          ? nothing
          : html`<button
              class="tab"
              title=${this.kioskOff ? "Volver al modo kiosko (oculta la barra lateral de Home Assistant)" : "Mostrar la barra lateral y los ajustes de Home Assistant"}
              @click=${this.toggleKiosk}
            >
              ${icon(this.kioskOff ? mdiFullscreen : mdiCogOutline)}<span
                >${this.kioskOff ? "Kiosko" : "Ajustes"}</span
              >
            </button>`
      }
    </nav>`;
  }

  static styles = [
    tokens,
    shared,
    css`
      :host {
        display: block;
        position: relative;
        height: var(--fv2-height, 100dvh);
        overflow: hidden;
        background: var(--bg);
        color: var(--text);
        font-family: var(--font-ui);
        font-size: var(--fs-body);
        user-select: none;
        -webkit-user-select: none;
        -webkit-tap-highlight-color: transparent;
      }
      .app {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
      }
      .main {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-width: none;
      }
      .main::-webkit-scrollbar {
        display: none;
      }
      .planbox {
        position: relative;
        height: clamp(280px, 52vh, 720px);
        border-bottom: 1px solid var(--glass-border);
      }
      fv2-plan {
        position: absolute;
        inset: 0;
      }
      .content {
        min-width: 0;
      }

      /* Apaisado y con sitio: plano a la izquierda y tarjetas a la derecha */
      @media (min-width: 900px) and (min-aspect-ratio: 1/1) {
        .main {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(400px, 44%);
          overflow: hidden;
        }
        .planbox {
          height: auto;
          border-bottom: 0;
          border-right: 1px solid var(--glass-border);
        }
        .content {
          overflow-y: auto;
          overscroll-behavior: contain;
        }
      }

      /* ----- Marcadores (en píxeles de mundo; mantienen su tamaño con --inv) ----- */
      .mks {
        display: contents;
      }
      .mk {
        position: absolute;
        width: 0;
        height: 0;
      }
      .mk > .b,
      .mk > .sp,
      .mk > i {
        position: absolute;
        left: 0;
        top: 0;
        transform: scale(var(--inv));
        transform-origin: 0 0;
      }
      .mk > .sp {
        transform: scale(var(--inv)) translate(-50%, -50%);
      }
      .b {
        display: block;
        width: 0;
        height: 0;
      }
      .dot {
        position: absolute;
        left: -20px;
        top: -20px;
        width: 40px;
        height: 40px;
        display: grid;
        place-items: center;
        border-radius: 50%;
        background: var(--glass-strong);
        border: 1.5px solid var(--glass-border);
        color: var(--text-muted);
        transition:
          background 300ms,
          color 300ms;
      }
      .dot svg {
        width: 22px;
        height: 22px;
      }
      .dev .dot {
        border-radius: 13px;
      }
      .lbl {
        position: absolute;
        top: 24px;
        left: 0;
        transform: translateX(-50%);
        padding: 3px 9px;
        border-radius: 999px;
        background: var(--glass-strong);
        border: 1px solid var(--glass-border);
        color: var(--text);
        font-size: var(--fs-label);
        font-weight: 700;
        white-space: nowrap;
        display: none;
      }
      .mk.named .lbl {
        display: block;
      }
      .lbl.gates {
        display: grid !important;
        text-align: left;
        font-weight: 600;
      }
      .lbl .g-open {
        color: var(--terracotta);
        font-weight: 800;
      }
      /* Luz encendida: color de la luz y un anillo que se expande (transform/opacity) */
      .light.on .dot {
        background: var(--lamp);
        border-color: var(--lamp);
        color: #fff;
      }
      .light.on .dot::after,
      .glow > i::after {
        content: "";
        position: absolute;
        inset: -2px;
        border-radius: 50%;
        border: 2px solid var(--lamp);
        animation: ring 2.8s ease-out infinite;
        pointer-events: none;
      }
      .dev.active .dot {
        background: var(--sage);
        border-color: var(--sage);
        color: #fff;
      }
      .dev.alert .dot {
        background: var(--amber);
        border-color: var(--amber);
        color: #fff;
      }
      /* Vista general: luces encendidas como puntos que laten */
      .glow > i {
        width: 0;
        height: 0;
        pointer-events: none;
      }
      .glow > i::before,
      .glow > i::after {
        left: -8px;
        top: -8px;
        width: 16px;
        height: 16px;
      }
      .glow > i::before {
        content: "";
        position: absolute;
        border-radius: 50%;
        background: var(--lamp);
        border: 2px solid var(--glass-strong);
      }
      fv2-plan.home .mk.dev .dot {
        left: -16px;
        top: -16px;
        width: 32px;
        height: 32px;
      }
      fv2-plan.home .mk.dev .dot svg {
        width: 19px;
        height: 19px;
      }

      /* Capas con muchos elementos: puntos más pequeños; de lejos solo se rotula lo activo */
      .dense .dot {
        left: -16px;
        top: -16px;
        width: 32px;
        height: 32px;
      }
      .dense .dot svg {
        width: 18px;
        height: 18px;
      }
      .dense .lbl {
        top: 19px;
      }
      fv2-plan.layer:not([near]) .mk:not(.on):not(.active):not(.alert) .lbl {
        display: none;
      }
      /* En una estancia: rotulado solo lo encendido o con aviso (el resto, al tocarlo, en su tarjeta) */
      fv2-plan.room .mk:not(.named) .lbl {
        display: none;
      }

      /* Accesos a las estancias */
      .sp {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 6px 11px 6px 8px;
        border-radius: 999px;
        background: var(--glass-strong);
        border: 1.5px solid var(--glass-border);
        color: var(--text-muted);
        font-size: var(--fs-label);
        white-space: nowrap;
        animation: pop 360ms var(--ease) both;
        animation-delay: calc(var(--i) * 25ms);
      }
      @keyframes pop {
        from {
          opacity: 0;
        }
      }
      .sp b {
        color: var(--text);
        font-weight: 700;
      }
      /* De lejos (pantallas pequeñas), solo el icono de la estancia y sus luces encendidas */
      fv2-plan:not([near]) .sp {
        padding: 6px;
      }
      fv2-plan:not([near]) .sp .far-hide {
        display: none;
      }
      fv2-plan:not([near]) .sp .n {
        min-width: 18px;
        padding: 0 4px;
      }
      .sp svg {
        width: 18px;
        height: 18px;
        color: var(--text-muted);
      }
      .sp.lit {
        border-color: var(--amber);
      }
      .sp.lit svg {
        color: var(--amber);
      }
      .sp .n {
        min-width: 20px;
        padding: 0 5px;
        border-radius: 999px;
        background: var(--amber);
        color: #fff;
        font-weight: 800;
        text-align: center;
      }
      .sp.notify {
        border-color: var(--sage);
      }
      .sp .badge {
        padding: 1px 7px;
        border-radius: 999px;
        background: var(--sage);
        color: #fff;
        font-weight: 700;
      }

      /* ----- Modo Editar (solo escritorio) ----- */
      .editbar {
        position: absolute;
        left: 64px;
        right: 66px;
        bottom: 10px;
        z-index: 4;
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 6px;
        pointer-events: none;
      }
      .editbar .chip {
        pointer-events: auto;
      }
      .editbar .chip.hint {
        pointer-events: none;
        color: var(--text-muted);
        font-weight: 600;
      }
      .chip[disabled] {
        opacity: 0.5;
        cursor: default;
      }
      .chip .pending {
        position: absolute;
        top: 6px;
        right: 6px;
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--amber);
        border: 2px solid var(--glass-strong);
      }
      .editing .mk[data-key] .dot,
      .editing .mk[data-key] .sp {
        outline: 2px dashed var(--sage);
        outline-offset: 3px;
        cursor: grab;
      }
      .editing .mk.dragging {
        z-index: 5;
      }
      .editing .mk.dragging .dot,
      .editing .mk.dragging .sp {
        outline-style: solid;
        cursor: grabbing;
      }
      /* Al editar se rotulan todos los iconos, para saber cuál es cuál */
      .editing .mk .lbl:not(.gates) {
        display: block !important;
      }
      .export {
        position: absolute;
        inset: 0;
        z-index: 40;
        display: grid;
        place-items: center;
        padding: var(--space-4);
        background: var(--bg);
      }
      .export .panel {
        width: min(720px, 100%);
        display: grid;
        gap: var(--space-3);
        padding: var(--space-4);
        border-radius: var(--radius);
        background: var(--glass);
        border: 1px solid var(--glass-border);
      }
      .export h3 {
        margin: 0;
        font-family: var(--font-display);
        font-weight: 500;
        font-size: var(--fs-title);
      }
      .export p {
        margin: 0;
        color: var(--text-muted);
        font-size: var(--fs-small);
      }
      .export textarea {
        width: 100%;
        resize: vertical;
        padding: 12px;
        border-radius: var(--radius-sm);
        border: 1px solid var(--glass-border);
        background: var(--bg-2);
        color: var(--text);
        font:
          13px/1.5 ui-monospace,
          "SF Mono",
          Menlo,
          Consolas,
          monospace;
        user-select: text;
        -webkit-user-select: text;
      }
      .export .row {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }

      /* ----- Selector de capas (sobre el plano) ----- */
      .layer-name {
        position: absolute;
        top: 56px;
        left: 50%;
        transform: translateX(-50%);
        max-width: calc(100% - 16px);
        padding: 4px 12px;
        border-radius: 8px;
        background: var(--text);
        color: var(--bg);
        font-size: var(--fs-small);
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        pointer-events: none;
      }
      .layers {
        position: absolute;
        left: 0;
        right: 0;
        top: 8px;
        z-index: 3;
        display: flex;
        justify-content: safe center;
        overflow-x: auto;
        scrollbar-width: none;
        pointer-events: none;
      }
      .layers::-webkit-scrollbar,
      .dock::-webkit-scrollbar {
        display: none;
      }
      /* Barra de iconos: un rectángulo con esquinas suaves, distinto de los marcadores redondos del plano */
      .layers-bar {
        flex: none;
        display: flex;
        gap: 2px;
        padding: 4px;
        border-radius: 16px;
        background: var(--glass-strong);
        border: 1px solid var(--glass-border);
        pointer-events: auto;
      }
      .chip {
        position: relative;
        flex: none;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-width: 44px;
        height: 40px;
        justify-content: center;
        padding: 0 10px;
        border-radius: 12px;
        color: var(--text-muted);
        font-size: var(--fs-small);
        font-weight: 700;
      }
      .chip svg {
        width: 24px;
        height: 24px;
      }
      .chip.on {
        background: var(--text);
        color: var(--bg);
      }
      .chip.alert::after,
      .tab.lit::after {
        content: "";
        position: absolute;
        top: 6px;
        right: 6px;
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--amber);
        border: 2px solid var(--glass-strong);
      }

      /* ----- Barra inferior de estancias ----- */
      .dock {
        flex: none;
        display: flex;
        gap: 4px;
        padding: 6px 6px calc(6px + env(safe-area-inset-bottom));
        overflow-x: auto;
        scrollbar-width: none;
        background: var(--glass);
        border-top: 1px solid var(--glass-border);
      }
      .tab {
        position: relative;
        flex: none;
        display: grid;
        justify-items: center;
        gap: 2px;
        min-width: 66px;
        padding: 7px 8px 6px;
        border-radius: 14px;
        color: var(--text-muted);
        font-size: var(--fs-label);
        font-weight: 600;
        white-space: nowrap;
      }
      .tab svg {
        width: 24px;
        height: 24px;
      }
      .tab.on {
        background: var(--text);
        color: var(--bg);
      }
      .tab.lit::after {
        top: 5px;
        right: 14px;
      }

      .offline {
        position: absolute;
        top: 12px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 30;
        padding: 10px 18px;
        border-radius: 999px;
        background: var(--danger);
        color: #fff;
        font-size: var(--fs-small);
        font-weight: 700;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "functional-v2": FunctionalDashboard;
  }
}

export type { FloorPlan };
