import { LitElement, css, html, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import {
  mdiBrightnessAuto,
  mdiCrosshairsGps,
  mdiLightbulbGroup,
  mdiMoonWaningCrescent,
  mdiWeatherNight,
  mdiWeatherPartlyCloudy,
  mdiWeatherSunny,
  mdiWhiteBalanceSunny,
  mdiWindowShutterOpen,
} from "@mdi/js";

import type { DashboardConfig, HomeAssistant, ThemeMode } from "./types";
import { tokens } from "./styles/tokens";
import { loadThemeMode, resolveTheme, saveThemeMode } from "./lib/theme";
import { HouseScene, type SceneStats, type SunInfo } from "./scene/house-scene";
import { compassPoint } from "./lib/solar";
import "./ui/control-panel";

/** Molina de Segura (Murcia), coordenadas de AEMET: 38° 3' 2'' N, 1° 12' 41'' O. */
const DEFAULT_LOCATION = { latitude: 38.0506, longitude: -1.2114 };

const icon = (path: string) =>
  html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d=${path}></path></svg>`;

/**
 * Plano 3D interactivo de la vivienda. La escena (Three.js) ocupa toda la tarjeta;
 * encima flota un HUD mínimo con el título, los indicadores y el selector de tema.
 */
@customElement("house-3d-v1")
export class HouseDashboard extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config: DashboardConfig = { type: "custom:house-3d-v1" };
  @state() private themeMode: ThemeMode = "auto";
  @state() private stats?: SceneStats;
  @state() private error?: string;
  @state() private sun?: SunInfo;
  /** Luz o persiana tocada en el plano, cuyo panel de control está abierto. */
  @state() private selected?: string;
  /** Hora simulada para el sol (solo la usa la página de desarrollo). */
  @property({ attribute: false }) simulatedTime?: Date;

  @query(".stage") private stage!: HTMLDivElement;
  private house?: HouseScene;
  private resolvedTheme: "light" | "dark" = "dark";

  setConfig(config: DashboardConfig): void {
    this.config = { title: "Villawachitos", theme: "auto", ...DEFAULT_LOCATION, ...config };
    this.themeMode = loadThemeMode(this.config.theme ?? "auto");
  }

  getCardSize(): number {
    return 12;
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("keydown", this.onKey);
    // Lovelace puede desconectar y volver a conectar la tarjeta: recrear la escena si hace falta.
    if (this.hasUpdated && !this.house) this.createScene();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("keydown", this.onKey);
    this.house?.dispose();
    this.house = undefined;
    window.clearInterval(this.sunTimer);
  }

  private sunTimer = 0;

  protected firstUpdated(): void {
    this.createScene();
  }

  private createScene(): void {
    try {
      this.house = new HouseScene(this.stage, {
        maxPixelRatio: this.config.max_pixel_ratio,
        latitude: this.config.latitude ?? DEFAULT_LOCATION.latitude,
        longitude: this.config.longitude ?? DEFAULT_LOCATION.longitude,
      });
      this.house.setTheme(this.resolvedTheme);
      this.house.onPick = (pick) => this.selectEntity(pick?.entity);
      this.house.select(this.selected);
      if (this.simulatedTime) this.house.setTime(this.simulatedTime);
      if (this.hass) this.stats = this.house.update(this.hass, this.config.weather);
      this.sun = this.house.sunState;
      // El indicador del sol se refresca aunque Home Assistant no envíe cambios.
      window.clearInterval(this.sunTimer);
      this.sunTimer = window.setInterval(() => (this.sun = this.house?.sunState), 30_000);
    } catch (err) {
      console.error("[house-3d-v1]", err);
      this.error = "No se pudo iniciar WebGL en este navegador.";
    }
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    const theme = resolveTheme(this.themeMode, this.hass?.themes?.darkMode);
    if (theme !== this.resolvedTheme || !this.hasAttribute("data-theme")) {
      this.resolvedTheme = theme;
      this.setAttribute("data-theme", theme);
      this.house?.setTheme(theme);
    }
    if (changed.has("simulatedTime") && this.house) {
      this.house.setTime(this.simulatedTime);
    }
    if (changed.has("hass") && this.hass && this.house) {
      this.stats = this.house.update(this.hass, this.config.weather);
    }
    if (this.house) this.sun = this.house.sunState;
  }

  private selectEntity(entity: string | undefined): void {
    this.selected = entity;
    this.house?.select(entity);
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") this.selectEntity(undefined);
  };

  private setTheme(mode: ThemeMode): void {
    this.themeMode = mode;
    saveThemeMode(mode);
  }

  render() {
    const s = this.stats;
    const modes: { mode: ThemeMode; label: string; path: string }[] = [
      { mode: "auto", label: "Auto", path: mdiBrightnessAuto },
      { mode: "light", label: "Claro", path: mdiWhiteBalanceSunny },
      { mode: "dark", label: "Oscuro", path: mdiMoonWaningCrescent },
    ];
    const connected = this.hass?.connected ?? false;

    return html`
      <div class="stage"></div>
      ${this.error ? html`<div class="error">${this.error}</div>` : null}

      <header class="hud top">
        <div class="brand">
          <span class="logo" aria-hidden="true"></span>
          <span class="name">${this.config.title}</span>
          <span class="sub">Casa 3D // v1</span>
        </div>
        <div class="chips">
          <span class="chip ${connected ? "ok" : "ko"}"
            ><span class="pulse"></span>${connected ? "Live" : "Sin conexión"}</span
          >
          <span class="chip warn">
            ${icon(mdiLightbulbGroup)}<b class="num">${s?.lightsOn ?? "—"}</b
            ><span class="dim">/${s?.lightsTotal ?? "—"}</span>
            luces
          </span>
          ${this.renderSunChip()}
          <span class="chip accent">
            ${icon(mdiWindowShutterOpen)}<b class="num"
              >${s?.coversOpenAvg !== undefined ? Math.round(s.coversOpenAvg) : "—"}%</b
            >
            apertura media
          </span>
        </div>
        <div class="controls">
          <button class="round" title="Vista inicial" @click=${() => this.house?.resetView()}>
            ${icon(mdiCrosshairsGps)}
          </button>
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
        </div>
      </header>

      ${
        this.selected
          ? html`<h3d-control-panel
              class="panel"
              .hass=${this.hass}
              .entityId=${this.selected}
              @close=${() => this.selectEntity(undefined)}
            ></h3d-control-panel>`
          : null
      }

      <footer class="hud bottom">
        <span>Toca una luz o persiana para controlarla</span><span>1 dedo: girar</span
        ><span>2 dedos: zoom y desplazar</span>
      </footer>
    `;
  }

  private renderSunChip() {
    const sun = this.sun;
    if (!sun) return null;
    const up = sun.elevation > 0;
    const cloudy = (sun.cloudCoverage ?? 0) >= 50;
    const path = !up ? mdiWeatherNight : cloudy ? mdiWeatherPartlyCloudy : mdiWeatherSunny;
    const title = up
      ? `Sol a ${sun.elevation.toFixed(1)}° de altura, azimut ${sun.azimuth.toFixed(0)}°` +
        ` · ~${Math.round(sun.directNormal)} W/m² directos` +
        (sun.cloudCoverage !== undefined ? ` · nubes ${Math.round(sun.cloudCoverage)} %` : "")
      : `Sol bajo el horizonte (${sun.elevation.toFixed(1)}°)`;
    return html`<span class="chip sun ${up ? "" : "night"}" title=${title}>
      ${icon(path)}<b class="num">${Math.round(sun.elevation)}°</b>
      <span class="dim">${compassPoint(sun.azimuth)}</span>
    </span>`;
  }

  static styles = [
    tokens,
    css`
      :host {
        display: block;
        position: relative;
        height: var(--h3d-height, 100dvh);
        overflow: hidden;
        background: var(--bg);
        color: var(--text);
        font-family: var(--font-ui);
        font-size: var(--fs-body);
        user-select: none;
        -webkit-tap-highlight-color: transparent;
      }
      .stage {
        position: absolute;
        inset: 0;
        /* Las etiquetas 3D llevan z-index propios: que no se salgan de la escena. */
        isolation: isolate;
        z-index: 0;
      }
      .stage canvas.webgl {
        display: block;
        width: 100%;
        height: 100%;
        touch-action: none;
        outline: none;
      }
      .stage .labels {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }
      .room-label {
        font-family: var(--font-hud);
        font-size: clamp(9px, 0.7vw, 13px);
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--text);
        background: var(--panel);
        border: 1px solid var(--panel-border);
        padding: 3px 8px;
        border-radius: 999px;
        white-space: nowrap;
        opacity: 0.85;
      }
      .compass {
        font-family: var(--font-hud);
        font-weight: 700;
        font-size: clamp(11px, 0.9vw, 15px);
        color: var(--accent);
        width: 2em;
        height: 2em;
        display: grid;
        place-items: center;
        border-radius: 50%;
        border: 1.5px solid var(--accent);
        background: var(--panel);
        box-shadow: var(--accent-glow);
      }
      .panel {
        position: absolute;
        right: var(--space-4);
        bottom: calc(var(--space-4) + 28px);
        z-index: 2;
        max-height: calc(100% - 150px);
        overflow-y: auto;
        border-radius: var(--radius);
      }
      @media (max-width: 700px) {
        .panel {
          left: 16px;
          right: 16px;
          bottom: 16px;
          display: flex;
          justify-content: center;
        }
      }
      .error {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        color: var(--danger);
      }

      /* ----- HUD flotante ----- */
      .hud {
        position: absolute;
        left: var(--space-4);
        right: var(--space-4);
        display: flex;
        align-items: center;
        gap: var(--space-3);
        pointer-events: none;
      }
      .hud > * {
        pointer-events: auto;
      }
      .top {
        top: var(--space-3);
      }
      .bottom {
        bottom: var(--space-3);
        justify-content: center;
        gap: var(--space-4);
        font-size: var(--fs-small);
        color: var(--text-faint);
      }
      .bottom > * {
        pointer-events: none;
      }
      .brand {
        display: flex;
        align-items: baseline;
        gap: var(--space-2);
        padding: 8px 16px;
        border-radius: 999px;
        background: var(--panel);
        border: 1px solid var(--panel-border);
        backdrop-filter: blur(8px);
      }
      .logo {
        align-self: center;
        width: 1.2em;
        height: 1.2em;
        border-radius: 6px;
        background: conic-gradient(
          from 180deg,
          var(--accent),
          var(--accent-2),
          var(--accent-3),
          var(--accent)
        );
        mask: radial-gradient(circle, transparent 32%, #000 34%);
        animation: spin 12s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(1turn);
        }
      }
      .name {
        font-family: var(--font-hud);
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }
      .sub {
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
        gap: 6px;
        padding: 7px 14px;
        border-radius: 999px;
        font-size: var(--fs-small);
        color: var(--text-muted);
        background: var(--panel);
        border: 1px solid var(--panel-border);
        backdrop-filter: blur(8px);
        white-space: nowrap;
      }
      .chip b {
        color: var(--text);
        font-weight: 600;
      }
      .chip .dim {
        color: var(--text-faint);
      }
      .chip.warn svg {
        color: var(--warn);
      }
      .chip.sun svg {
        color: #ffb340;
      }
      .chip.sun.night svg {
        color: var(--text-muted);
      }
      .chip.accent svg {
        color: var(--accent);
      }
      .chip.ok {
        color: var(--accent-3);
      }
      .chip.ko {
        color: var(--danger);
      }
      .pulse {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: currentColor;
      }
      .chip.ok .pulse {
        animation: pulse 2s ease-out infinite;
      }
      @keyframes pulse {
        0% {
          box-shadow: 0 0 0 0 currentColor;
        }
        100% {
          box-shadow: 0 0 0 10px transparent;
        }
      }
      .num {
        font-variant-numeric: tabular-nums;
      }
      svg.icon {
        width: 1.15em;
        height: 1.15em;
        fill: currentColor;
        flex: none;
      }
      .controls {
        display: flex;
        gap: var(--space-2);
      }
      button {
        all: unset;
        cursor: pointer;
      }
      .round {
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: var(--panel);
        border: 1px solid var(--panel-border);
        color: var(--text);
        backdrop-filter: blur(8px);
      }
      .theme-switch {
        display: flex;
        padding: 4px;
        border-radius: 999px;
        background: var(--panel);
        border: 1px solid var(--panel-border);
        backdrop-filter: blur(8px);
      }
      .theme-switch button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border-radius: 999px;
        font-size: var(--fs-small);
        color: var(--text-muted);
      }
      .theme-switch button.on {
        background: var(--accent);
        color: var(--bg);
        box-shadow: var(--accent-glow);
      }
      @media (max-width: 900px) {
        .theme-switch span,
        .sub {
          display: none;
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "house-3d-v1": HouseDashboard;
  }
}
