import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { keyed } from "lit/directives/keyed.js";

import type { DashboardConfig, HassEntity, HomeAssistant, ThemeMode } from "./types";
import { tokens } from "./styles/tokens";
import { panel } from "./styles/panel";
import {
  ALARM_ES,
  HVAC_ES,
  WEATHER_ES,
  countDomain,
  fmt,
  isUnavailable,
  locale,
  num,
  time,
} from "./lib/format";
import { loadThemeMode, resolveTheme, saveThemeMode } from "./lib/theme";
import {
  WEATHER_ICON,
  icon,
  mdiAccountGroup,
  mdiAirConditioner,
  mdiBrightnessAuto,
  mdiLightbulbGroup,
  mdiMoonWaningCrescent,
  mdiShieldAlert,
  mdiShieldCheck,
  mdiThermometer,
  mdiWaterPercent,
  mdiWhiteBalanceSunny,
  mdiWindowShutterOpen,
} from "./lib/icons";
import { fetchMeanSeries, type Point } from "./data/statistics";
import { subscribeForecast, type ForecastItem } from "./data/forecast";
import { sunArc } from "./widgets/sun-arc";
import "./widgets/hud-clock";
import "./widgets/trend-chart";
import type { TrendSeries } from "./widgets/trend-chart";

const STATS_REFRESH_MS = 5 * 60_000;

const DEFAULTS: Required<Pick<DashboardConfig, "title" | "theme" | "weather" | "alarm" | "sun">> = {
  title: "Villawachitos",
  theme: "auto",
  weather: "weather.forecast_casa",
  alarm: "alarm_control_panel.alarma_vivienda",
  sun: "sun.sun",
};

@customElement("analytics-dashboard-v1")
export class AnalyticsDashboard extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config: DashboardConfig = { type: "custom:analytics-dashboard-v1" };
  @state() private themeMode: ThemeMode = "auto";
  @state() private series: Record<string, Point[]> = {};
  @state() private forecast: ForecastItem[] = [];

  private statsTimer?: number;
  private unsubForecast?: Promise<() => Promise<void>>;
  private resolvedTheme: "light" | "dark" = "dark";

  /* ---------- API de tarjeta Lovelace ---------- */

  setConfig(config: DashboardConfig): void {
    this.config = { ...DEFAULTS, ...config };
    this.themeMode = loadThemeMode(this.config.theme ?? "auto");
  }

  getCardSize(): number {
    return 12;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  /* ---------- Ciclo de vida ---------- */

  connectedCallback(): void {
    super.connectedCallback();
    this.statsTimer = window.setInterval(() => this.loadStats(), STATS_REFRESH_MS);
    if (this.hass) this.startSubscriptions();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this.statsTimer);
    this.stopSubscriptions();
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("hass") && this.hass && !changed.get("hass")) {
      // Primer `hass` recibido: arrancar datos asíncronos.
      this.startSubscriptions();
    }
    this.resolvedTheme = resolveTheme(this.themeMode, this.hass?.themes?.darkMode);
    if (this.getAttribute("data-theme") !== this.resolvedTheme) {
      this.setAttribute("data-theme", this.resolvedTheme);
    }
  }

  private startSubscriptions(): void {
    if (!this.hass || this.unsubForecast) return;
    this.loadStats();
    const weather = this.config.weather;
    if (weather && this.hass.states[weather]) {
      this.unsubForecast = subscribeForecast(this.hass, weather, (f) => (this.forecast = f)).catch((err) => {
        console.warn("[analytics-dashboard-v1] previsión no disponible", err);
        return async () => {};
      });
    }
  }

  private stopSubscriptions(): void {
    this.unsubForecast?.then((unsub) => unsub()).catch(() => {});
    this.unsubForecast = undefined;
  }

  private async loadStats(): Promise<void> {
    const c = this.config.climate;
    if (!this.hass || !c) return;
    const ids = [c.temperature, c.humidity].filter((x): x is string => !!x);
    try {
      this.series = await fetchMeanSeries(this.hass, ids, 24);
    } catch (err) {
      console.warn("[analytics-dashboard-v1] estadísticas no disponibles", err);
    }
  }

  private setTheme(mode: ThemeMode): void {
    this.themeMode = mode;
    saveThemeMode(mode);
  }

  /* ---------- Render ---------- */

  render() {
    if (!this.hass) return html`<div class="boot label">Conectando con Home Assistant…</div>`;
    const lang = locale(this.hass);

    return html`
      <div class="bg" aria-hidden="true"><span class="glow g1"></span><span class="glow g2"></span></div>
      <div class="stage">
        ${this.renderTopbar()}
        <section class="panel hero">${this.renderHero(lang)}</section>
        <section class="kpis">${this.renderKpis()}</section>
        <section class="panel sun">
          <div class="label"><span class="dot"></span>Ciclo solar</div>
          ${sunArc(this.hass.states[this.config.sun ?? "sun.sun"], lang)}
        </section>
        <section class="panel chart">${this.renderChart(lang)}</section>
        <section class="side">${this.renderSide(lang)}</section>
      </div>
    `;
  }

  private renderTopbar(): TemplateResult {
    const hass = this.hass!;
    const total = Object.keys(hass.states).length;
    const modes: { mode: ThemeMode; label: string; path: string }[] = [
      { mode: "auto", label: "Auto", path: mdiBrightnessAuto },
      { mode: "light", label: "Claro", path: mdiWhiteBalanceSunny },
      { mode: "dark", label: "Oscuro", path: mdiMoonWaningCrescent },
    ];
    return html`
      <header class="topbar">
        <div class="brand">
          <span class="logo" aria-hidden="true"></span>
          <span class="name">${this.config.title}</span>
          <span class="sub">Analytics // v1</span>
        </div>
        <div class="chips">
          <span class="chip ${hass.connected ? "ok" : "ko"}">
            <span class="pulse"></span>${hass.connected ? "Live" : "Sin conexión"}
          </span>
          <span class="chip"><span class="num">${total}</span>&nbsp;entidades</span>
        </div>
        <div class="theme-switch" role="radiogroup" aria-label="Tema">
          ${modes.map(
            (m) => html`
              <button
                role="radio"
                aria-checked=${this.themeMode === m.mode}
                class=${this.themeMode === m.mode ? "on" : ""}
                @click=${() => this.setTheme(m.mode)}
                title=${m.label}
              >
                ${icon(m.path)}<span>${m.label}</span>
              </button>
            `,
          )}
        </div>
      </header>
    `;
  }

  private renderHero(lang: string): TemplateResult {
    const w = this.hass!.states[this.config.weather ?? ""];
    const temp = w ? Number(w.attributes.temperature) : undefined;
    const unit = (w?.attributes.temperature_unit as string) ?? "°C";
    const next = this.forecast.slice(0, 6);

    return html`
      <adv1-clock .lang=${lang}></adv1-clock>
      <div class="weather">
        ${
          w
            ? html`
                <div class="now">
                  <span class="wicon">${icon(WEATHER_ICON[w.state] ?? WEATHER_ICON.cloudy)}</span>
                  <div>
                    <div class="wtemp num">
                      ${keyed(temp, html`<span class="pop">${fmt(temp, 1, lang)}</span>`)}<small
                        >${unit}</small
                      >
                    </div>
                    <div class="wcond">${WEATHER_ES[w.state] ?? w.state}</div>
                    <div class="wmeta">
                      <span>${icon(mdiWaterPercent)} ${fmt(Number(w.attributes.humidity), 0, lang)}%</span>
                      <span
                        >Viento ${fmt(Number(w.attributes.wind_speed), 0, lang)}
                        ${w.attributes.wind_speed_unit ?? "km/h"}</span
                      >
                    </div>
                  </div>
                </div>
                <div class="forecast">
                  ${next.map(
                    (f) => html`
                      <div class="fc">
                        <span class="fh">${time(new Date(f.datetime), lang)}</span>
                        <span class="fi"
                          >${icon(WEATHER_ICON[f.condition ?? ""] ?? WEATHER_ICON.cloudy)}</span
                        >
                        <span class="ft num">${fmt(f.temperature, 0, lang)}°</span>
                        ${
                          f.precipitation_probability
                            ? html`<span class="fp">${f.precipitation_probability}%</span>`
                            : html`<span class="fp dim">·</span>`
                        }
                      </div>
                    `,
                  )}
                </div>
              `
            : html`<div class="empty">Configura una entidad weather</div>`
        }
      </div>
    `;
  }

  private renderKpis(): TemplateResult {
    const hass = this.hass!;
    const lights = countDomain(hass, "light", (e) => e.state === "on");
    const covers = countDomain(
      hass,
      "cover",
      (e) => e.state === "open" || Number(e.attributes.current_position ?? 0) > 0,
    );
    const people = countDomain(hass, "person", (e) => e.state === "home");
    const all = Object.values(hass.states);
    const unavailable = all.filter((e) => e.state === "unavailable").length;
    const availability = all.length ? ((all.length - unavailable) / all.length) * 100 : 0;

    return html`
      ${this.kpi("Luces", mdiLightbulbGroup, lights.active, lights.total, "--warn", { foot: "encendidas" })}
      ${this.kpi("Persianas", mdiWindowShutterOpen, covers.active, covers.total, "--accent", {
        foot: "abiertas",
      })}
      ${this.kpi("Personas", mdiAccountGroup, people.active, people.total, "--accent-3", { foot: "en casa" })}
      ${this.kpi("Sistema", mdiShieldCheck, availability, 100, "--accent-2", {
        display: fmt(availability, 1, locale(hass)),
        suffix: "%",
        foot: `${unavailable} no disponibles`,
      })}
    `;
  }

  private kpi(
    label: string,
    path: string,
    value: number,
    total: number,
    colorVar: string,
    opts: { display?: string; suffix?: string; foot?: string } = {},
  ) {
    const ratio = total ? Math.min(1, value / total) : 0;
    const shown = opts.display ?? String(value);
    return html`
      <article class="panel kpi" style="--kpi: var(${colorVar})">
        <div class="label"><span class="kicon">${icon(path)}</span><span class="ltext">${label}</span></div>
        <div class="kval num">
          ${keyed(shown, html`<span class="pop">${shown}</span>`)}<span class="ktotal"
            >${opts.suffix ?? `/${total}`}</span
          >
        </div>
        <div class="kbar"><span style="transform: scaleX(${ratio})"></span></div>
        <div class="kfoot">
          ${opts.suffix ? nothing : html`<b class="num">${Math.round(ratio * 100)}%</b>`} ${opts.foot ?? ""}
        </div>
      </article>
    `;
  }

  private renderChart(lang: string): TemplateResult {
    const c = this.config.climate;
    if (!c) return html`<div class="empty">Configura <code>climate.temperature</code></div>`;
    const hass = this.hass!;
    const tEnt = hass.states[c.temperature];
    const hEnt = c.humidity ? hass.states[c.humidity] : undefined;
    const tSeries = this.series[c.temperature] ?? [];
    const hSeries = c.humidity ? (this.series[c.humidity] ?? []) : [];
    const values = tSeries.map((p) => p[1]);
    const min = values.length ? Math.min(...values) : undefined;
    const max = values.length ? Math.max(...values) : undefined;

    const series: TrendSeries[] = [
      { name: "Temperatura", unit: "°", data: tSeries, colorVar: "--accent", areaVar: "--chart-area-top" },
    ];
    if (c.humidity)
      series.push({
        name: "Humedad",
        unit: "%",
        data: hSeries,
        colorVar: "--accent-2",
        areaVar: "--chart-area-2-top",
        secondary: true,
      });

    return html`
      <div class="chart-head">
        <div class="label"><span class="dot"></span>Clima · ${c.name ?? "Interior"} · 24 h</div>
        <div class="chart-stats">
          <div class="stat">
            <span class="sl">${icon(mdiThermometer)} Ahora</span>
            <span class="sv num accent">${fmt(num(tEnt), 1, lang)}°</span>
          </div>
          ${
            hEnt
              ? html`<div class="stat">
                  <span class="sl">${icon(mdiWaterPercent)} Humedad</span>
                  <span class="sv num accent-2">${fmt(num(hEnt), 0, lang)}%</span>
                </div>`
              : nothing
          }
          <div class="stat">
            <span class="sl">Mín / Máx</span>
            <span class="sv num">${fmt(min, 1, lang)}° <i>/</i> ${fmt(max, 1, lang)}°</span>
          </div>
        </div>
      </div>
      <adv1-trend-chart .series=${series} .theme=${this.resolvedTheme} .lang=${lang}></adv1-trend-chart>
    `;
  }

  private renderSide(lang: string): TemplateResult {
    const hass = this.hass!;
    const alarm = hass.states[this.config.alarm ?? ""];
    const hvac = this.config.hvac ? hass.states[this.config.hvac] : undefined;
    const armed = alarm && alarm.state !== "disarmed";
    const triggered = alarm?.state === "triggered";

    return html`
      <article class="panel status ${triggered ? "alert" : armed ? "armed" : ""}">
        <div class="label"><span class="dot"></span>Seguridad</div>
        <div class="status-main">
          <span class="big-icon">${icon(armed ? mdiShieldAlert : mdiShieldCheck)}</span>
          <div>
            <div class="status-val">${alarm ? (ALARM_ES[alarm.state] ?? alarm.state) : "—"}</div>
            <div class="status-sub">${alarm?.attributes.friendly_name ?? "Alarma no configurada"}</div>
          </div>
        </div>
      </article>
      ${hvac ? this.renderHvac(hvac, lang) : nothing}
    `;
  }

  private renderHvac(e: HassEntity, lang: string): TemplateResult {
    const current = Number(e.attributes.current_temperature);
    const target = Number(e.attributes.temperature);
    const on = !isUnavailable(e) && e.state !== "off";
    return html`
      <article class="panel status ${on ? "on" : ""}">
        <div class="label"><span class="dot"></span>Climatización</div>
        <div class="status-main">
          <span class="big-icon">${icon(mdiAirConditioner)}</span>
          <div>
            <div class="status-val">${HVAC_ES[e.state] ?? e.state}</div>
            <div class="status-sub">
              Actual <b class="num">${fmt(current, 1, lang)}°</b>
              ${on && Number.isFinite(target) ? html` · Objetivo <b class="num">${fmt(target, 1, lang)}°</b>` : nothing}
            </div>
          </div>
        </div>
      </article>
    `;
  }

  /* ---------- Estilos ---------- */

  static styles = [
    tokens,
    panel,
    css`
      :host {
        display: block;
        position: relative;
        height: var(--adv1-height, 100dvh);
        overflow: hidden;
        background: var(--bg);
        color: var(--text);
        font-family: var(--font-ui);
        font-size: var(--fs-body);
        -webkit-font-smoothing: antialiased;
        transition:
          background-color 600ms ease,
          color 600ms ease;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
      }

      /* ----- Fondo ambiental ----- */
      .bg {
        position: absolute;
        inset: 0;
        pointer-events: none;
        background-image:
          linear-gradient(var(--grid-line) 1px, transparent 1px),
          linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
        background-size: 48px 48px;
        mask-image: radial-gradient(ellipse 80% 70% at 50% 40%, #000 30%, transparent 100%);
      }
      .glow {
        position: absolute;
        width: 70vmax;
        height: 70vmax;
        border-radius: 50%;
        will-change: transform;
      }
      .g1 {
        top: -35vmax;
        left: -20vmax;
        background: radial-gradient(circle, var(--bg-glow-1), transparent 60%);
        animation: float1 60s ease-in-out infinite alternate;
      }
      .g2 {
        bottom: -40vmax;
        right: -25vmax;
        background: radial-gradient(circle, var(--bg-glow-2), transparent 60%);
        animation: float2 75s ease-in-out infinite alternate;
      }
      @keyframes float1 {
        to {
          transform: translate(18vmax, 10vmax);
        }
      }
      @keyframes float2 {
        to {
          transform: translate(-16vmax, -12vmax);
        }
      }

      /* ----- Rejilla principal (horizontal) ----- */
      .stage {
        position: relative;
        height: 100%;
        box-sizing: border-box;
        padding: var(--space-4);
        display: grid;
        gap: var(--space-3);
        grid-template-columns: repeat(12, minmax(0, 1fr));
        grid-template-rows: auto minmax(0, 1.15fr) minmax(0, 1fr);
        grid-template-areas:
          "top top top top top top top top top top top top"
          "hero hero hero hero hero kpi kpi kpi kpi sun sun sun"
          "chart chart chart chart chart chart chart chart side side side side";
        /* Deriva muy lenta para evitar marcas permanentes en la pantalla */
        animation: drift 900s ease-in-out infinite alternate;
      }
      @keyframes drift {
        0% {
          transform: translate(0, 0);
        }
        50% {
          transform: translate(3px, -2px);
        }
        100% {
          transform: translate(-3px, 2px);
        }
      }

      .boot {
        height: 100%;
        display: grid;
        place-items: center;
      }
      .empty {
        color: var(--text-faint);
        font-size: var(--fs-small);
        padding: var(--space-3) 0;
      }

      /* ----- Barra superior ----- */
      .topbar {
        grid-area: top;
        display: flex;
        align-items: center;
        gap: var(--space-4);
      }
      .brand {
        display: flex;
        align-items: baseline;
        gap: var(--space-2);
      }
      .logo {
        align-self: center;
        width: 1.3em;
        height: 1.3em;
        border-radius: 6px;
        background: conic-gradient(
          from 180deg,
          var(--accent),
          var(--accent-2),
          var(--accent-3),
          var(--accent)
        );
        box-shadow: var(--accent-glow);
        animation: spin 12s linear infinite;
        mask: radial-gradient(circle, transparent 32%, #000 34%);
      }
      @keyframes spin {
        to {
          transform: rotate(1turn);
        }
      }
      .brand .name {
        font-family: var(--font-hud);
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }
      .brand .sub {
        font-family: var(--font-hud);
        font-size: var(--fs-label);
        letter-spacing: 0.3em;
        text-transform: uppercase;
        color: var(--accent);
      }
      .chips {
        display: flex;
        gap: var(--space-2);
        margin-left: auto;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 14px;
        border-radius: 999px;
        font-size: var(--fs-small);
        color: var(--text-muted);
        background: var(--panel);
        border: 1px solid var(--panel-border);
      }
      .pulse {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: currentColor;
      }
      .chip.ok {
        color: var(--accent-3);
      }
      .chip.ok .pulse {
        animation: pulse 2s ease-out infinite;
      }
      .chip.ko {
        color: var(--danger);
      }
      @keyframes pulse {
        0% {
          box-shadow: 0 0 0 0 currentColor;
        }
        100% {
          box-shadow: 0 0 0 10px transparent;
        }
      }

      .theme-switch {
        display: flex;
        padding: 4px;
        border-radius: 999px;
        background: var(--panel);
        border: 1px solid var(--panel-border);
      }
      .theme-switch button {
        all: unset;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        min-height: 28px;
        border-radius: 999px;
        font-size: var(--fs-small);
        color: var(--text-muted);
        transition:
          background 300ms,
          color 300ms;
      }
      .theme-switch button.on {
        background: var(--accent);
        color: var(--bg);
        box-shadow: var(--accent-glow);
      }

      /* ----- Hero: reloj + tiempo ----- */
      .hero {
        grid-area: hero;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: var(--space-3);
      }
      .weather {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .now {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }
      .wicon {
        font-size: clamp(48px, 5vw, 96px);
        color: var(--accent);
        filter: drop-shadow(0 0 12px var(--accent));
        display: flex;
      }
      .wtemp {
        font-size: clamp(36px, 3.6vw, 68px);
        font-weight: 500;
        line-height: 1;
      }
      .wtemp small {
        font-size: 0.45em;
        color: var(--text-muted);
        margin-left: 4px;
      }
      .wcond {
        color: var(--text);
        font-weight: 500;
      }
      .wmeta {
        display: flex;
        gap: var(--space-3);
        color: var(--text-muted);
        font-size: var(--fs-small);
      }
      .wmeta span {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .forecast {
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        gap: var(--space-1);
        border-top: 1px solid var(--panel-border);
        padding-top: var(--space-2);
      }
      .fc {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        font-size: var(--fs-small);
      }
      .fh {
        color: var(--text-faint);
      }
      .fi {
        font-size: 1.6em;
        color: var(--text-muted);
        display: flex;
      }
      .ft {
        font-weight: 600;
      }
      .fp {
        font-size: 0.8em;
        color: var(--accent);
      }
      .fp.dim {
        color: var(--text-faint);
      }

      /* ----- KPIs ----- */
      .kpis {
        grid-area: kpi;
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-template-rows: 1fr 1fr;
        gap: var(--space-3);
        min-height: 0;
      }
      .kpi {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: var(--space-1);
      }
      .kicon {
        display: flex;
        font-size: 1.6em;
        color: var(--kpi);
        filter: drop-shadow(0 0 8px var(--kpi));
      }
      .ltext {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .kval {
        white-space: nowrap;
        font-size: var(--fs-kpi);
        font-weight: 600;
        line-height: 1;
        color: var(--text);
      }
      .ktotal {
        font-size: 0.42em;
        font-weight: 400;
        color: var(--text-faint);
        margin-left: 4px;
      }
      .kbar {
        height: 4px;
        border-radius: 4px;
        background: var(--grid-line);
        overflow: hidden;
      }
      .kbar span {
        display: block;
        height: 100%;
        background: var(--kpi);
        box-shadow: 0 0 10px var(--kpi);
        transform-origin: left;
        transition: transform 900ms var(--ease-out);
      }
      .kfoot {
        font-size: var(--fs-small);
        color: var(--text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .kfoot b {
        color: var(--kpi);
        font-weight: 600;
      }

      /* ----- Sol ----- */
      .sun {
        grid-area: sun;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .sun-wrap {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: var(--space-2);
      }
      .sun-svg {
        width: 100%;
        min-height: 0;
        flex: 1;
      }
      .sun-center {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        margin-top: calc(var(--space-2) * -1);
      }
      .sun-center .v {
        font-size: clamp(22px, 2.2vw, 40px);
        font-weight: 600;
        white-space: nowrap;
      }
      .sun-meta {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: end;
        gap: var(--space-1);
        border-top: 1px solid var(--panel-border);
        padding-top: var(--space-2);
      }
      .sun-meta > div {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .sun-meta .label {
        letter-spacing: 0.1em;
        gap: 4px;
      }
      .sun-meta .center {
        align-items: center;
      }
      .sun-meta .right {
        align-items: flex-end;
      }
      .sun-meta .v {
        font-size: clamp(16px, 1.4vw, 26px);
        font-weight: 600;
        white-space: nowrap;
      }
      .accent {
        color: var(--accent);
      }
      .accent-2 {
        color: var(--accent-2);
      }

      /* ----- Gráfica ----- */
      .chart {
        grid-area: chart;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .chart-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-3);
      }
      .chart-stats {
        display: flex;
        gap: var(--space-4);
      }
      .stat {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
      }
      .sl {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: var(--fs-small);
        color: var(--text-muted);
      }
      .sv {
        font-size: clamp(20px, 2vw, 36px);
        font-weight: 600;
        line-height: 1.1;
      }
      .sv i {
        font-style: normal;
        color: var(--text-faint);
      }
      adv1-trend-chart {
        flex: 1;
      }

      /* ----- Columna lateral ----- */
      .side {
        grid-area: side;
        display: grid;
        grid-auto-rows: 1fr;
        gap: var(--space-3);
        min-height: 0;
      }
      .status {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        --state: var(--accent-3);
      }
      .status.armed {
        --state: var(--warn);
      }
      .status.alert {
        --state: var(--danger);
        animation: alert 1s ease-in-out infinite alternate;
      }
      .status.on {
        --state: var(--accent);
      }
      .status .label .dot {
        background: var(--state);
        box-shadow: 0 0 10px var(--state);
      }
      @keyframes alert {
        to {
          box-shadow: 0 0 40px -6px var(--danger);
        }
      }
      .status-main {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }
      .big-icon {
        display: flex;
        font-size: clamp(36px, 3.4vw, 64px);
        color: var(--state);
        filter: drop-shadow(0 0 10px var(--state));
      }
      .status-val {
        font-size: clamp(20px, 1.9vw, 34px);
        font-weight: 600;
      }
      .status-sub {
        font-size: var(--fs-small);
        color: var(--text-muted);
      }
      .status-sub b {
        color: var(--text);
        font-weight: 600;
      }

      /* Pantallas en vertical o estrechas: apilar */
      @media (max-aspect-ratio: 1/1) {
        :host {
          height: auto;
          min-height: 100dvh;
          overflow: auto;
        }
        .stage {
          grid-template-columns: 1fr;
          grid-template-rows: auto;
          grid-template-areas: "top" "hero" "kpi" "sun" "chart" "side";
        }
        .chart {
          min-height: 320px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .stage,
        .glow,
        .logo {
          animation: none;
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "analytics-dashboard-v1": AnalyticsDashboard;
  }
}
