import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import {
  mdiBrightnessAuto,
  mdiGarageOpenVariant,
  mdiGarageVariant,
  mdiHomeOutline,
  mdiMoonWaningCrescent,
  mdiWhiteBalanceSunny,
} from "@mdi/js";

import type { DashboardConfig, HomeAssistant, ThemeMode } from "./types";
import { shared, tokens } from "./styles/tokens";
import { loadThemeMode, resolveTheme, saveThemeMode } from "./lib/theme";
import { call, fmt, icon, isOn, lightColor, num, relTime, st } from "./lib/ha";
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
import { DEVICE_ICONS, deviceBrief } from "./widgets/devices";
import { lightIcon } from "./widgets/lights";
import { GATES } from "../../house-3d-v1/src/scene/plan";
import { HOME_BOX, roomAnchor, roomBox, toWorld, unionBox, type Box } from "./plan/geometry";
import type { FloorPlan } from "./plan/floor-plan";
import { DOORBELL, PriorityWatcher, type PriorityAlert } from "./lib/priority";
import type { RoomView } from "./views/room-view";
import type { LayerView } from "./views/layer-view";
import "./plan/floor-plan";
import "./views/home-view";
import "./views/room-view";
import "./views/layer-view";
import "./widgets/lights";
import "./widgets/solar-sheet";
import "./widgets/pump-sheet";
import "./widgets/priority-alert";

const HOME = "home";
const HOLD_MS = 550;

/**
 * Separación (en metros) de marcadores que caen casi en el mismo punto del plano,
 * sin mover el dispositivo de sitio.
 */
const NUDGE: Record<string, [dx: number, dz: number]> = {
  "binary_sensor.sensor_agua_dreame_water_leak": [-0.9, 0.5],
  "vacuum:vacuum.limpiasuelos": [-0.85, -0.55],
  "presence:binary_sensor.shellywalldisplay_0205030bbdd8_ocupacion": [0.0, -0.85],
  "media_player.shellywalldisplay_0205030bbdd8": [0.0, -0.85],
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
  @state() private view = HOME;
  @state() private sheet?: { entity: string; name: string };
  @state() private solarOpen = false;
  @state() private pumpOpen = false;
  /** Capa activa (todos los dispositivos de un tipo en la vista general) */
  @state() private layer?: LayerId;
  /** Refresco periódico (caducidad de las alertas prioritarias) */
  @state() private tick = 0;
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
    this.idleTimer = window.setInterval(() => {
      this.checkIdle();
      if (this.alerts.length) this.tick++;
    }, 5000);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("keydown", this.onKey);
    window.clearInterval(this.idleTimer);
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
    if (Date.now() - this.lastTouch > secs * 1000) this.go(HOME);
  }

  private go(view: string): void {
    this.lastTouch = Date.now();
    if (view !== HOME && !ROOM_BY_ID.has(view)) return;
    this.sheet = undefined;
    this.solarOpen = false;
    this.pumpOpen = false;
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
    this.view = HOME;
    this.layer = id === this.layer ? undefined : id;
    this.toTop();
  }

  /** Al cambiar de vista, el plano vuelve a quedar arriba y la pestaña de la barra, a la vista. */
  private toTop(): void {
    this.updateComplete.then(() => {
      this.renderRoot.querySelector(".main")?.scrollTo({ top: 0 });
      const tab = this.renderRoot.querySelector<HTMLElement>(".dock .tab.on");
      const dock = tab?.parentElement;
      if (tab && dock) dock.scrollTo({ left: tab.offsetLeft - dock.clientWidth / 2 + tab.offsetWidth / 2 });
    });
  }

  private items(id: LayerId): LayerItem[] {
    let its = this.layerCache.get(id);
    if (!its) this.layerCache.set(id, (its = layerItems(id)));
    return its;
  }

  private setTheme(): void {
    const order: ThemeMode[] = ["auto", "light", "dark"];
    this.themeMode = order[(order.indexOf(this.themeMode) + 1) % order.length];
    saveThemeMode(this.themeMode);
  }

  protected willUpdate(): void {
    const theme = resolveTheme(this.themeMode, this.hass?.themes?.darkMode);
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
          <div class="planbox">
            <fv2-plan
              .frameBox=${this.focusBox()}
              .lit=${this.litRooms()}
              .selected=${room?.rects.length ? room.id : undefined}
              ?poolLit=${isOn(this.hass, "light.luz_piscina")}
              .padTop=${56}
              class=${this.layer ? "layer" : room ? "room" : "home"}
              @room-tap=${(e: CustomEvent<string>) => !this.layer && this.go(e.detail)}
              @plan-drag=${() => window.clearTimeout(this.press)}
            >
              ${this.layer ? this.layerMarkers(this.layer) : room ? this.roomMarkers(room) : this.homeMarkers()}
            </fv2-plan>
            ${this.renderLayerBar()}
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
                    ></fv2-layer>`
                  : html`<fv2-home
                      .hass=${this.hass}
                      .config=${this.config}
                      @go=${(e: CustomEvent<string>) => this.go(e.detail)}
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
      ${this.solarOpen ? html`<fv2-solar-sheet .hass=${this.hass} @close=${() => (this.solarOpen = false)}></fv2-solar-sheet>` : nothing}
      ${this.pumpOpen ? html`<fv2-pump-sheet .hass=${this.hass} @close=${() => (this.pumpOpen = false)}></fv2-pump-sheet>` : nothing}
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
      ${this.hass && !this.hass.connected ? html`<div class="offline">Sin conexión con Home Assistant…</div>` : nothing}
    `;
  }

  /* ---------------------------------------------------------------- */
  /* Marcadores sobre el plano                                         */
  /* ---------------------------------------------------------------- */

  /** Posición de un elemento en el plano (píxeles de mundo), con su separación si hace falta. */
  private at(key: string, x: number, z: number): string {
    const n = NUDGE[key];
    const [px, py] = toWorld(x + (n?.[0] ?? 0), z + (n?.[1] ?? 0));
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
      const [x, y] = roomAnchor(r);
      const on = r.lights.filter((l) => isOn(h, l.entity)).length;
      const t = num(h, r.temperature);
      const washerDone = r.devices.some((d) => d.type === "washer" && st(h, d.status)?.state === "Terminada");
      out.push(
        html`<div class="mk spot" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;--i:${i}">
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
            call(this.hass, "light", "toggle", { entity_id: it.entity });
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
      it.kind === "device" ? DEVICE_ICONS[it.device.type] : it.kind === "row" ? it.icon : LAYERS[1].icon;
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

  /** Selector de capas, sobre el plano (arriba). */
  private renderLayerBar() {
    return html`<nav class="layers scroll-x" aria-label="Capas">
      ${LAYERS.map((l) => {
        const busy = this.items(l.id).some((it) => itemAlert(this.hass, it));
        const on = this.layer === l.id;
        return html`<button
          class="chip ${on ? "on" : ""} ${busy ? "alert" : ""}"
          title=${l.name}
          aria-pressed=${on}
          @click=${() => this.setLayer(l.id)}
        >
          ${icon(l.icon)}${on ? html`<span>${l.name}</span>` : nothing}
        </button>`;
      })}
    </nav>`;
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
      <button class="tab theme" title="Tema: ${theme}" @click=${this.setTheme}>
        ${icon(themeIcon)}<span>Tema</span>
      </button>
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

      /* ----- Selector de capas (sobre el plano) ----- */
      .layers {
        position: absolute;
        left: 8px;
        right: 8px;
        top: 8px;
        z-index: 3;
        display: flex;
        gap: 6px;
        overflow-x: auto;
        scrollbar-width: none;
        pointer-events: none;
      }
      .layers::-webkit-scrollbar,
      .dock::-webkit-scrollbar {
        display: none;
      }
      .chip {
        position: relative;
        flex: none;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-width: 44px;
        height: 44px;
        justify-content: center;
        padding: 0 11px;
        border-radius: 999px;
        background: var(--glass-strong);
        border: 1px solid var(--glass-border);
        color: var(--text-muted);
        font-size: var(--fs-small);
        font-weight: 700;
        pointer-events: auto;
      }
      .chip svg {
        width: 22px;
        height: 22px;
      }
      .chip.on {
        background: var(--text);
        border-color: var(--text);
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
