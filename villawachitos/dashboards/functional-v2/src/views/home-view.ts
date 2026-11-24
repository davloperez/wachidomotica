import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  mdiAlertCircleOutline,
  mdiArrowCollapseDown,
  mdiArrowCollapseUp,
  mdiBatteryHigh,
  mdiCheckCircleOutline,
  mdiChevronRight,
  mdiFormatListChecks,
  mdiInformationOutline,
  mdiLightbulbGroupOutline,
  mdiLightbulbOffOutline,
  mdiShieldHomeOutline,
  mdiShieldLockOutline,
  mdiShieldOffOutline,
  mdiSilverwareForkKnife,
  mdiSolarPowerVariant,
  mdiThermometer,
  mdiVideoOutline,
  mdiViewGridOutline,
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
import type { DashboardConfig, HassEntity, HomeAssistant } from "../types";
import { shared } from "../styles/tokens";
import {
  ALARM_ES,
  HVAC_ES,
  WEATHER_ES,
  call,
  fmt,
  icon,
  isOn,
  isUnavailable,
  num,
  relTime,
  st,
} from "../lib/ha";
import "../widgets/cam-thumb";
import { allCameras } from "../lib/cameras";
import { dailyTotals, hourlyMeans, type Point } from "../lib/data";
import { computeAlerts, roomName } from "../lib/alerts";
import { ALL_OFF_SCRIPT, ENERGY, ROOMS_DEF } from "../house/rooms";
import { subscribeForecast, type Forecast } from "../lib/weather";
import { MEAL_ES, addDays, fetchMealplan, mealName, ymd, type MealEntry } from "../lib/meals";
import "../charts/charts";
import "../widgets/alarm-keypad";

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
const HVAC = "climate.aidoo_28_cc_ff_82_82_6f";
/** Modo silencioso de la alarma: sin sirenas ni avisos sonoros, solo Telegram. */
const SILENT_MODE = "input_boolean.alarma_modo_silencioso";
/** Horario de la conexión automática en modo Noche (automatización «Alarma: horario de noche»). */
const NIGHT_ON = "input_datetime.alarma_noche_conectar";
const NIGHT_OFF = "input_datetime.alarma_noche_desconectar";
const hhmm = (v?: string) => (v && /^\d{2}:\d{2}/.test(v) ? v.slice(0, 5) : "—");

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** Tarjetas de la vista general, debajo (o al lado) del plano de la casa. */
const CAMERAS = allCameras();

@customElement("fv2-home")
export class HomeView extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ attribute: false }) config?: DashboardConfig;
  @state() private days: Record<string, Point[]> = {};
  @state() private hours: Record<string, Point[]> = {};
  @state() private armed?: string;
  @state() private now = new Date();
  @state() private keypad = false;
  @state() private daily: Forecast[] = [];
  @state() private hourly: Forecast[] = [];
  @state() private meals: MealEntry[] = [];
  private timers: number[] = [];
  private forecastOff: (() => void)[] = [];

  connectedCallback(): void {
    super.connectedCallback();
    this.timers = [
      window.setInterval(() => (this.now = new Date()), 20_000),
      // Cuenta atrás de la alarma (conectando / prealarma): refresco cada segundo solo mientras dura.
      window.setInterval(() => {
        const s = st(this.hass, this.config?.alarm)?.state;
        if (s === "arming" || s === "pending") this.now = new Date();
      }, 1_000),
      window.setInterval(() => this.load(), 10 * 60_000),
    ];
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.timers.forEach((t) => window.clearInterval(t));
    this.forecastOff.forEach((off) => off());
    this.forecastOff = [];
  }

  /** Suscripción a la previsión diaria y por horas de la entidad `weather` (se renueva sola). */
  private async subscribeWeather(): Promise<void> {
    const entity = this.config?.weather;
    if (!this.hass || !entity) return;
    const h = this.hass;
    const subs = await Promise.all([
      subscribeForecast(h, entity, "daily", (l) => (this.daily = l)),
      subscribeForecast(h, entity, "hourly", (l) => (this.hourly = l)),
    ]);
    this.forecastOff = subs.filter((x): x is () => void => !!x);
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("hass") && !changed.get("hass") && this.hass) {
      this.load();
      void this.subscribeWeather();
    }
  }

  private async load(): Promise<void> {
    if (!this.hass) return;
    try {
      this.days = await dailyTotals(this.hass, [PV_TOTAL, LOAD_TOTAL], 7);
    } catch (err) {
      console.warn("[functional-v2] energía diaria", err);
    }
    const mealie = this.config?.mealie;
    if (mealie) {
      try {
        const today = new Date();
        this.meals = await fetchMealplan(this.hass, mealie, today, addDays(today, 1));
      } catch (err) {
        console.warn("[functional-v2] menú de comidas", err);
      }
    }
    try {
      this.hours = await hourlyMeans(this.hass, [ENERGY.sensors.soc, ENERGY.sensors.pv], 24);
    } catch (err) {
      console.warn("[functional-v2] medias horarias", err);
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
      <div class="col">${this.greeting()} ${this.alerts()} ${this.security()} ${this.quick()}</div>
      <div class="col">${this.menu()} ${this.climate()} ${this.energy()} ${this.battery()}</div>
    `;
  }

  private greeting() {
    const h = this.now.getHours();
    const hello =
      h < 6 ? "Buenas noches" : h < 13 ? "Buenos días" : h < 21 ? "Buenas tardes" : "Buenas noches";
    const w = st(this.hass, this.config?.weather);
    const temp = w?.attributes.temperature as number | undefined;
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
              ? html`<span
                  class="weather"
                  title="Más información"
                  @click=${() => this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: w.entity_id }, bubbles: true, composed: true }))}
                >
                  ${icon(WEATHER_ICON[w.state] ?? mdiWeatherPartlyCloudy)}
                  <b class="num">${fmt(temp, 0)}°</b>
                  <span class="muted">${WEATHER_ES[w.state] ?? w.state}</span>
                </span>`
              : nothing
          }
        </div>
        ${this.forecast()}
      </section>
    `;
  }

  /** Previsión de hoy (próximas horas) y de los siguientes días. */
  private forecast() {
    const today = this.now.toDateString();
    const hours = this.hourly
      .filter((f) => {
        const d = new Date(f.datetime);
        return d.toDateString() === today && d.getTime() >= this.now.getTime() - 3_600_000;
      })
      .filter((_, i) => i % 3 === 0)
      .slice(0, 6);
    const days = this.daily.filter((f) => new Date(f.datetime).toDateString() !== today).slice(0, 5);
    const td = this.daily.find((f) => new Date(f.datetime).toDateString() === today);
    if (!hours.length && !days.length && !td) return nothing;
    const rain = (f: Forecast) =>
      f.precipitation_probability
        ? html`<span class="rain">${Math.round(f.precipitation_probability)}%</span>`
        : nothing;
    return html`
      <div class="fc">
        <div class="fc-head muted">
          ${
            td
              ? html`<span class="num"
                  >Hoy ${fmt(td.templow, 0)}° / <b>${fmt(td.temperature, 0)}°</b>${
                    td.precipitation_probability
                      ? html` · ☂ ${Math.round(td.precipitation_probability)}%`
                      : nothing
                  }</span
                >`
              : nothing
          }
        </div>
        ${
          hours.length
            ? html`<div class="fc-row">
                ${hours.map(
                  (f) =>
                    html`<div class="fc-it">
                      <span class="faint">${new Date(f.datetime).getHours()}h</span>
                      ${icon(WEATHER_ICON[f.condition ?? ""] ?? mdiWeatherPartlyCloudy)}
                      <b class="num">${fmt(f.temperature, 0)}°</b>
                      ${rain(f)}
                    </div>`,
                )}
              </div>`
            : nothing
        }
        ${
          days.length
            ? html`<div class="fc-row days">
                ${days.map(
                  (f) =>
                    html`<div class="fc-it">
                      <span class="faint">${DAYS[new Date(f.datetime).getDay()]}</span>
                      ${icon(WEATHER_ICON[f.condition ?? ""] ?? mdiWeatherPartlyCloudy)}
                      <b class="num">${fmt(f.temperature, 0)}°</b>
                      <span class="faint num">${fmt(f.templow, 0)}°</span>
                      ${rain(f)}
                    </div>`,
                )}
              </div>`
            : nothing
        }
      </div>
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
        <fv2-bar-chart
          .bars=${bars}
          .colors=${["var(--amber)", "var(--terracotta)"]}
          .height=${104}
        ></fv2-bar-chart>
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
          <fv2-ring .value=${soc} .size=${112} .stroke=${10} .color=${color}>
            <div class="ring-in"><b class="num">${Math.round(soc)}%</b><span class="faint">carga</span></div>
          </fv2-ring>
          <div class="bat-txt">
            <span><b class="num">${fmt(stored, 1)}</b> <span class="muted">de ${fmt(cap, 1)} kWh</span></span>
            <span class="muted">Casa: <b class="num">${fmt(load, 2)} kW</b></span>
            ${hoursLeft !== undefined ? html`<span class="muted">Autonomía ≈ <b class="num">${fmt(hoursLeft, 0)} h</b></span>` : nothing}
          </div>
        </div>
        <fv2-area-chart
          .height=${70}
          .digits=${0}
          .series=${[{ data: this.hours[s.soc] ?? [], color, unit: " %" }]}
        ></fv2-area-chart>
        <span class="faint chart-lbl">${icon(mdiSolarPowerVariant)} Generación solar · 24 h</span>
        <fv2-area-chart
          .height=${70}
          .digits=${1}
          .trend=${false}
          .series=${[{ data: this.hours[s.pv] ?? [], color: "var(--amber)", unit: " kW" }]}
        ></fv2-area-chart>
      </section>
    `;
  }

  /** Botones de la alarma: conectar (Noche / Ausente) sin código; desconectar con PIN si Alarmo lo pide. */
  private alarmActions(id: string, a: HassEntity) {
    const state = a.state;
    const svc = (service: string) => call(this.hass, "alarm_control_panel", service, { entity_id: id });
    if (state === "disarmed")
      return html`<div class="alarm-btns">
        <button
          class="btn ${this.armed === "night" ? "armed" : "primary"}"
          @click=${() => this.confirm("night", () => svc("alarm_arm_night"))}
        >
          ${icon(mdiWeatherNight)} ${this.armed === "night" ? "¿Seguro?" : "Noche"}
        </button>
        <button
          class="btn ${this.armed === "away" ? "armed" : "primary"}"
          @click=${() => this.confirm("away", () => svc("alarm_arm_away"))}
        >
          ${icon(mdiShieldHomeOutline)} ${this.armed === "away" ? "¿Seguro?" : "Ausente"}
        </button>
      </div>`;
    if (state === "unavailable" || state === "unknown") return nothing;
    // Con código configurado en Alarmo (`code_format`), se abre el teclado; sin código, se confirma con un toque.
    const needsCode = !!a.attributes.code_format;
    return html`<button
      class="btn ${this.armed === "alarm" ? "armed" : "danger"}"
      @click=${() => (needsCode ? (this.keypad = true) : this.confirm("alarm", () => svc("alarm_disarm")))}
    >
      ${icon(mdiShieldOffOutline)}
      ${this.armed === "alarm" ? "¿Seguro?" : state === "arming" ? "Cancelar" : "Desconectar"}
    </button>`;
  }

  /** Segundos que quedan de la cuenta atrás de Alarmo (salida o entrada), o undefined. */
  private countdown(a: HassEntity): number | undefined {
    const delay = Number(a.attributes.delay);
    if (!delay || (a.state !== "arming" && a.state !== "pending")) return undefined;
    const left = delay - (this.now.getTime() - new Date(a.last_changed).getTime()) / 1000;
    return Math.max(0, Math.round(left));
  }

  private security() {
    const id = this.config?.alarm;
    const a = st(this.hass, id);
    const state = a?.state ?? "unavailable";
    const armed = state.startsWith("armed");
    const triggered = state === "triggered";
    const pending = state === "pending";
    const left = a ? this.countdown(a) : undefined;
    const silent = isOn(this.hass, SILENT_MODE);
    const names = (v: unknown): string[] =>
      (Array.isArray(v) ? v : v && typeof v === "object" ? Object.keys(v) : []).map((e) =>
        String(st(this.hass, String(e))?.attributes.friendly_name ?? e),
      );
    const openNames = names(a?.attributes.open_sensors);
    const bypassed = names(a?.attributes.bypassed_sensors);
    const gates = ROOMS_DEF.flatMap((r) => r.devices).flatMap((d) => (d.type === "gates" ? d.gates : []));
    const door = st(this.hass, "binary_sensor.sensor_puerta_principal_contact");
    const cams = ROOMS_DEF.flatMap((r) => r.devices).flatMap((d) => (d.type === "cameras" ? d.cameras : []));
    const motion = cams.filter((c) => isOn(this.hass, c.person) || isOn(this.hass, c.motion));
    return html`
      <section class="glass card sec ${triggered || pending ? "alarm" : armed ? "armed" : ""}" style="--d:0">
        <header class="card-head">
          <span class="ico"
            >${icon(triggered || pending ? mdiAlertOutline : armed ? mdiShieldLockOutline : mdiShieldOffOutline)}</span
          >
          <div class="grow ttl">
            <b>Alarma</b>
            <span
              >${ALARM_ES[state] ?? state}${left !== undefined ? ` · ${left} s` : a ? ` · ${relTime(a.last_changed)}` : ""}</span
            >
          </div>
          ${a && id ? this.alarmActions(id, a) : nothing}
        </header>
        ${
          pending
            ? html`<p class="alarm-note">
                Prealarma: desconecta antes de ${left ?? 0} s si es una falsa alarma.
              </p>`
            : nothing
        }
        ${
          (pending || triggered) && openNames.length
            ? html`<p class="alarm-note">Detectado: ${openNames.join(", ")}</p>`
            : nothing
        }
        ${armed && bypassed.length ? html`<p class="alarm-note muted">Sin vigilar: ${bypassed.join(", ")}</p>` : nothing}
        ${
          this.keypad && id
            ? html`<fv2-alarm-keypad
                .hass=${this.hass}
                .entity=${id}
                @close=${() => (this.keypad = false)}
              ></fv2-alarm-keypad>`
            : nothing
        }
        <div class="sec-grid">
          ${gates.map((g) => {
            const e = st(this.hass, g.entity);
            const open = e?.state === "on";
            return html`<div class="mini-stat ${open ? "warn" : ""}" @click=${() => this.go("exterior")}>
              <span class="faint">${g.name}</span>
              <b>${!e || isUnavailable(e) ? "—" : open ? "Abierta" : "Cerrada"}</b>
            </div>`;
          })}
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
        <div class="cam-head">
          <span class="faint">${icon(mdiVideoOutline)} Cámaras</span>
          <button class="chip" @click=${() => this.openCameras(CAMERAS[0]?.entity, "grid")}>
            ${icon(mdiViewGridOutline)} Ver todas
          </button>
        </div>
        <div class="cam-strip">
          ${CAMERAS.map(
            (c) =>
              html`<button
                class="cam-tile"
                aria-label="Ver ${c.name} en directo"
                @click=${() => this.openCameras(c.entity)}
              >
                <fv2-cam-thumb
                  .hass=${this.hass}
                  .entity=${c.entity}
                  .name=${c.name}
                  .interval=${30}
                  .alert=${isOn(this.hass, c.person) ? "person" : isOn(this.hass, c.motion) ? "motion" : ""}
                ></fv2-cam-thumb>
              </button>`,
          )}
        </div>
        <div class="sec-foot">
          <span class="faint"
            >${icon(mdiWeatherNight)} Noche automática ${hhmm(st(this.hass, NIGHT_ON)?.state)} →
            ${hhmm(st(this.hass, NIGHT_OFF)?.state)}</span
          >
          <button
            class="chip ${silent ? "on" : ""}"
            title="Sin sirenas ni avisos sonoros; solo Telegram"
            @click=${() => call(this.hass, "input_boolean", "toggle", { entity_id: SILENT_MODE })}
          >
            ${silent ? "Silenciosa" : "Con sirena"}
          </button>
        </div>
      </section>
    `;
  }

  /** Abre el visor de cámaras a pantalla completa (lo muestra el panel raíz). */
  private openCameras(entity: string | undefined, mode: "single" | "grid" = "single") {
    if (!entity) return;
    this.dispatchEvent(
      new CustomEvent("open-cameras", { detail: { entity, mode }, bubbles: true, composed: true }),
    );
  }

  private alerts() {
    const list = computeAlerts(this.hass, this.config?.alarm, this.config?.weather_alerts);
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
        <button
          class="btn all-alerts"
          @click=${() => this.dispatchEvent(new CustomEvent("open-alerts", { bubbles: true, composed: true }))}
        >
          ${icon(mdiFormatListChecks)} Ver todos los avisos
        </button>
      </section>
    `;
  }

  /** Comida y cena de hoy y de mañana (lo planificado en Mealie). Tocar una receta la abre en la hoja del menú. */
  private menu() {
    if (!this.config?.mealie) return nothing;
    const open = (slug?: string) =>
      this.dispatchEvent(new CustomEvent("open-meals", { detail: { slug }, bubbles: true, composed: true }));
    const days = [
      { label: "Hoy", key: ymd(this.now) },
      { label: "Mañana", key: ymd(addDays(this.now, 1)) },
    ];
    return html`
      <section class="glass card menu" style="--d:1">
        <header class="card-head">
          <span class="ico amber">${icon(mdiSilverwareForkKnife)}</span>
          <span class="grow">Menú</span>
        </header>
        ${days.map((d) => {
          const list = this.meals.filter(
            (e) => e.date === d.key && (e.type === "lunch" || e.type === "dinner"),
          );
          return html`<div class="menu-day">
            <span class="menu-lbl">${d.label}</span>
            ${["lunch", "dinner"].map((type) => {
              const e = list.find((x) => x.type === type);
              return html`<button class="menu-row ${e ? "" : "empty"}" @click=${() => open(e?.recipe?.slug)}>
                <span class="menu-type">${MEAL_ES[type]}</span>
                <span class="menu-name">${e ? mealName(e) : "Sin planificar"}</span>
                ${e?.recipe ? icon(mdiChevronRight) : nothing}
              </button>`;
            })}
          </div>`;
        })}
        <button class="btn all-alerts" @click=${() => open()}>
          ${icon(mdiViewGridOutline)} Ver todo el menú
        </button>
      </section>
    `;
  }

  /**
   * Clima: estado del aire acondicionado y tiempo exterior (las Shelly X2i no miden temperatura ni humedad,
   * así que ya no hay sensor de ambiente interior). La gráfica es la previsión de temperatura de las
   * próximas 24 h.
   */
  private climate() {
    const hv = st(this.hass, HVAC);
    const w = st(this.hass, this.config?.weather);
    const out = w?.attributes.temperature as number | undefined;
    const hum = w?.attributes.humidity as number | undefined;
    const mode = hv?.state ?? "off";
    const now = this.now.getTime();
    const next: Point[] = this.hourly
      .map((f): [number, number | undefined] => [new Date(f.datetime).getTime(), f.temperature])
      .filter(
        (p): p is Point => typeof p[1] === "number" && p[0] >= now - 3_600_000 && p[0] <= now + 86_400_000,
      );
    return html`
      <section class="glass card" style="--d:2" @click=${() => this.go("entrada")}>
        <header class="card-head">
          <span class="ico">${icon(mdiThermometer)}</span>
          <span class="grow">Clima</span>
          <span class="pill ${mode === "off" ? "" : mode === "heat" ? "warn" : "info"}">
            ${mode === "off" ? "Aire apagado" : `${HVAC_ES[mode] ?? mode} → ${fmt(hv?.attributes.temperature as number, 0)}°`}
          </span>
        </header>
        <div class="kpis">
          <div>
            <span class="kpi">${fmt(out, 0)}<small>°C</small></span
            ><span class="muted lbl">fuera</span>
          </div>
          ${
            hum !== undefined
              ? html`<div>
                  <span class="kpi soft">${fmt(hum, 0)}<small>%</small></span>
                  <span class="muted lbl">${icon(mdiWaterPercent)} humedad</span>
                </div>`
              : nothing
          }
        </div>
        ${
          next.length > 1
            ? html`<fv2-area-chart
                .height=${70}
                .series=${[{ data: next, color: "var(--terracotta)", unit: "°", label: "Previsión" }]}
              ></fv2-area-chart>`
            : nothing
        }
      </section>
    `;
  }

  private quick() {
    const lights = ROOMS_DEF.flatMap((r) => r.lights.map((l) => l.entity));
    const on = lights.filter((l) => isOn(this.hass, l));
    const covers = ROOMS_DEF.flatMap((r) => r.covers.filter((c) => !c.curtain).map((c) => c.entity));
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
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 330px), 1fr));
        align-items: start;
        gap: var(--space-3);
        padding: var(--space-3);
      }
      .col {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        min-width: 0;
      }
      .card {
        animation: rise 320ms var(--ease) both;
        animation-delay: calc(var(--d) * 30ms);
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
        cursor: pointer;
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
      .fc {
        display: grid;
        gap: 8px;
        padding-top: 10px;
        border-top: 1px solid var(--glass-border);
      }
      .fc-head {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        font-size: var(--fs-label);
      }
      .fc-row {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: 1fr;
        gap: 4px;
      }
      .fc-row.days {
        padding-top: 8px;
        border-top: 1px dashed var(--glass-border);
      }
      .fc-it {
        display: grid;
        justify-items: center;
        gap: 2px;
        font-size: var(--fs-small);
        min-width: 0;
      }
      .fc-it svg {
        color: var(--amber);
        width: 22px;
        height: 22px;
      }
      .fc-it .rain {
        color: var(--sky);
        font-size: var(--fs-label);
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
      .chart-lbl {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 8px;
        font-size: var(--fs-label);
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
        background: var(--terracotta-soft);
      }
      .sec.alarm {
        background: var(--danger-soft);
        border-color: var(--danger);
      }
      .sec.alarm .ico {
        animation: shake 1.2s ease-in-out infinite;
      }
      .sec .card-head {
        flex-wrap: wrap;
        row-gap: 10px;
      }
      .alarm-btns {
        display: flex;
        gap: 6px;
        margin-left: auto;
      }
      .alarm-note {
        margin: 0;
        font-size: var(--fs-small);
        font-weight: 600;
      }
      .alarm-note.muted {
        font-weight: 400;
      }
      .cam-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: 4px;
      }
      .cam-strip {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }
      .cam-tile {
        padding: 0;
        border: 0;
        background: none;
        cursor: pointer;
      }
      .sec-foot {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        font-size: var(--fs-label);
      }
      .sec-foot .faint {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .sec-foot svg {
        width: 14px;
        height: 14px;
      }
      .sec-foot .chip {
        padding: 4px 10px;
        border-radius: 999px;
        background: var(--chip);
        color: var(--text);
        font-size: var(--fs-label);
        font-weight: 600;
      }
      .sec-foot .chip.on {
        background: var(--sky-soft);
        color: var(--sky);
      }
      .sec-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
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
      .all-alerts {
        margin-top: 6px;
        width: 100%;
      }
      .card.menu {
        grid-template-columns: minmax(0, 1fr);
      }
      .menu-day {
        display: grid;
        gap: 4px;
      }
      .menu-lbl {
        font-size: var(--fs-label);
        font-weight: 600;
        color: var(--text-muted);
      }
      .menu-row {
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 44px;
        padding: 8px 10px;
        border-radius: 12px;
        background: var(--chip);
        color: var(--text);
        text-align: left;
        font-size: var(--fs-small);
      }
      .menu-row.empty {
        color: var(--text-faint);
      }
      .menu-type {
        flex: none;
        width: 4.6em;
        font-size: var(--fs-label);
        font-weight: 600;
        color: var(--text-muted);
      }
      .menu-name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
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
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "fv2-home": HomeView;
  }
}
