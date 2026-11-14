import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  mdiAlertCircleOutline,
  mdiArrowCollapseDown,
  mdiArrowCollapseUp,
  mdiBatteryHigh,
  mdiCheckCircleOutline,
  mdiChevronRight,
  mdiInformationOutline,
  mdiLightbulbGroupOutline,
  mdiLightbulbOffOutline,
  mdiShieldHomeOutline,
  mdiShieldLockOutline,
  mdiShieldOffOutline,
  mdiSolarPowerVariant,
  mdiThermometer,
  mdiWaterPercent,
  mdiWeatherCloudy,
  mdiWeatherFog,
  mdiWeatherLightning,
  mdiWeatherNight,
  mdiWeatherPartlyCloudy,
  mdiWeatherPouring,
  mdiWeatherRainy,
  mdiWeatherSnowy,
  mdiWeatherSunny,
  mdiWeatherWindy,
  mdiAlertOutline,
} from "@mdi/js";
import type { DashboardConfig, HomeAssistant } from "../types";
import { shared } from "../styles/tokens";
import { ALARM_ES, HVAC_ES, WEATHER_ES, call, fmt, icon, isOn, num, relTime, st } from "../lib/ha";
import { dailyTotals, hourlyMeans, type Point } from "../lib/data";
import { computeAlerts, roomName } from "../lib/alerts";
import { ALL_OFF_SCRIPT, ENERGY, PEOPLE, ROOMS_DEF } from "../house/rooms";
import "../charts/charts";

export const WEATHER_ICON: Record<string, string> = {
  "clear-night": mdiWeatherNight,
  cloudy: mdiWeatherCloudy,
  fog: mdiWeatherFog,
  lightning: mdiWeatherLightning,
  "lightning-rainy": mdiWeatherLightning,
  partlycloudy: mdiWeatherPartlyCloudy,
  pouring: mdiWeatherPouring,
  rainy: mdiWeatherRainy,
  snowy: mdiWeatherSnowy,
  sunny: mdiWeatherSunny,
  windy: mdiWeatherWindy,
};

const PV_TOTAL = "sensor.david_lopez_perez_daily_pv_generation";
const LOAD_TOTAL = "sensor.david_lopez_perez_home_consumption_today";
const INDOOR_T = "sensor.shelly_salon_sur_temperatura";
const INDOOR_H = "sensor.shelly_salon_sur_humedad";
const HVAC = "climate.aidoo_28_cc_ff_82_82_6f";

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** Paneles de la vista general, a izquierda y derecha de la imagen de la casa. */
@customElement("fv1-home")
export class HomeView extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ attribute: false }) config?: DashboardConfig;
  @state() private days: Record<string, Point[]> = {};
  @state() private hours: Record<string, Point[]> = {};
  @state() private armed?: string;
  @state() private now = new Date();
  private timers: number[] = [];

  connectedCallback(): void {
    super.connectedCallback();
    this.timers = [
      window.setInterval(() => (this.now = new Date()), 20_000),
      window.setInterval(() => this.load(), 10 * 60_000),
    ];
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.timers.forEach((t) => window.clearInterval(t));
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("hass") && !changed.get("hass") && this.hass) this.load();
  }

  private async load(): Promise<void> {
    if (!this.hass) return;
    try {
      this.days = await dailyTotals(this.hass, [PV_TOTAL, LOAD_TOTAL], 7);
    } catch (err) {
      console.warn("[functional-v1] energía diaria", err);
    }
    try {
      this.hours = await hourlyMeans(this.hass, [ENERGY.sensors.soc, INDOOR_T], 24);
    } catch (err) {
      console.warn("[functional-v1] medias horarias", err);
    }
  }

  private confirm(key: string, action: () => void): void {
    if (this.armed === key) {
      this.armed = undefined;
      action();
      return;
    }
    this.armed = key;
    window.setTimeout(() => this.armed === key && (this.armed = undefined), 4000);
  }

  private go(room: string) {
    this.dispatchEvent(new CustomEvent("go", { detail: room, bubbles: true, composed: true }));
  }

  render() {
    return html`
      <aside class="col left scroll">${this.greeting()} ${this.energy()} ${this.battery()}</aside>
      <aside class="col right scroll">
        ${this.security()} ${this.alerts()} ${this.climate()} ${this.quick()}
      </aside>
    `;
  }

  private greeting() {
    const h = this.now.getHours();
    const hello =
      h < 6 ? "Buenas noches" : h < 13 ? "Buenos días" : h < 21 ? "Buenas tardes" : "Buenas noches";
    const w = st(this.hass, this.config?.weather);
    const temp = w?.attributes.temperature as number | undefined;
    const people = PEOPLE.map((p) => st(this.hass, p)).filter((p) => p);
    const home = people.filter((p) => p!.state === "home");
    return html`
      <section class="glass card hello" style="--d:0">
        <span class="muted date">
          ${cap(this.now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }))}
        </span>
        <h1>${hello}</h1>
        <div class="row">
          <b class="clock num"
            >${this.now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</b
          >
          ${
            w
              ? html`<span class="weather">
                  ${icon(WEATHER_ICON[w.state] ?? mdiWeatherPartlyCloudy)}
                  <b class="num">${fmt(temp, 0)}°</b>
                  <span class="muted">${WEATHER_ES[w.state] ?? w.state}</span>
                </span>`
              : nothing
          }
        </div>
        <div class="people">
          ${people.map((p) => {
            const name = String(p!.attributes.friendly_name ?? "").split(" ")[0];
            return html`<span class="avatar ${p!.state === "home" ? "in" : ""}" title=${name}
              >${name.slice(0, 1)}</span
            >`;
          })}
          <span class="muted">
            ${home.length === 0 ? "No hay nadie en casa" : home.length === people.length ? "Todos en casa" : `${home.length} en casa`}
          </span>
        </div>
      </section>
    `;
  }

  private energy() {
    const s = ENERGY.sensors;
    const pv = num(this.hass, s.pv) ?? 0;
    const today = num(this.hass, "sensor.david_lopez_perez_daily_pv_generation");
    const used = num(this.hass, "sensor.david_lopez_perez_home_consumption_today");
    const pvDays = this.days[PV_TOTAL] ?? [];
    const loadDays = this.days[LOAD_TOTAL] ?? [];
    const todayKey = new Date().toDateString();
    const bars = pvDays.map(([t, v]) => {
      const d = new Date(t);
      const l = loadDays.find(([lt]) => new Date(lt).toDateString() === d.toDateString())?.[1] ?? 0;
      const isToday = d.toDateString() === todayKey;
      return {
        label: DAYS[d.getDay()],
        values: [isToday && today !== undefined ? today : v, isToday && used !== undefined ? used : l],
        current: isToday,
      };
    });
    // Autosuficiencia: parte del consumo de hoy que no se ha comprado a la red
    const imported = num(this.hass, "sensor.david_lopez_perez_grid_import_today");
    const self =
      used && imported !== undefined ? Math.max(0, Math.round((1 - imported / used) * 100)) : undefined;
    return html`
      <section class="glass card" style="--d:1" @click=${() => this.go("lavadero")}>
        <header class="card-head">
          <span class="ico sun">${icon(mdiSolarPowerVariant)}</span>
          <span class="grow">Energía hoy</span>
          <span class="pill ${pv > 0.05 ? "warn" : ""}">${pv > 0.05 ? `☀ ${fmt(pv, 2)} kW` : "Sin sol"}</span>
        </header>
        <div class="kpis">
          <div>
            <span class="kpi">${fmt(today, 1)}<small>kWh</small></span
            ><span class="muted lbl">producidos</span>
          </div>
          <div>
            <span class="kpi soft">${fmt(used, 1)}<small>kWh</small></span
            ><span class="muted lbl">consumidos</span>
          </div>
        </div>
        <fv1-bar-chart
          .bars=${bars}
          .colors=${["var(--amber)", "var(--terracotta)"]}
          .height=${104}
        ></fv1-bar-chart>
        <div class="legend">
          <span><i style="background:var(--amber)"></i>Solar</span>
          <span><i style="background:var(--terracotta)"></i>Consumo</span>
          ${self !== undefined ? html`<span class="grow-r muted">Autosuficiencia ${self} %</span>` : nothing}
        </div>
      </section>
    `;
  }

  private battery() {
    const s = ENERGY.sensors;
    const soc = num(this.hass, s.soc) ?? 0;
    const p = num(this.hass, s.battery) ?? 0;
    const stored = num(this.hass, "sensor.david_lopez_perez_battery_stored_energy");
    const cap = num(this.hass, "sensor.david_lopez_perez_battery_total_capacity");
    const load = num(this.hass, s.load) ?? 0;
    const hoursLeft = p < -0.05 && stored ? stored / Math.abs(p) : undefined;
    const color = soc < 20 ? "var(--danger)" : soc < 45 ? "var(--amber)" : "var(--sage)";
    return html`
      <section class="glass card" style="--d:2" @click=${() => this.go("lavadero")}>
        <header class="card-head">
          <span class="ico">${icon(mdiBatteryHigh)}</span>
          <span class="grow">Batería</span>
          <span class="pill ${p > 0.05 ? "ok" : p < -0.05 ? "warn" : ""}">
            ${p > 0.05 ? `▲ Cargando ${fmt(p, 2)} kW` : p < -0.05 ? `▼ ${fmt(-p, 2)} kW` : "En reposo"}
          </span>
        </header>
        <div class="bat">
          <fv1-ring .value=${soc} .size=${112} .stroke=${10} .color=${color}>
            <div class="ring-in"><b class="num">${Math.round(soc)}%</b><span class="faint">carga</span></div>
          </fv1-ring>
          <div class="bat-txt">
            <span><b class="num">${fmt(stored, 1)}</b> <span class="muted">de ${fmt(cap, 1)} kWh</span></span>
            <span class="muted">Casa: <b class="num">${fmt(load, 2)} kW</b></span>
            ${hoursLeft !== undefined ? html`<span class="muted">Autonomía ≈ <b class="num">${fmt(hoursLeft, 0)} h</b></span>` : nothing}
          </div>
        </div>
        <fv1-area-chart
          .height=${70}
          .digits=${0}
          .series=${[{ data: this.hours[s.soc] ?? [], color, unit: " %" }]}
        ></fv1-area-chart>
      </section>
    `;
  }

  private security() {
    const id = this.config?.alarm;
    const a = st(this.hass, id);
    const state = a?.state ?? "unavailable";
    const armed = state.startsWith("armed");
    const triggered = state === "triggered";
    const gates = ROOMS_DEF.flatMap((r) => r.devices).flatMap((d) => (d.type === "gates" ? d.gates : []));
    const openGates = gates.filter((g) => isOn(this.hass, g.entity));
    const door = st(this.hass, "binary_sensor.sensor_puerta_principal_contact");
    const cams = ROOMS_DEF.flatMap((r) => r.devices).flatMap((d) => (d.type === "cameras" ? d.cameras : []));
    const motion = cams.filter((c) => isOn(this.hass, c.person) || isOn(this.hass, c.motion));
    return html`
      <section class="glass card sec ${triggered ? "alarm" : armed ? "armed" : ""}" style="--d:0">
        <header class="card-head">
          <span class="ico"
            >${icon(triggered ? mdiAlertOutline : armed ? mdiShieldLockOutline : mdiShieldOffOutline)}</span
          >
          <div class="grow ttl">
            <b>Alarma</b>
            <span>${ALARM_ES[state] ?? state}${a ? ` · ${relTime(a.last_changed)}` : ""}</span>
          </div>
          ${
            a
              ? html`<button
                  class="btn ${this.armed === "alarm" ? "armed" : armed || triggered ? "danger" : "primary"}"
                  @click=${() =>
                    this.confirm("alarm", () =>
                      call(
                        this.hass,
                        "alarm_control_panel",
                        armed || triggered ? "alarm_disarm" : "alarm_arm_away",
                        { entity_id: id },
                      ),
                    )}
                >
                  ${icon(armed ? mdiShieldOffOutline : mdiShieldHomeOutline)}
                  ${this.armed === "alarm" ? "¿Seguro?" : armed || triggered ? "Desconectar" : "Conectar"}
                </button>`
              : nothing
          }
        </header>
        <div class="sec-grid">
          <div class="mini-stat ${openGates.length ? "warn" : ""}" @click=${() => this.go("exterior")}>
            <span class="faint">Puertas calle</span>
            <b
              >${openGates.length ? `${openGates.length} abierta${openGates.length > 1 ? "s" : ""}` : "Cerradas"}</b
            >
          </div>
          <div class="mini-stat ${door?.state === "on" ? "warn" : ""}" @click=${() => this.go("entrada")}>
            <span class="faint">Puerta casa</span>
            <b
              >${!door || door.state === "unavailable" ? "—" : door.state === "on" ? "Abierta" : "Cerrada"}</b
            >
          </div>
          <div class="mini-stat ${motion.length ? "info" : ""}" @click=${() => this.go("exterior")}>
            <span class="faint">Cámaras</span>
            <b>${motion.length ? `${motion.length} con movimiento` : "Tranquilo"}</b>
          </div>
        </div>
      </section>
    `;
  }

  private alerts() {
    const list = computeAlerts(this.hass, this.config?.alarm);
    const ICON = { bad: mdiAlertCircleOutline, warn: mdiAlertOutline, info: mdiInformationOutline };
    return html`
      <section class="glass card" style="--d:1">
        <header class="card-head">
          <span class="ico ${list.length ? "" : "ok"}"
            >${icon(list.length ? mdiAlertCircleOutline : mdiCheckCircleOutline)}</span
          >
          <span class="grow">Avisos</span>
          ${list.length ? html`<span class="pill ${list[0].level}">${list.length}</span>` : nothing}
        </header>
        ${
          list.length === 0
            ? html`<p class="calm">Todo en orden. Nada que atender ahora mismo.</p>`
            : html`<div class="alerts">
                ${list.slice(0, 5).map(
                  (al) =>
                    html`<div class="alert ${al.level}" @click=${() => al.room && this.go(al.room)}>
                      <span class="a-ico">${icon(ICON[al.level])}</span>
                      <div class="a-txt">
                        <b>${al.title}</b>
                        <span class="muted">
                          ${[al.detail, roomName(al.room), al.since ? relTime(al.since) : ""].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                      ${al.room ? icon(mdiChevronRight) : nothing}
                    </div>`,
                )}
                ${list.length > 5 ? html`<span class="muted more">y ${list.length - 5} más…</span>` : nothing}
              </div>`
        }
      </section>
    `;
  }

  private climate() {
    const t = num(this.hass, INDOOR_T);
    const hum = num(this.hass, INDOOR_H);
    const hv = st(this.hass, HVAC);
    const w = st(this.hass, this.config?.weather);
    const out = w?.attributes.temperature as number | undefined;
    const mode = hv?.state ?? "off";
    return html`
      <section class="glass card" style="--d:2" @click=${() => this.go("salon")}>
        <header class="card-head">
          <span class="ico">${icon(mdiThermometer)}</span>
          <span class="grow">Clima interior</span>
          <span class="pill ${mode === "off" ? "" : mode === "heat" ? "warn" : "info"}">
            ${mode === "off" ? "Aire apagado" : `${HVAC_ES[mode] ?? mode} → ${fmt(hv?.attributes.temperature as number, 0)}°`}
          </span>
        </header>
        <div class="kpis">
          <div>
            <span class="kpi">${fmt(t, 1)}<small>°C</small></span
            ><span class="muted lbl">salón</span>
          </div>
          <div>
            <span class="kpi soft">${fmt(hum, 0)}<small>%</small></span>
            <span class="muted lbl">${icon(mdiWaterPercent)} humedad</span>
          </div>
          ${
            out !== undefined
              ? html`<div>
                  <span class="kpi soft">${fmt(out, 0)}<small>°</small></span
                  ><span class="muted lbl">fuera</span>
                </div>`
              : nothing
          }
        </div>
        <fv1-area-chart
          .height=${70}
          .series=${[{ data: this.hours[INDOOR_T] ?? [], color: "var(--terracotta)", unit: "°" }]}
        ></fv1-area-chart>
      </section>
    `;
  }

  private quick() {
    const lights = ROOMS_DEF.flatMap((r) => r.lights.map((l) => l.entity));
    const on = lights.filter((l) => isOn(this.hass, l));
    const covers = ROOMS_DEF.flatMap((r) => r.covers.map((c) => c.entity));
    const pos = covers
      .map((c) => st(this.hass, c)?.attributes.current_position as number | undefined)
      .filter((p): p is number => typeof p === "number");
    const avg = pos.length ? Math.round(pos.reduce((a, b) => a + b, 0) / pos.length) : undefined;
    return html`
      <section class="glass card" style="--d:3">
        <header class="card-head">
          <span class="ico amber">${icon(mdiLightbulbGroupOutline)}</span>
          <span class="grow">Toda la casa</span>
        </header>
        <div class="kpis">
          <div>
            <span class="kpi">${on.length}<small>/ ${lights.length}</small></span
            ><span class="muted lbl">luces encendidas</span>
          </div>
          <div>
            <span class="kpi soft">${avg ?? "—"}<small>%</small></span
            ><span class="muted lbl">persianas abiertas</span>
          </div>
        </div>
        <div class="actions">
          <button
            class="btn ${this.armed === "off" ? "armed" : ""}"
            @click=${() =>
              this.confirm("off", () =>
                this.hass?.states[ALL_OFF_SCRIPT]
                  ? call(this.hass, "script", "turn_on", { entity_id: ALL_OFF_SCRIPT })
                  : call(this.hass, "light", "turn_off", { entity_id: on }),
              )}
          >
            ${icon(mdiLightbulbOffOutline)} ${this.armed === "off" ? "¿Seguro?" : "Apagar"}
          </button>
          <button
            class="btn ${this.armed === "up" ? "armed" : ""}"
            @click=${() => this.confirm("up", () => call(this.hass, "cover", "open_cover", { entity_id: covers }))}
          >
            ${icon(mdiArrowCollapseUp)} ${this.armed === "up" ? "¿Seguro?" : "Subir"}
          </button>
          <button
            class="btn ${this.armed === "down" ? "armed" : ""}"
            @click=${() => this.confirm("down", () => call(this.hass, "cover", "close_cover", { entity_id: covers }))}
          >
            ${icon(mdiArrowCollapseDown)} ${this.armed === "down" ? "¿Seguro?" : "Bajar"}
          </button>
        </div>
      </section>
    `;
  }

  static styles = [
    shared,
    css`
      :host {
        position: absolute;
        inset: var(--top-gap) var(--space-4) var(--dock-gap) var(--space-4);
        display: flex;
        justify-content: space-between;
        pointer-events: none;
      }
      .col {
        width: var(--col-w);
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        pointer-events: auto;
        padding-bottom: 4px;
      }
      .card {
        animation: rise 700ms var(--ease) both;
        animation-delay: calc(var(--d) * 90ms + 150ms);
      }
      h1 {
        margin: 0;
        font-family: var(--font-display);
        font-weight: 400;
        font-size: var(--fs-hero);
        letter-spacing: -0.02em;
        line-height: 1;
      }
      .date {
        font-size: var(--fs-small);
      }
      .hello .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .clock {
        font-size: var(--fs-kpi);
        font-weight: 300;
        letter-spacing: -0.03em;
      }
      .weather {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: var(--fs-small);
        padding: 8px 12px;
        border-radius: 999px;
        background: var(--chip);
      }
      .weather svg {
        color: var(--amber);
      }
      .people {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: var(--fs-small);
      }
      .avatar {
        display: grid;
        place-items: center;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        font-weight: 700;
        font-size: 13px;
        background: var(--chip-strong);
        color: var(--text-faint);
        margin-right: -2px;
      }
      .avatar.in {
        background: var(--sage);
        color: #fff;
        box-shadow: 0 0 0 2px var(--glass-strong);
      }
      .people .muted {
        margin-left: 8px;
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
      .ico.sun {
        background: var(--amber-soft);
        color: var(--amber);
      }
      .ico.amber {
        background: var(--amber-soft);
        color: var(--amber);
      }
      .ico.ok {
        background: var(--sage-soft);
        color: var(--sage);
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
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: var(--fs-label);
      }
      .legend {
        display: flex;
        gap: 14px;
        font-size: var(--fs-label);
        color: var(--text-muted);
      }
      .legend i {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 3px;
        margin-right: 5px;
      }
      .grow-r {
        margin-left: auto;
      }
      .bat {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }
      .ring-in {
        display: grid;
        font-size: var(--fs-label);
      }
      .ring-in b {
        font-size: 26px;
        font-weight: 600;
      }
      .bat-txt {
        display: grid;
        gap: 6px;
        font-size: var(--fs-small);
      }
      .bat-txt b {
        font-weight: 700;
      }
      .sec.armed {
        background: color-mix(in srgb, var(--terracotta) 16%, var(--glass));
      }
      .sec.alarm {
        background: color-mix(in srgb, var(--danger) 26%, var(--glass));
        animation:
          rise 700ms var(--ease) both,
          alarm 1.4s ease-in-out infinite;
      }
      @keyframes alarm {
        50% {
          box-shadow: 0 0 0 6px var(--danger-soft);
        }
      }
      .sec-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
      }
      .mini-stat {
        display: grid;
        gap: 2px;
        padding: 8px 10px;
        border-radius: 12px;
        background: var(--chip);
        font-size: var(--fs-label);
        cursor: pointer;
      }
      .mini-stat b {
        font-size: var(--fs-small);
      }
      .mini-stat.warn {
        background: var(--amber-soft);
      }
      .mini-stat.info {
        background: var(--sky-soft);
      }
      .calm {
        margin: 0;
        font-size: var(--fs-small);
        color: var(--text-muted);
        font-family: var(--font-display);
        font-style: italic;
      }
      .alerts {
        display: grid;
        gap: 6px;
      }
      .alert {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border-radius: 12px;
        background: var(--chip);
        cursor: pointer;
        font-size: var(--fs-small);
      }
      .alert .a-ico {
        display: grid;
        place-items: center;
        color: var(--sky);
      }
      .alert.warn .a-ico {
        color: var(--terracotta);
      }
      .alert.bad {
        background: var(--danger-soft);
      }
      .alert.bad .a-ico {
        color: var(--danger);
      }
      .a-txt {
        flex: 1;
        display: grid;
        min-width: 0;
      }
      .a-txt b,
      .a-txt span {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .a-txt span {
        font-size: var(--fs-label);
      }
      .more {
        font-size: var(--fs-label);
        padding-left: 6px;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .actions {
        display: flex;
        gap: 6px;
      }
      .actions .btn {
        flex: 1;
        padding: 10px 8px;
        white-space: nowrap;
      }
      @media (max-width: 900px) {
        :host {
          position: static;
          flex-direction: column;
          gap: var(--space-3);
          padding: 0 16px 120px;
        }
        .col {
          width: 100%;
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "fv1-home": HomeView;
  }
}
