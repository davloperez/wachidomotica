import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import {
  mdiArrowCollapseDown,
  mdiArrowCollapseHorizontal,
  mdiArrowCollapseUp,
  mdiArrowExpandHorizontal,
  mdiArrowLeft,
  mdiBlindsHorizontal,
  mdiCurtains,
  mdiLightbulbGroupOutline,
  mdiShieldHomeOutline,
  mdiThermometer,
  mdiWashingMachine,
  mdiWeatherPartlyCloudy,
} from "@mdi/js";
import type { DashboardConfig, HomeAssistant } from "../types";
import { shared } from "../styles/tokens";
import { WEATHER_ES, call, fmt, icon, isDimmable, isOn, moreInfo, num, st } from "../lib/ha";
import { hourlyMeans, startOfToday, stateSpans, type Point, type Span } from "../lib/data";
import { lampKind, type DeviceDef, type RoomDef } from "../house/rooms";
import { deviceKey, itemActive, itemAlert, roomExtras, rowState, type LayerItem } from "../house/layers";
import { WEATHER_ICON } from "./home-view";
import "../charts/charts";
import "../widgets/lights";
import "../widgets/covers";
import "../widgets/curtains";
import "../widgets/devices";

type Scene = "all" | "relax" | "night" | "off";

/** Detalle de una estancia: resumen, iluminación con escenas, persianas, ambiente, dispositivos. */
@customElement("fv2-room")
export class RoomView extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ attribute: false }) config?: DashboardConfig;
  @property({ attribute: false }) room?: RoomDef;
  @state() private climate: Record<string, Point[]> = {};
  @state() private spans: Record<string, Span[]> = {};
  @state() private scene?: Scene;
  private timer = 0;

  connectedCallback(): void {
    super.connectedCallback();
    this.timer = window.setInterval(() => this.load(), 5 * 60_000);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this.timer);
  }

  /** Lleva a la vista la tarjeta del dispositivo (al tocar su marcador en el plano) y la resalta. */
  focusDevice(type: string): void {
    const card = this.renderRoot.querySelector<HTMLElement>(`fv2-device[data-type="${type}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    card.classList.remove("flash");
    void card.offsetWidth;
    card.classList.add("flash");
  }

  /** Lleva a la vista la tarjeta de un elemento (persiana, sensor o dispositivo) por su clave y la resalta. */
  focusKey(key: string, device?: DeviceDef): void {
    const q = (sel: string) => this.renderRoot.querySelector<HTMLElement>(sel);
    const card =
      q(`[data-key="${CSS.escape(key)}"]`) ??
      (device ? q(`fv2-device[data-type="${device.type}"]`) : undefined) ??
      q(".card.sensors");
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    card.classList.remove("flash");
    void card.offsetWidth;
    card.classList.add("flash");
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("room")) {
      this.climate = {};
      this.spans = {};
      this.scene = undefined;
      this.load();
    } else if (changed.has("hass") && !changed.get("hass")) this.load();
  }

  private async load(): Promise<void> {
    const r = this.room;
    if (!this.hass || !r) return;
    const climateIds = [r.temperature, r.humidity].filter((x): x is string => !!x);
    if (climateIds.length)
      hourlyMeans(this.hass, climateIds, 24)
        .then((d) => (this.climate = d))
        .catch((err) => console.warn("[functional-v2] clima", err));
    const ids = [
      ...r.lights.map((l) => l.entity),
      ...r.covers.map((c) => c.entity),
      ...r.devices.flatMap((d) => (d.type === "washer" ? [d.running] : [])),
    ];
    if (ids.length)
      stateSpans(this.hass, ids, startOfToday())
        .then((d) => (this.spans = d))
        .catch((err) => console.warn("[functional-v2] historial", err));
  }

  private back() {
    this.dispatchEvent(new CustomEvent("go", { detail: "home", bubbles: true, composed: true }));
  }

  /** Escenas sencillas de la estancia según el tipo de cada luminaria del plano. */
  private applyScene(scene: Scene): void {
    const r = this.room;
    if (!r || !this.hass) return;
    this.scene = scene;
    const lights = r.lights
      .map((l) => l.entity)
      .filter((id) => st(this.hass, id) && st(this.hass, id)!.state !== "unavailable");
    const soft = (id: string) =>
      ["lamp", "strip", "pendant", "wall", "pool"].includes(lampKind(id) ?? "lamp");
    const on = (ids: string[], pct?: number, warm = false) => {
      for (const id of ids) {
        const e = st(this.hass, id);
        const data: Record<string, unknown> = { entity_id: id };
        if (pct !== undefined && isDimmable(e)) data.brightness_pct = pct;
        const modes = (e?.attributes.supported_color_modes as string[] | undefined) ?? [];
        if (warm && modes.includes("color_temp")) data.color_temp_kelvin = 2700;
        call(this.hass, "light", "turn_on", data);
      }
    };
    const off = (ids: string[]) => ids.length && call(this.hass, "light", "turn_off", { entity_id: ids });
    if (scene === "all") on(lights, 100);
    if (scene === "off") off(lights);
    const own = scene === "relax" || scene === "night" ? r.scenes?.[scene] : undefined;
    if (own) {
      for (const l of own.lights) {
        if (!lights.includes(l.entity)) continue;
        const e = st(this.hass, l.entity);
        const data: Record<string, unknown> = { entity_id: l.entity };
        if (l.pct !== undefined && isDimmable(e)) data.brightness_pct = l.pct;
        const modes = (e?.attributes.supported_color_modes as string[] | undefined) ?? [];
        if (l.kelvin !== undefined && modes.includes("color_temp")) data.color_temp_kelvin = l.kelvin;
        call(this.hass, "light", "turn_on", data);
      }
      if (own.offOthers) off(lights.filter((id) => !own.lights.some((l) => l.entity === id)));
      return;
    }
    if (scene === "relax") {
      const amb = lights.filter((id) => soft(id) || isDimmable(st(this.hass, id)));
      const pick = amb.length ? amb : lights;
      on(pick, 35, true);
      off(lights.filter((id) => !pick.includes(id)));
    }
    if (scene === "night") {
      const lamps = lights.filter((id) => lampKind(id) === "lamp");
      const strips = lights.filter((id) => lampKind(id) === "strip");
      const pick = lamps.length
        ? lamps
        : strips.length
          ? strips
          : lights.filter((id) => isDimmable(st(this.hass, id))).slice(0, 1);
      on(pick, 8, true);
      off(lights.filter((id) => !pick.includes(id)));
    }
  }

  render() {
    const r = this.room;
    if (!r) return nothing;
    const h = this.hass;
    const lightsOn = r.lights.filter((l) => isOn(h, l.entity)).length;
    const pos = r.covers
      .filter((c) => !c.curtain)
      .map((c) => st(h, c.entity)?.attributes.current_position as number | undefined)
      .filter((p): p is number => typeof p === "number");
    const avg = pos.length ? Math.round(pos.reduce((a, b) => a + b, 0) / pos.length) : undefined;
    const extras = roomExtras(r);

    return html`
      <header class="top">
        <button class="round back" title="Volver" @click=${this.back}>${icon(mdiArrowLeft)}</button>
        <div class="title">
          <span class="eyebrow">Villawachitos · estancia</span>
          <h1>${r.name}</h1>
        </div>
      </header>

      <div class="col">
        ${this.washerDone()} ${r.lights.length ? this.lightsCard(lightsOn) : nothing}
        ${r.covers.some((c) => !c.curtain) ? this.coversCard(avg) : nothing}
        ${r.covers.some((c) => c.curtain) ? this.curtainsCard() : nothing} ${this.climateCard()}
      </div>
      <div class="col">
        ${this.sensorsCard(extras)}
        ${repeat(
          [...r.devices, ...extras.flatMap((x) => (x.kind === "device" ? [x.device] : []))],
          (d) => `${d.type}:${d.name}`,
          (d, i) =>
            html`<fv2-device
              class="glass dev"
              data-type=${d.type}
              data-key=${deviceKey(d)}
              style="--d:${i + 2}"
              .hass=${h}
              .def=${d}
            ></fv2-device>`,
        )}
      </div>
    `;
  }

  private lightsCard(lightsOn: number) {
    const r = this.room!;
    const allOn = lightsOn > 0;
    const scenes: [Scene, string][] = [
      ["all", "Todo"],
      ["relax", r.scenes?.relax?.label ?? "Relax"],
      ["night", r.scenes?.night?.label ?? "Noche"],
      ["off", "Apagar"],
    ];
    return html`
      <section class="glass card" style="--d:0">
        <header class="card-head">
          <span class="ico ${allOn ? "lit" : ""}">${icon(mdiLightbulbGroupOutline)}</span>
          <div class="grow ttl">
            <b>Iluminación</b>
            <span>${lightsOn ? `${lightsOn} de ${r.lights.length} encendidas` : "Todo apagado"}</span>
          </div>
          <button
            class="toggle amber ${allOn ? "on" : ""}"
            title="Todas"
            @click=${() =>
              call(this.hass, "light", allOn ? "turn_off" : "turn_on", {
                entity_id: r.lights.map((l) => l.entity),
              })}
          ></button>
        </header>
        <div class="seg">
          ${scenes.map(
            ([s, label]) =>
              html`<button class=${this.scene === s ? "on" : ""} @click=${() => this.applyScene(s)}>
                ${label}
              </button>`,
          )}
        </div>
        <div class="tiles">
          ${repeat(
            r.lights,
            (l) => l.entity,
            (l) =>
              html`<fv2-light-tile .hass=${this.hass} .entity=${l.entity} .name=${l.name}></fv2-light-tile>`,
          )}
        </div>
      </section>
    `;
  }

  private coversCard(avg?: number) {
    const r = this.room!;
    const covers = r.covers.filter((c) => !c.curtain);
    const ids = covers.map((c) => c.entity);
    return html`
      <section class="glass card" style="--d:1">
        <header class="card-head">
          <span class="ico">${icon(mdiBlindsHorizontal)}</span>
          <div class="grow ttl">
            <b>Persianas</b>
            <span>${avg !== undefined ? `${avg} % de apertura` : ""}</span>
          </div>
          ${
            ids.length > 1
              ? html`
                  <button
                    class="round sm"
                    title="Subir todas"
                    @click=${() => call(this.hass, "cover", "open_cover", { entity_id: ids })}
                  >
                    ${icon(mdiArrowCollapseUp)}
                  </button>
                  <button
                    class="round sm"
                    title="Bajar todas"
                    @click=${() => call(this.hass, "cover", "close_cover", { entity_id: ids })}
                  >
                    ${icon(mdiArrowCollapseDown)}
                  </button>
                `
              : nothing
          }
        </header>
        ${covers.map((c) => html`<fv2-cover data-key=${c.entity} .hass=${this.hass} .entity=${c.entity} .name=${c.name}></fv2-cover>`)}
      </section>
    `;
  }

  /** Cortinas: se abren en horizontal, así que llevan su propia tarjeta (abrir / cerrar en vez de subir / bajar). */
  private curtainsCard() {
    const curtains = this.room!.covers.filter((c) => c.curtain);
    const ids = curtains.map((c) => c.entity);
    return html`
      <section class="glass card" style="--d:1">
        <header class="card-head">
          <span class="ico">${icon(mdiCurtains)}</span>
          <div class="grow ttl">
            <b>Cortinas</b>
          </div>
          ${
            ids.length > 1
              ? html`
                  <button
                    class="round sm"
                    title="Abrir todas"
                    @click=${() => call(this.hass, "cover", "open_cover", { entity_id: ids })}
                  >
                    ${icon(mdiArrowExpandHorizontal)}
                  </button>
                  <button
                    class="round sm"
                    title="Cerrar todas"
                    @click=${() => call(this.hass, "cover", "close_cover", { entity_id: ids })}
                  >
                    ${icon(mdiArrowCollapseHorizontal)}
                  </button>
                `
              : nothing
          }
        </header>
        ${curtains.map((c) => html`<fv2-curtain data-key=${c.entity} .hass=${this.hass} .entity=${c.entity} .name=${c.name}></fv2-curtain>`)}
      </section>
    `;
  }

  /** Puertas, sensores de agua y alarma de la estancia (las filas de la capa de seguridad). */
  private sensorsCard(extras: LayerItem[]) {
    const rows = extras.filter((x): x is LayerItem & { kind: "row" } => x.kind === "row");
    if (!rows.length) return nothing;
    const h = this.hass;
    const alerts = rows.filter((x) => itemAlert(h, x)).length;
    return html`
      <section class="glass card sensors" style="--d:1">
        <header class="card-head">
          <span class="ico ${alerts ? "warn" : ""}">${icon(mdiShieldHomeOutline)}</span>
          <div class="grow ttl">
            <b>Seguridad</b>
            <span>${alerts ? `${alerts} aviso${alerts > 1 ? "s" : ""}` : "Todo en orden"}</span>
          </div>
        </header>
        ${rows.map((x) => {
          const alert = itemAlert(h, x);
          return html`<div
            data-key=${x.key}
            class="srow tap ${alert ? "alert" : itemActive(h, x) ? "on" : ""}"
            title=${x.row === "alarm" ? "Conectar o desconectar la alarma" : "Más información"}
            @click=${() => moreInfo(this, x.entity)}
          >
            <span class="r-ico">${icon(x.icon)}</span><b>${x.name}</b>
            <span class="r-state num">${rowState(h, x)}</span>
          </div>`;
        })}
      </section>
    `;
  }

  private climateCard() {
    const r = this.room!;
    const h = this.hass;
    if (r.id === "exterior") {
      const w = st(h, this.config?.weather);
      if (!w) return nothing;
      const a = w.attributes;
      return html`
        <section class="glass card tap" style="--d:0" @click=${() => moreInfo(this, w.entity_id)}>
          <header class="card-head">
            <span class="ico">${icon(WEATHER_ICON[w.state] ?? mdiWeatherPartlyCloudy)}</span>
            <div class="grow ttl"><b>Tiempo</b><span>${WEATHER_ES[w.state] ?? w.state}</span></div>
          </header>
          <div class="kpis">
            <div>
              <span class="kpi">${fmt(a.temperature as number, 0)}<small>°C</small></span
              ><span class="muted lbl">temperatura</span>
            </div>
            <div>
              <span class="kpi soft">${fmt(a.humidity as number, 0)}<small>%</small></span
              ><span class="muted lbl">humedad</span>
            </div>
            <div>
              <span class="kpi soft">${fmt(a.wind_speed as number, 0)}<small>km/h</small></span
              ><span class="muted lbl">viento</span>
            </div>
          </div>
        </section>
      `;
    }
    if (!r.temperature) return nothing;
    const t = num(h, r.temperature);
    const hum = num(h, r.humidity);
    const comfort =
      t === undefined ? "" : t < 19 ? "Fresco" : t <= 25 ? "Confortable" : t <= 28 ? "Cálido" : "Caluroso";
    return html`
      <section class="glass card" data-key=${r.temperature} style="--d:0">
        <header class="card-head tap" @click=${() => moreInfo(this, r.temperature!)}>
          <span class="ico">${icon(mdiThermometer)}</span>
          <div class="grow ttl"><b>Ambiente</b><span>${comfort}</span></div>
        </header>
        <div class="kpis">
          <div>
            <span class="kpi">${fmt(t, 1)}<small>°C</small></span
            ><span class="muted lbl">temperatura</span>
          </div>
          ${
            hum !== undefined
              ? html`<div>
                  <span class="kpi soft">${fmt(hum, 0)}<small>%</small></span
                  ><span class="muted lbl">humedad</span>
                </div>`
              : nothing
          }
        </div>
        <fv2-area-chart
          .height=${90}
          .series=${[
            {
              data: this.climate[r.temperature] ?? [],
              color: "var(--terracotta)",
              unit: "°",
              own: true,
              label: "Temperatura",
            },
            ...(r.humidity
              ? [
                  {
                    data: this.climate[r.humidity] ?? [],
                    color: "var(--sky)",
                    unit: " %",
                    own: true,
                    label: "Humedad",
                  },
                ]
              : []),
          ]}
        ></fv2-area-chart>
      </section>
    `;
  }

  /** Aviso destacado cuando la lavadora ha terminado: hora, duración del ciclo y lavados de hoy. */
  private washerDone() {
    const d = this.room!.devices.find((x) => x.type === "washer");
    if (!d || d.type !== "washer" || st(this.hass, d.status)?.state !== "Terminada") return nothing;
    // El sensor «en marcha» tarda 10 min en apagarse (delay_off, para no cortar el ciclo en las pausas)
    const OFF_DELAY = 10 * 60_000;
    const end = new Date(
      new Date(st(this.hass, d.running)?.last_changed ?? Date.now()).getTime() - OFF_DELAY,
    );
    const cycles = (this.spans[d.running] ?? []).filter((x) => x.state === "on");
    const last = cycles.at(-1);
    const mins = last ? Math.max(1, Math.round((last.to - last.from - OFF_DELAY) / 60_000)) : undefined;
    const ago = Math.max(0, Math.round((Date.now() - end.getTime()) / 60_000));
    const hm = (m: number) =>
      m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`;
    return html`<section class="glass card done" style="--d:0">
      <header class="card-head">
        <span class="ico ok">${icon(mdiWashingMachine)}</span>
        <div class="grow ttl">
          <b>Lavadora terminada</b>
          <span>Tender la ropa · hace ${hm(ago)}</span>
        </div>
      </header>
      <div class="done-grid">
        <div>
          <span class="faint">Terminó</span
          ><b>${end.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</b>
        </div>
        <div><span class="faint">Duración</span><b>${mins !== undefined ? hm(mins) : "—"}</b></div>
        <div><span class="faint">Lavados hoy</span><b>${cycles.length || 1}</b></div>
      </div>
      <p class="faint done-note">Avisado por Telegram en Notificaciones.</p>
    </section>`;
  }

  static styles = [
    shared,
    css`
      .done {
        border: 1.5px solid var(--sage);
        box-shadow: 0 0 0 4px var(--sage-soft);
      }
      .done .ico {
        background: var(--sage);
        color: #fff;
        animation: nudge 2.4s var(--ease-soft) infinite;
      }
      @keyframes nudge {
        0%,
        100% {
          transform: rotate(0);
        }
        8% {
          transform: rotate(-12deg);
        }
        16% {
          transform: rotate(10deg);
        }
        24% {
          transform: rotate(0);
        }
      }
      .done-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }
      .done-grid div {
        display: grid;
        gap: 2px;
        padding: 8px 10px;
        border-radius: 12px;
        background: var(--sage-soft);
        font-size: var(--fs-label);
      }
      .done-grid b {
        font-size: var(--fs-body);
      }
      .done-note {
        margin: 0;
        font-size: var(--fs-label);
      }
      :host {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 330px), 1fr));
        align-items: start;
        gap: var(--space-3);
        padding: var(--space-3);
      }

      .top {
        grid-column: 1 / -1;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--space-2) var(--space-3);
        animation: rise 320ms var(--ease) both;
      }
      .back {
        width: 52px;
        height: 52px;
        border-radius: 50%;
        background: var(--glass);
        border: 1px solid var(--glass-border);
      }
      .title {
        display: grid;
        min-width: 0;
        flex: 1;
      }
      .eyebrow {
        font-size: var(--fs-label);
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--text-muted);
      }
      h1 {
        margin: 0;
        font-family: var(--font-display);
        font-weight: 400;
        font-size: var(--fs-hero);
        letter-spacing: -0.02em;
        line-height: 1.05;
      }
      .col {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        min-width: 0;
      }
      .card,
      .dev {
        animation: rise 320ms var(--ease) both;
        animation-delay: calc(var(--d) * 30ms);
        flex: none;
      }
      .dev {
        background: var(--glass);
      }
      .flash {
        animation: flash 1.6s var(--ease);
      }
      .dev.flash {
        animation: flash 1.6s var(--ease);
      }
      @keyframes flash {
        0%,
        70% {
          outline: 3px solid var(--amber);
          outline-offset: 2px;
        }
        100% {
          outline: 3px solid transparent;
          outline-offset: 2px;
        }
      }
      .ttl {
        display: grid;
      }
      .ttl b {
        color: var(--text);
      }
      .ttl span {
        font-weight: 500;
        font-size: var(--fs-label);
      }
      .ico.lit {
        background: var(--amber-soft);
        color: var(--amber);
      }
      .tiles {
        display: grid;
        gap: 8px;
      }
      .tap {
        cursor: pointer;
      }
      .srow {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border-radius: var(--radius-sm);
        background: var(--chip);
        font-size: var(--fs-small);
      }
      .srow .r-ico {
        display: grid;
        place-items: center;
        color: var(--text-muted);
      }
      .srow .r-state {
        color: var(--text-muted);
        font-weight: 600;
      }
      .srow.on .r-ico {
        color: var(--sage);
      }
      .srow.alert .r-ico,
      .srow.alert .r-state {
        color: var(--amber);
      }
      .ico.warn {
        background: var(--amber-soft);
        color: var(--amber);
      }
      .round.sm {
        width: 36px;
        height: 36px;
      }
      .kpis {
        display: flex;
        gap: var(--space-4);
      }
      .kpis > div {
        display: grid;
        gap: 4px;
      }
      .kpi.soft {
        color: var(--text-muted);
      }
      .lbl {
        font-size: var(--fs-label);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "fv2-room": RoomView;
  }
}
