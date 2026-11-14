import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  mdiArrowDown,
  mdiArrowUp,
  mdiClose,
  mdiDotsHorizontal,
  mdiLightbulb,
  mdiLightbulbOutline,
  mdiPause,
  mdiPump,
  mdiPower,
  mdiWindowShutter,
  mdiWindowShutterOpen,
} from "@mdi/js";

import type { HassEntity, HomeAssistant } from "../types";
import { tokens } from "../styles/tokens";

const icon = (path: string) =>
  html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d=${path}></path></svg>`;

/** Bits de `supported_features` de las persianas (CoverEntityFeature). */
const COVER_OPEN = 1;
const COVER_CLOSE = 2;
const COVER_SET_POSITION = 4;
const COVER_STOP = 8;

const COLOR_MODES = ["hs", "xy", "rgb", "rgbw", "rgbww"];

/** Colores rápidos (tono, saturación). */
const SWATCHES: { name: string; hs: [number, number] }[] = [
  { name: "Rojo", hs: [0, 100] },
  { name: "Naranja", hs: [28, 100] },
  { name: "Ámbar", hs: [42, 90] },
  { name: "Verde", hs: [120, 90] },
  { name: "Turquesa", hs: [175, 90] },
  { name: "Azul", hs: [220, 100] },
  { name: "Violeta", hs: [275, 85] },
  { name: "Rosa", hs: [320, 80] },
];

/**
 * Panel flotante con los controles de una luz o persiana: lo que muestra depende de lo que
 * admita la entidad en Home Assistant (encendido, brillo, temperatura de color, color, efectos,
 * posición...). Los cambios se envían con `hass.callService`.
 */
@customElement("h3d-control-panel")
export class ControlPanel extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property() entityId?: string;
  /** Valores mientras se arrastra un control, hasta que Home Assistant confirma el cambio. */
  @state() private draft: Record<string, number> = {};
  @state() private error?: string;

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("entityId")) {
      this.draft = {};
      this.error = undefined;
    } else if (changed.has("hass") && this.entityId) {
      const prev = (changed.get("hass") as HomeAssistant | undefined)?.states[this.entityId];
      const next = this.hass?.states[this.entityId];
      if (prev && next && prev.last_updated !== next.last_updated) this.draft = {};
    }
  }

  private get stateObj(): HassEntity | undefined {
    return this.entityId ? this.hass?.states[this.entityId] : undefined;
  }

  private async call(domain: string, service: string, data: Record<string, unknown> = {}): Promise<void> {
    if (!this.hass || !this.entityId) return;
    this.error = undefined;
    try {
      await this.hass.callService(domain, service, { entity_id: this.entityId, ...data });
    } catch (err) {
      console.error("[house-3d-v1]", err);
      this.error = err instanceof Error ? err.message : "No se pudo enviar la orden";
      this.draft = {};
    }
  }

  private close(): void {
    this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
  }

  /** Abre el diálogo "más información" nativo de Home Assistant. */
  private moreInfo(): void {
    this.dispatchEvent(
      new CustomEvent("hass-more-info", {
        detail: { entityId: this.entityId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    const st = this.stateObj;
    if (!this.entityId) return nothing;
    const domain = this.entityId.split(".")[0];
    const name = (st?.attributes.friendly_name as string | undefined) ?? this.entityId;
    const unavailable = !st || st.state === "unavailable" || st.state === "unknown";

    return html`
      <section class="card" role="dialog" aria-label=${name}>
        <header>
          <span class="badge ${domain} ${st?.state === "on" ? "on" : ""}">
            ${icon(
              domain === "cover"
                ? mdiWindowShutterOpen
                : domain === "switch"
                  ? mdiPump
                  : st?.state === "on"
                    ? mdiLightbulb
                    : mdiLightbulbOutline,
            )}
          </span>
          <div class="title">
            <b>${name}</b>
            <span class="status">${this.statusText(domain, st)}</span>
          </div>
          <button class="icon-btn" title="Más opciones" @click=${this.moreInfo}>
            ${icon(mdiDotsHorizontal)}
          </button>
          <button class="icon-btn" title="Cerrar" @click=${this.close}>${icon(mdiClose)}</button>
        </header>
        ${
          unavailable
            ? html`<p class="muted">El dispositivo no está disponible ahora mismo.</p>`
            : domain === "light"
              ? this.renderLight(st)
              : domain === "cover"
                ? this.renderCover(st)
                : domain === "switch"
                  ? this.renderSwitch(st)
                  : nothing
        }
        ${this.error ? html`<p class="error">${this.error}</p>` : nothing}
      </section>
    `;
  }

  private statusText(domain: string, st?: HassEntity): string {
    if (!st) return "No encontrado";
    if (st.state === "unavailable") return "No disponible";
    if (domain === "light") {
      if (st.state !== "on") return "Apagada";
      const b = st.attributes.brightness;
      return typeof b === "number" ? `Encendida · ${Math.round((b / 255) * 100)} %` : "Encendida";
    }
    if (domain === "switch") return st.state === "on" ? "En marcha" : "Parada";
    if (domain === "cover") {
      const pos = st.attributes.current_position;
      const label: Record<string, string> = {
        open: "Abierta",
        closed: "Cerrada",
        opening: "Abriendo…",
        closing: "Cerrando…",
      };
      return `${label[st.state] ?? st.state}${typeof pos === "number" && pos > 0 && pos < 100 ? ` · ${pos} %` : ""}`;
    }
    return st.state;
  }

  /* ---------------------------------------------------------------- */
  /* Luces                                                            */
  /* ---------------------------------------------------------------- */

  private renderLight(st: HassEntity) {
    const a = st.attributes;
    const on = st.state === "on";
    const modes = (a.supported_color_modes as string[] | undefined) ?? ["onoff"];
    const dimmable = modes.some((m) => m !== "onoff");
    const hasTemp = modes.includes("color_temp");
    const hasColor = modes.some((m) => COLOR_MODES.includes(m));
    const hasWhite = modes.includes("white");
    const effects = (a.effect_list as string[] | undefined) ?? [];

    const brightnessPct =
      this.draft.brightness ??
      (on && typeof a.brightness === "number" ? Math.round((a.brightness / 255) * 100) : 0);
    const minK = (a.min_color_temp_kelvin as number | undefined) ?? 2000;
    const maxK = (a.max_color_temp_kelvin as number | undefined) ?? 6500;
    const kelvin =
      this.draft.kelvin ?? (a.color_temp_kelvin as number | undefined) ?? Math.round((minK + maxK) / 2);
    const hs = a.hs_color as [number, number] | undefined;
    const hue = this.draft.hue ?? hs?.[0] ?? 0;
    const colorMode = a.color_mode as string | undefined;
    const rgb = a.rgb_color as [number, number, number] | undefined;

    return html`
      <button
        class="power ${on ? "on" : ""}"
        style=${on && rgb ? `--lamp: rgb(${rgb.join(",")})` : ""}
        @click=${() => this.call("light", "toggle")}
      >
        ${icon(mdiPower)} ${on ? "Apagar" : "Encender"}
      </button>

      ${
        dimmable
          ? html`
              <label class="field">
                <span>Intensidad <b class="num">${brightnessPct} %</b></span>
                <input
                  type="range"
                  class="slider brightness"
                  min="1"
                  max="100"
                  .value=${String(Math.max(1, brightnessPct))}
                  @input=${(e: Event) => (this.draft = { ...this.draft, brightness: num(e) })}
                  @change=${(e: Event) => this.call("light", "turn_on", { brightness_pct: num(e) })}
                />
              </label>
            `
          : nothing
      }
      ${
        hasTemp
          ? html`
              <label class="field">
                <span>Temperatura <b class="num">${kelvin} K</b></span>
                <input
                  type="range"
                  class="slider temp"
                  min=${minK}
                  max=${maxK}
                  step="50"
                  .value=${String(kelvin)}
                  @input=${(e: Event) => (this.draft = { ...this.draft, kelvin: num(e) })}
                  @change=${(e: Event) => this.call("light", "turn_on", { color_temp_kelvin: num(e) })}
                />
              </label>
            `
          : nothing
      }
      ${
        hasColor
          ? html`
              <div class="field">
                <span>Color</span>
                <div class="swatches">
                  ${
                    hasWhite || hasTemp || modes.includes("rgbw") || modes.includes("rgbww")
                      ? html`<button
                          class="swatch white ${on && (colorMode === "white" || colorMode === "color_temp") ? "sel" : ""}"
                          title="Blanco"
                          @click=${() => this.call("light", "turn_on", this.whiteData(modes, minK, maxK))}
                        ></button>`
                      : nothing
                  }
                  ${SWATCHES.map(
                    (s) =>
                      html`<button
                        class="swatch ${on && hs && COLOR_MODES.includes(colorMode ?? "") && Math.abs(hs[0] - s.hs[0]) < 6 ? "sel" : ""}"
                        title=${s.name}
                        style="--c: hsl(${s.hs[0]} ${s.hs[1]}% 55%)"
                        @click=${() => this.call("light", "turn_on", { hs_color: s.hs })}
                      ></button>`,
                  )}
                </div>
                <input
                  type="range"
                  class="slider hue"
                  aria-label="Tono"
                  min="0"
                  max="359"
                  .value=${String(Math.round(hue))}
                  @input=${(e: Event) => (this.draft = { ...this.draft, hue: num(e) })}
                  @change=${(e: Event) => this.call("light", "turn_on", { hs_color: [num(e), 100] })}
                />
              </div>
            `
          : nothing
      }
      ${
        effects.length
          ? html`
              <label class="field">
                <span>Efecto</span>
                <select
                  @change=${(e: Event) =>
                    this.call("light", "turn_on", { effect: (e.target as HTMLSelectElement).value })}
                >
                  ${effects.map((fx) => html`<option ?selected=${fx === a.effect} .value=${fx}>${fx}</option>`)}
                </select>
              </label>
            `
          : nothing
      }
      ${!dimmable ? html`<p class="muted">Esta luz solo admite encender y apagar.</p>` : nothing}
    `;
  }

  /* ---------------------------------------------------------------- */
  /* Interruptores (depuradora)                                       */
  /* ---------------------------------------------------------------- */

  private renderSwitch(st: HassEntity) {
    const on = st.state === "on";
    return html`
      <button class="power ${on ? "on pump" : ""}" @click=${() => this.call("switch", "toggle")}>
        ${icon(mdiPower)} ${on ? "Parar" : "Poner en marcha"}
      </button>
    `;
  }

  /** Blanco: modo `white` si existe, si no un blanco neutro por temperatura o sin saturación. */
  private whiteData(modes: string[], minK: number, maxK: number): Record<string, unknown> {
    if (modes.includes("white")) return { white: true };
    if (modes.includes("color_temp")) return { color_temp_kelvin: Math.min(maxK, Math.max(minK, 4000)) };
    return { hs_color: [0, 0] };
  }

  /* ---------------------------------------------------------------- */
  /* Persianas                                                        */
  /* ---------------------------------------------------------------- */

  private renderCover(st: HassEntity) {
    const features = (st.attributes.supported_features as number | undefined) ?? 0;
    const current =
      typeof st.attributes.current_position === "number" ? st.attributes.current_position : undefined;
    const pos = this.draft.position ?? current ?? (st.state === "closed" ? 0 : 100);
    const moving = st.state === "opening" || st.state === "closing";

    return html`
      <div class="cover">
        <div class="window" aria-hidden="true">
          <div class="blind" style="height: ${100 - pos}%"></div>
        </div>
        <div class="cover-actions">
          ${
            features & COVER_OPEN
              ? html`<button
                  class="action"
                  ?disabled=${pos >= 100 && !moving}
                  @click=${() => this.call("cover", "open_cover")}
                >
                  ${icon(mdiArrowUp)} Subir
                </button>`
              : nothing
          }
          ${
            features & COVER_STOP
              ? html`<button class="action" @click=${() => this.call("cover", "stop_cover")}>
                  ${icon(mdiPause)} Parar
                </button>`
              : nothing
          }
          ${
            features & COVER_CLOSE
              ? html`<button
                  class="action"
                  ?disabled=${pos <= 0 && !moving}
                  @click=${() => this.call("cover", "close_cover")}
                >
                  ${icon(mdiArrowDown)} Bajar
                </button>`
              : nothing
          }
        </div>
      </div>
      ${
        features & COVER_SET_POSITION
          ? html`
              <label class="field">
                <span>Apertura <b class="num">${pos} %</b></span>
                <input
                  type="range"
                  class="slider position"
                  min="0"
                  max="100"
                  .value=${String(pos)}
                  @input=${(e: Event) => (this.draft = { ...this.draft, position: num(e) })}
                  @change=${(e: Event) => this.call("cover", "set_cover_position", { position: num(e) })}
                />
              </label>
              <div class="presets">
                ${[0, 25, 50, 75, 100].map(
                  (p) =>
                    html`<button
                      class="preset ${current === p ? "sel" : ""}"
                      @click=${() => {
                        this.draft = { ...this.draft, position: p };
                        void this.call("cover", "set_cover_position", { position: p });
                      }}
                    >
                      ${p === 0 ? icon(mdiWindowShutter) : p === 100 ? icon(mdiWindowShutterOpen) : `${p} %`}
                    </button>`,
                )}
              </div>
            `
          : nothing
      }
    `;
  }

  static styles = [
    tokens,
    css`
      :host {
        display: block;
      }
      .card {
        width: min(380px, calc(100vw - 32px));
        box-sizing: border-box;
        padding: var(--space-3);
        border-radius: var(--radius);
        background: var(--panel-strong);
        border: 1px solid var(--panel-border);
        box-shadow: var(--panel-shadow);
        backdrop-filter: blur(14px);
        color: var(--text);
        font-family: var(--font-ui);
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        animation: rise 0.22s var(--ease-out);
      }
      @keyframes rise {
        from {
          opacity: 0;
          transform: translateY(12px) scale(0.98);
        }
      }
      header {
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }
      .badge {
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        border-radius: 14px;
        background: var(--panel);
        border: 1px solid var(--panel-border);
        color: var(--text-muted);
        flex: none;
      }
      .badge.on {
        color: var(--warn);
        box-shadow: 0 0 18px -4px var(--warn);
      }
      .badge.switch.on {
        color: #3dffa8;
        box-shadow: 0 0 18px -4px #3dffa8;
      }
      .badge.cover {
        color: var(--accent);
      }
      .title {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
      }
      .title b {
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .status {
        font-size: var(--fs-small);
        color: var(--text-muted);
      }
      button {
        all: unset;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }
      button:disabled {
        opacity: 0.35;
        cursor: default;
      }
      .icon-btn {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        color: var(--text-muted);
      }
      .icon-btn:hover {
        background: var(--panel);
        color: var(--text);
      }
      svg.icon {
        width: 1.25em;
        height: 1.25em;
        fill: currentColor;
        flex: none;
      }
      .power {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 14px;
        border-radius: 16px;
        font-weight: 600;
        background: var(--panel);
        border: 1px solid var(--panel-border);
        color: var(--text);
      }
      .power.on.pump {
        --lamp: #3dffa8;
      }
      .power.on {
        --lamp: var(--warn);
        background: color-mix(in srgb, var(--lamp) 22%, transparent);
        border-color: color-mix(in srgb, var(--lamp) 60%, transparent);
        box-shadow: 0 0 24px -8px var(--lamp);
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 10px;
        font-size: var(--fs-small);
        color: var(--text-muted);
      }
      .field > span {
        display: flex;
        justify-content: space-between;
      }
      .field b {
        color: var(--text);
        font-weight: 600;
      }
      .num {
        font-variant-numeric: tabular-nums;
      }
      .muted {
        margin: 0;
        font-size: var(--fs-small);
        color: var(--text-faint);
      }
      .error {
        margin: 0;
        font-size: var(--fs-small);
        color: var(--danger);
      }

      /* Deslizadores grandes, cómodos con el dedo */
      .slider {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 36px;
        margin: 0;
        border-radius: 12px;
        background: var(--panel);
        border: 1px solid var(--panel-border);
        outline: none;
        touch-action: pan-x;
      }
      .slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 22px;
        height: 34px;
        border-radius: 10px;
        background: #fff;
        border: 2px solid rgba(0, 0, 0, 0.25);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
      }
      .slider::-moz-range-thumb {
        width: 22px;
        height: 34px;
        border-radius: 10px;
        background: #fff;
        border: 2px solid rgba(0, 0, 0, 0.25);
      }
      .slider.brightness {
        background: linear-gradient(90deg, #1b1b1b, #ffd28a);
      }
      .slider.temp {
        background: linear-gradient(90deg, #ffa24a, #fff1dc, #cfe2ff);
      }
      .slider.hue {
        background: linear-gradient(
          90deg,
          hsl(0 100% 55%),
          hsl(60 100% 55%),
          hsl(120 100% 50%),
          hsl(180 100% 50%),
          hsl(240 100% 60%),
          hsl(300 100% 55%),
          hsl(359 100% 55%)
        );
      }
      .slider.position {
        background: linear-gradient(90deg, #2b2d32, color-mix(in srgb, var(--accent) 45%, transparent));
      }
      .swatches {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .swatch {
        width: 34px;
        height: 34px;
        border-radius: 50%;
        background: var(--c);
        border: 2px solid transparent;
        box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2);
      }
      .swatch.white {
        background: radial-gradient(circle at 35% 35%, #fff, #ffe9cc);
      }
      .swatch.sel {
        border-color: var(--text);
        box-shadow: 0 0 0 3px var(--panel-strong) inset;
      }
      select {
        font: inherit;
        color: var(--text);
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: 12px;
        padding: 10px 12px;
      }

      .cover {
        display: flex;
        gap: var(--space-3);
        align-items: stretch;
      }
      .window {
        position: relative;
        width: 84px;
        min-height: 120px;
        border-radius: 10px;
        border: 3px solid #16171a;
        background: linear-gradient(160deg, #9fd8ff, #4d8fd6);
        overflow: hidden;
        flex: none;
      }
      .blind {
        position: absolute;
        inset: 0 0 auto 0;
        background: repeating-linear-gradient(180deg, #2b2d32 0 7px, #1a1b1f 7px 9px);
        transition: height 0.3s var(--ease-out);
      }
      .cover-actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex: 1;
      }
      .action,
      .preset {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 10px;
        border-radius: 14px;
        background: var(--panel);
        border: 1px solid var(--panel-border);
        color: var(--text);
        font-weight: 600;
      }
      .action {
        flex: 1;
      }
      .presets {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 6px;
      }
      .preset {
        padding: 10px 0;
        font-size: var(--fs-small);
      }
      .preset.sel {
        border-color: var(--accent);
        color: var(--accent);
      }
      .action:active,
      .preset:active,
      .power:active,
      .swatch:active {
        transform: scale(0.96);
      }
    `,
  ];
}

const num = (e: Event) => Number((e.target as HTMLInputElement).value);

declare global {
  interface HTMLElementTagNameMap {
    "h3d-control-panel": ControlPanel;
  }
}
