import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  mdiCeilingLight,
  mdiClose,
  mdiDotsHorizontal,
  mdiLamp,
  mdiLedStripVariant,
  mdiLightbulbOutline,
  mdiPool,
  mdiPower,
  mdiWallSconceRound,
  mdiCloudOutline,
  mdiDeskLamp,
  mdiLightRecessed,
  mdiTuneVariant,
} from "@mdi/js";
import type { HomeAssistant } from "../types";
import { shared } from "../styles/tokens";
import { brightnessPct, call, icon, isDimmable, isUnavailable, lightColor, moreInfo, st } from "../lib/ha";
import { lampKind } from "../house/rooms";
import type { Slider } from "./slider";
import "./slider";

/** Iconos que no salen del tipo de luminaria del plano: se eligen por entidad. */
const ICON_OVERRIDE: [RegExp, string][] = [
  [/luz_nube/, mdiCloudOutline],
  [/mesita/, mdiCeilingLight], // lámparas colgantes
  [/fregadero/, mdiLedStripVariant],
  [/luz_isla/, mdiLightRecessed], // luz de cocinar, empotrada
  [/lampara_pro_mi|desk_lamp/, mdiDeskLamp], // flexos modernos, sin tulipa
];

export function lightIcon(entity: string): string {
  const over = ICON_OVERRIDE.find(([re]) => re.test(entity));
  if (over) return over[1];
  switch (lampKind(entity)) {
    case "ceiling":
    case "downlights":
      return mdiLightRecessed;
    case "strip":
      return mdiLedStripVariant;
    case "lamp":
      return mdiLamp;
    case "wall":
      return mdiWallSconceRound;
    case "pool":
      return mdiPool;
    default:
      return mdiLightbulbOutline;
  }
}

/** Tiras WLED (cortineros del salón y de las oficinas): tienen presets en lugar de deslizador. */
export const isWled = (entity: string): boolean => /wled/.test(entity);

export interface WledPreset {
  id: string;
  label: string;
  data: Record<string, unknown>;
}

/** Presets de las tiras WLED (RGBW). */
export const WLED_PRESETS: WledPreset[] = [
  {
    id: "ambiente",
    label: "Ambiente",
    data: { effect: "Solid", rgbw_color: [40, 15, 0, 255], brightness_pct: 30 },
  },
  { id: "aurora", label: "Aurora", data: { effect: "Pacifica", brightness_pct: 70 } },
  {
    id: "calido",
    label: "Cálido",
    data: { effect: "Solid", rgbw_color: [255, 70, 0, 15], brightness_pct: 60 },
  },
  {
    id: "maximo",
    label: "Máximo",
    data: { effect: "Solid", rgbw_color: [255, 255, 255, 255], brightness_pct: 100 },
  },
];

/** Efectos que se ofrecen en la hoja de una tira WLED. */
const WLED_EFFECTS = ["Solid", "Random Colors", "Dynamic", "Scan", "Pacifica", "Rainbow"];

export function applyWledPreset(hass: HomeAssistant | undefined, entity: string, id: string): void {
  const p = WLED_PRESETS.find((x) => x.id === id);
  if (p) call(hass, "light", "turn_on", { entity_id: entity, ...p.data });
}

/** Tocar una luz: la apaga si está encendida; si está apagada la enciende (las tiras WLED, en modo Ambiente). */
export function toggleLight(hass: HomeAssistant | undefined, entity: string): void {
  if (isWled(entity) && st(hass, entity)?.state !== "on") applyWledPreset(hass, entity, "ambiente");
  else call(hass, "light", "toggle", { entity_id: entity });
}

/** Mosaico de una luz: tocar enciende/apaga; el deslizador regula (o los presets, en las WLED); el icono de ajustes abre el detalle. */
@customElement("fv2-light-tile")
export class LightTile extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property() entity = "";
  @property() name = "";
  @state() private draft?: number;

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("hass") && this.draft !== undefined) {
      const prev = (changed.get("hass") as HomeAssistant | undefined)?.states[this.entity];
      const next = this.hass?.states[this.entity];
      if (prev?.last_updated !== next?.last_updated) this.draft = undefined;
    }
  }

  render() {
    const e = st(this.hass, this.entity);
    const off = isUnavailable(e);
    const on = e?.state === "on";
    const dim = isDimmable(e);
    const wled = isWled(this.entity);
    const pct = this.draft ?? brightnessPct(e);
    const color = lightColor(e);
    const extra = dim || ((e?.attributes.effect_list as string[] | undefined)?.length ?? 0) > 0;
    return html`
      <div
        class="tile ${on ? "on" : ""} ${off ? "na" : ""}"
        style="--lamp:${color}"
        @click=${() => !off && toggleLight(this.hass, this.entity)}
      >
        <span class="bulb">${icon(lightIcon(this.entity))}</span>
        <div class="txt">
          <b>${this.name}</b>
          <span>${off ? "Sin conexión" : on ? (dim ? `${pct} %` : "Encendida") : "Apagada"}</span>
        </div>
        ${
          extra && !off
            ? html`<button
                class="mini"
                title="Ajustes"
                @click=${(ev: Event) => {
                  ev.stopPropagation();
                  this.dispatchEvent(
                    new CustomEvent("open-light", {
                      detail: { entity: this.entity, name: this.name },
                      bubbles: true,
                      composed: true,
                    }),
                  );
                }}
              >
                ${icon(mdiTuneVariant)}
              </button>`
            : nothing
        }
        <span class="toggle amber ${on ? "on" : ""}"></span>
      </div>
      ${
        wled && !off
          ? html`<div class="presets">
              ${WLED_PRESETS.map(
                (p) =>
                  html`<button class="preset" @click=${() => applyWledPreset(this.hass, this.entity, p.id)}>
                    ${p.label}
                  </button>`,
              )}
            </div>`
          : nothing
      }
      ${
        dim && !off && !wled
          ? html`<fv2-slider
              variant="thin"
              min="1"
              max="100"
              label="Intensidad ${this.name}"
              .value=${Math.max(1, pct)}
              .pct=${on ? pct : 0}
              fill=${on ? "var(--amber)" : "var(--text-faint)"}
              @input=${(ev: Event) => (this.draft = Number((ev.target as Slider).value))}
              @change=${(ev: Event) =>
                call(this.hass, "light", "turn_on", {
                  entity_id: this.entity,
                  brightness_pct: Number((ev.target as Slider).value),
                })}
            ></fv2-slider>`
          : nothing
      }
    `;
  }

  static styles = [
    shared,
    css`
      :host {
        display: grid;
        gap: 8px;
        padding: 10px 12px;
        border-radius: var(--radius-sm);
        background: var(--chip);
        transition: background 400ms var(--ease);
      }
      :host(:has(.tile.on)) {
        background: var(--amber-soft);
      }
      .tile {
        display: flex;
        align-items: center;
        gap: 10px;
        cursor: pointer;
      }
      .tile.na {
        opacity: 0.5;
        cursor: default;
      }
      .bulb {
        position: relative;
        display: grid;
        place-items: center;
        width: 38px;
        height: 38px;
        border-radius: 50%;
        background: var(--glass-strong);
        color: var(--text-faint);
        transition: color 300ms;
        flex: none;
      }
      .on .bulb {
        color: var(--lamp);
        box-shadow: 0 0 0 4px var(--amber-soft);
      }
      .on .bulb::after {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: 50%;
        border: 2px solid var(--lamp);
        animation: ring 2.6s ease-out infinite;
      }
      .txt {
        display: grid;
        flex: 1;
        min-width: 0;
      }
      .txt b {
        font-size: var(--fs-small);
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .txt span {
        font-size: var(--fs-label);
        color: var(--text-muted);
      }
      .presets {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
      }
      .preset {
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 8px 4px;
        border-radius: var(--radius-sm);
        background: var(--glass-strong);
        color: var(--text);
        font-size: var(--fs-label);
        font-weight: 600;
      }
      .mini {
        display: grid;
        place-items: center;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        color: var(--text-muted);
      }
    `,
  ];
}

const SWATCHES: [number, number][] = [
  [28, 85],
  [42, 80],
  [0, 70],
  [330, 55],
  [275, 55],
  [220, 70],
  [175, 60],
  [120, 50],
];
const COLOR_MODES = ["hs", "xy", "rgb", "rgbw", "rgbww"];

/** Hoja de detalle de una luz: intensidad, temperatura, color y efectos. */
@customElement("fv2-light-sheet")
export class LightSheet extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property() entity = "";
  @property() name = "";
  @state() private draft: Record<string, number> = {};

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("entity")) this.draft = {};
    else if (changed.has("hass")) {
      const prev = (changed.get("hass") as HomeAssistant | undefined)?.states[this.entity];
      const next = this.hass?.states[this.entity];
      if (prev?.last_updated !== next?.last_updated) this.draft = {};
    }
  }

  private close() {
    this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
  }

  private turnOn(data: Record<string, unknown>) {
    call(this.hass, "light", "turn_on", { entity_id: this.entity, ...data });
  }

  render() {
    const e = st(this.hass, this.entity);
    if (!e) return nothing;
    const a = e.attributes;
    const on = e.state === "on";
    const modes = (a.supported_color_modes as string[] | undefined) ?? ["onoff"];
    const hasTemp = modes.includes("color_temp");
    const hasColor = modes.some((m) => COLOR_MODES.includes(m));
    const allFx = (a.effect_list as string[] | undefined) ?? [];
    const effects = isWled(this.entity) ? WLED_EFFECTS.filter((fx) => allFx.includes(fx)) : allFx;
    const pct = this.draft.b ?? brightnessPct(e);
    const minK = (a.min_color_temp_kelvin as number | undefined) ?? 2200;
    const maxK = (a.max_color_temp_kelvin as number | undefined) ?? 6500;
    const kelvin = this.draft.k ?? (a.color_temp_kelvin as number | undefined) ?? 3000;
    const hue = this.draft.h ?? (a.hs_color as [number, number] | undefined)?.[0] ?? 30;
    const color = lightColor(e);

    return html`
      <div class="scrim" @click=${this.close}></div>
      <section class="sheet glass" style="--lamp:${color}">
        <header>
          <span class="halo ${on ? "on" : ""}">${icon(lightIcon(this.entity))}</span>
          <div class="ttl">
            <h3>${this.name}</h3>
            <span class="muted">${on ? `Encendida · ${pct} %` : "Apagada"}</span>
          </div>
          <button class="round" title="Más opciones" @click=${() => moreInfo(this, this.entity)}>
            ${icon(mdiDotsHorizontal)}
          </button>
          <button class="round" title="Cerrar" @click=${this.close}>${icon(mdiClose)}</button>
        </header>

        <button
          class="btn ${on ? "primary" : ""} power"
          @click=${() => call(this.hass, "light", "toggle", { entity_id: this.entity })}
        >
          ${icon(mdiPower)} ${on ? "Apagar" : "Encender"}
        </button>

        ${
          modes.some((m) => m !== "onoff")
            ? html`<label class="field">
                <span>Intensidad <b class="num">${pct} %</b></span>
                <fv2-slider
                  min="1"
                  max="100"
                  label="Intensidad"
                  .value=${Math.max(1, pct)}
                  @input=${(ev: Event) => (this.draft = { ...this.draft, b: val(ev) })}
                  @change=${(ev: Event) => this.turnOn({ brightness_pct: val(ev) })}
                ></fv2-slider>
              </label>`
            : nothing
        }
        ${
          hasTemp
            ? html`<label class="field">
                <span>Temperatura <b class="num">${kelvin} K</b></span>
                <fv2-slider
                  variant="temp"
                  min=${minK}
                  max=${maxK}
                  step="50"
                  label="Temperatura"
                  .value=${kelvin}
                  @input=${(ev: Event) => (this.draft = { ...this.draft, k: val(ev) })}
                  @change=${(ev: Event) => this.turnOn({ color_temp_kelvin: val(ev) })}
                ></fv2-slider>
              </label>`
            : nothing
        }
        ${
          hasColor
            ? html`<div class="field">
                <span>Color</span>
                <div class="swatches">
                  ${
                    hasTemp || modes.includes("rgbw") || modes.includes("white")
                      ? html`<button
                          class="sw white"
                          title="Blanco cálido"
                          @click=${() =>
                            this.turnOn(
                              hasTemp
                                ? { color_temp_kelvin: Math.max(minK, 2900) }
                                : modes.includes("white")
                                  ? { white: true }
                                  : { rgbw_color: [0, 0, 0, 255] },
                            )}
                        ></button>`
                      : nothing
                  }
                  ${SWATCHES.map(
                    ([h, s]) =>
                      html`<button
                        class="sw"
                        style="--c:hsl(${h} ${s}% 62%)"
                        @click=${() => this.turnOn({ hs_color: [h, s] })}
                      ></button>`,
                  )}
                </div>
                <fv2-slider
                  variant="hue"
                  min="0"
                  max="359"
                  label="Tono"
                  .value=${Math.round(hue)}
                  @input=${(ev: Event) => (this.draft = { ...this.draft, h: val(ev) })}
                  @change=${(ev: Event) => this.turnOn({ hs_color: [val(ev), 75] })}
                ></fv2-slider>
              </div>`
            : nothing
        }
        ${
          effects.length
            ? html`<div class="field">
                <span>Efecto</span>
                <div class="fx scroll">
                  ${effects.map(
                    (fx) =>
                      html`<button
                        class="pill ${fx === a.effect ? "ok" : ""}"
                        @click=${() => this.turnOn({ effect: fx })}
                      >
                        ${fx}
                      </button>`,
                  )}
                </div>
              </div>`
            : nothing
        }
      </section>
    `;
  }

  static styles = [
    shared,
    css`
      :host {
        position: absolute;
        inset: 0;
        z-index: 20;
        display: grid;
        place-items: center;
      }
      .scrim {
        position: absolute;
        inset: 0;
        background: var(--bg);
        animation: fade 400ms ease forwards;
      }
      @keyframes fade {
        from {
          opacity: 0;
        }
      }
      .sheet {
        position: relative;
        width: min(440px, calc(100% - 32px));
        max-height: calc(100% - 64px);
        overflow-y: auto;
        padding: var(--space-4);
        display: grid;
        gap: var(--space-3);
        background: var(--glass-strong);
        animation: rise 300ms var(--ease);
      }
      header {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .ttl {
        flex: 1;
        display: grid;
      }
      h3 {
        margin: 0;
        font-family: var(--font-display);
        font-weight: 500;
        font-size: var(--fs-title);
      }
      .halo {
        display: grid;
        place-items: center;
        width: 52px;
        height: 52px;
        border-radius: 50%;
        background: var(--chip);
        color: var(--text-faint);
        font-size: 22px;
      }
      .halo.on {
        color: var(--lamp);
        box-shadow: 0 0 0 4px var(--amber-soft);
      }
      .power {
        padding: 14px;
      }
      .field {
        display: grid;
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
      }
      .swatches {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .sw {
        width: 34px;
        height: 34px;
        border-radius: 50%;
        background: var(--c);
        box-shadow: inset 0 0 0 2px #fff;
      }
      .sw.white {
        background: linear-gradient(135deg, #fff6e6, #ffd9a8);
      }
      .fx {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        max-height: 140px;
      }
      .fx .pill {
        font-size: var(--fs-small);
        padding: 8px 12px;
      }
    `,
  ];
}

const val = (ev: Event) => Number((ev.target as Slider).value);

declare global {
  interface HTMLElementTagNameMap {
    "fv2-light-tile": LightTile;
    "fv2-light-sheet": LightSheet;
  }
}
