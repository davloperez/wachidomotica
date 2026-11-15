import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import {
  mdiArrowCollapseDown,
  mdiArrowCollapseUp,
  mdiArrowLeft,
  mdiBlindsHorizontal,
  mdiChartTimelineVariant,
  mdiLightbulbGroupOutline,
  mdiThermometer,
  mdiWaterPercent,
  mdiWeatherPartlyCloudy,
  mdiWindowShutterOpen,
} from "@mdi/js";
import type { DashboardConfig, HomeAssistant } from "../types";
import { shared } from "../styles/tokens";
import { WEATHER_ES, call, fmt, icon, isDimmable, isOn, num, st } from "../lib/ha";
import { hourlyMeans, startOfToday, stateSpans, type Point, type Span } from "../lib/data";
import { lampKind, type RoomDef } from "../house/rooms";
import { WEATHER_ICON } from "./home-view";
import "../charts/charts";
import "../widgets/lights";
import "../widgets/covers";
import "../widgets/devices";

type Scene = "all" | "relax" | "night" | "off";

/** Detalle de una estancia: resumen, iluminación con escenas, persianas, ambiente, dispositivos y actividad. */
@customElement("fv1-room")
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

  /** Lleva a la vista la tarjeta del dispositivo (al tocar su marcador en la maqueta) y la resalta. */
  focusDevice(type: string): void {
    const card = this.renderRoot.querySelector<HTMLElement>(`fv1-device[data-type="${type}"]`);
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
        .catch((err) => console.warn("[functional-v1] clima", err));
    const ids = [...r.lights.map((l) => l.entity), ...r.covers.map((c) => c.entity)];
    if (ids.length)
      stateSpans(this.hass, ids, startOfToday())
        .then((d) => (this.spans = d))
        .catch((err) => console.warn("[functional-v1] historial", err));
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
    const t = num(h, r.temperature);
    const hum = num(h, r.humidity);
    const pos = r.covers
      .map((c) => st(h, c.entity)?.attributes.current_position as number | undefined)
      .filter((p): p is number => typeof p === "number");
    const avg = pos.length ? Math.round(pos.reduce((a, b) => a + b, 0) / pos.length) : undefined;

    return html`
      <header class="top">
        <button class="round back glass" title="Volver" @click=${this.back}>${icon(mdiArrowLeft)}</button>
        <div class="title">
          <span class="eyebrow">Villawachitos · estancia</span>
          <h1>${r.name}</h1>
        </div>
        <div class="summary">
          ${t !== undefined ? html`<span class="pill glass-pill">${icon(mdiThermometer)} ${fmt(t, 1)}°</span>` : nothing}
          ${hum !== undefined ? html`<span class="pill glass-pill">${icon(mdiWaterPercent)} ${fmt(hum, 0)} %</span>` : nothing}
          ${
            r.lights.length
              ? html`<span class="pill glass-pill ${lightsOn ? "lit" : ""}"
                  >${icon(mdiLightbulbGroupOutline)} ${lightsOn}/${r.lights.length}</span
                >`
              : nothing
          }
          ${avg !== undefined ? html`<span class="pill glass-pill">${icon(mdiWindowShutterOpen)} ${avg} %</span>` : nothing}
        </div>
      </header>

      <aside class="col left scroll">
        ${r.lights.length ? this.lightsCard(lightsOn) : nothing} ${this.activityCard()}
      </aside>
      <aside class="col right scroll">
        ${this.climateCard()} ${r.covers.length ? this.coversCard(avg) : nothing}
        ${repeat(
          r.devices,
          (d) => `${d.type}:${d.name}`,
          (d, i) =>
            html`<fv1-device
              class="glass dev"
              data-type=${d.type}
              style="--d:${i + 2}"
              .hass=${h}
              .def=${d}
            ></fv1-device>`,
        )}
      </aside>
    `;
  }

  private lightsCard(lightsOn: number) {
    const r = this.room!;
    const allOn = lightsOn > 0;
    const scenes: [Scene, string][] = [
      ["all", "Todo"],
      ["relax", "Relax"],
      ["night", "Noche"],
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
              html`<fv1-light-tile .hass=${this.hass} .entity=${l.entity} .name=${l.name}></fv1-light-tile>`,
          )}
        </div>
      </section>
    `;
  }

  private coversCard(avg?: number) {
    const r = this.room!;
    const ids = r.covers.map((c) => c.entity);
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
        ${r.covers.map((c) => html`<fv1-cover .hass=${this.hass} .entity=${c.entity} .name=${c.name}></fv1-cover>`)}
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
        <section class="glass card" style="--d:0">
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
      <section class="glass card" style="--d:0">
        <header class="card-head">
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
        <fv1-area-chart
          .height=${90}
          .series=${[
            { data: this.climate[r.temperature] ?? [], color: "var(--terracotta)", unit: "°", own: true },
            ...(r.humidity
              ? [{ data: this.climate[r.humidity] ?? [], color: "var(--sky)", unit: " %", own: true }]
              : []),
          ]}
        ></fv1-area-chart>
      </section>
    `;
  }

  private activityCard() {
    const r = this.room!;
    const rows = [
      ...r.lights.map((l) => ({ label: l.name, spans: this.spans[l.entity] ?? [], color: "var(--amber)" })),
      ...r.covers.map((c) => ({
        label: c.name,
        spans: this.spans[c.entity] ?? [],
        color: "var(--sky)",
        active: ["open", "opening"],
      })),
    ];
    if (!rows.length) return nothing;
    const onMs = r.lights.reduce(
      (acc, l) =>
        acc +
        (this.spans[l.entity] ?? []).filter((s) => s.state === "on").reduce((a, s) => a + (s.to - s.from), 0),
      0,
    );
    return html`
      <section class="glass card" style="--d:1">
        <header class="card-head">
          <span class="ico">${icon(mdiChartTimelineVariant)}</span>
          <div class="grow ttl">
            <b>Actividad de hoy</b>
            <span>${r.lights.length ? `${fmt(onMs / 3600_000, 1)} h de luz acumuladas` : ""}</span>
          </div>
        </header>
        <fv1-timeline .rows=${rows} .from=${startOfToday().getTime()} .to=${Date.now()}></fv1-timeline>
      </section>
    `;
  }

  static styles = [
    shared,
    css`
      :host {
        position: absolute;
        inset: var(--space-3) var(--space-4) var(--dock-gap) var(--space-4);
        display: grid;
        grid-template-columns: var(--col-w) 1fr var(--col-w);
        grid-template-rows: auto 1fr;
        gap: var(--space-3);
        pointer-events: none;
      }
      .top {
        grid-column: 1 / -1;
        display: flex;
        align-items: center;
        gap: var(--space-3);
        pointer-events: auto;
        animation: rise 600ms var(--ease) both;
      }
      .back {
        width: 54px;
        height: 54px;
        border-radius: 50%;
      }
      .title {
        display: grid;
      }
      .eyebrow {
        font-size: var(--fs-label);
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--text-muted);
        text-shadow: 0 1px 8px var(--bg);
      }
      h1 {
        margin: 0;
        font-family: var(--font-display);
        font-weight: 400;
        font-size: var(--fs-hero);
        letter-spacing: -0.02em;
        line-height: 1.05;
        text-shadow: 0 2px 18px var(--bg);
      }
      .summary {
        display: flex;
        gap: 8px;
        margin-left: auto;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .glass-pill {
        font-size: var(--fs-small);
        padding: 8px 14px;
        background: var(--glass);
        backdrop-filter: blur(14px);
        border: 1px solid var(--glass-border);
        color: var(--text);
      }
      .glass-pill.lit svg {
        color: var(--amber);
      }
      .col {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        pointer-events: auto;
        min-height: 0;
        padding-bottom: 4px;
      }
      .col.right {
        grid-column: 3;
      }
      .card,
      .dev {
        animation: rise 700ms var(--ease) both;
        animation-delay: calc(var(--d) * 90ms + 250ms);
        flex: none;
      }
      .dev {
        background: var(--glass);
      }
      .dev.flash {
        animation: flash 1.6s var(--ease);
      }
      @keyframes flash {
        0%,
        100% {
          box-shadow: none;
        }
        25% {
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--amber) 55%, transparent);
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
      @media (max-width: 900px) {
        :host {
          position: static;
          display: flex;
          flex-direction: column;
          padding: 16px 16px 120px;
        }
        .top {
          flex-wrap: wrap;
        }
        .summary {
          margin-left: 0;
          justify-content: flex-start;
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "fv1-room": RoomView;
  }
}
