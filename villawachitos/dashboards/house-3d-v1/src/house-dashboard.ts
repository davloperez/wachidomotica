import { LitElement, css, html, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import {
  mdiBrightnessAuto,
  mdiCrosshairsGps,
  mdiLightbulbGroup,
  mdiMoonWaningCrescent,
  mdiWhiteBalanceSunny,
  mdiWindowShutterOpen,
} from "@mdi/js";

import type { DashboardConfig, HomeAssistant, ThemeMode } from "./types";
import { tokens } from "./styles/tokens";
import { loadThemeMode, resolveTheme, saveThemeMode } from "./lib/theme";
import { HouseScene, type SceneStats } from "./scene/house-scene";

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

  @query(".stage") private stage!: HTMLDivElement;
  private house?: HouseScene;
  private resolvedTheme: "light" | "dark" = "dark";

  setConfig(config: DashboardConfig): void {
    this.config = { title: "Villawachitos", theme: "auto", sun: "sun.sun", ...config };
    this.themeMode = loadThemeMode(this.config.theme ?? "auto");
  }

  getCardSize(): number {
    return 12;
  }

  connectedCallback(): void {
    super.connectedCallback();
    // Lovelace puede desconectar y volver a conectar la tarjeta: recrear la escena si hace falta.
    if (this.hasUpdated && !this.house) this.createScene();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.house?.dispose();
    this.house = undefined;
  }

  protected firstUpdated(): void {
    this.createScene();
  }

  private createScene(): void {
    try {
      this.house = new HouseScene(this.stage, { maxPixelRatio: this.config.max_pixel_ratio });
      this.house.setTheme(this.resolvedTheme);
      if (this.hass) this.stats = this.house.update(this.hass, this.config.sun);
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
    if (changed.has("hass") && this.hass && this.house) {
      this.stats = this.house.update(this.hass, this.config.sun);
    }
  }

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

      <footer class="hud bottom"><span>1 dedo: girar</span><span>2 dedos: zoom y desplazar</span></footer>
    `;
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
