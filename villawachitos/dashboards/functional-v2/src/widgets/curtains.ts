import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { mdiArrowCollapseHorizontal, mdiArrowExpandHorizontal, mdiStop } from "@mdi/js";
import type { HomeAssistant } from "../types";
import { shared } from "../styles/tokens";
import { call, icon, isUnavailable, st } from "../lib/ha";

/** Posiciones rápidas (% de apertura). */
const PRESETS = [0, 25, 50, 75, 100];

const LABEL: Record<string, string> = {
  open: "Abierta",
  closed: "Cerrada",
  opening: "Abriendo…",
  closing: "Cerrando…",
};

/** Cortina: se corre en horizontal, mitad a cada lado. Dibujo con dos hojas, botones y apertura exacta. */
@customElement("fv2-curtain")
export class CurtainControl extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property() entity = "";
  @property() name = "";

  render() {
    const e = st(this.hass, this.entity);
    const na = isUnavailable(e);
    const known =
      e?.state === "open" || e?.state === "closed" || e?.state === "opening" || e?.state === "closing";
    const real = (e?.attributes.current_position as number | undefined) ?? (e?.state === "open" ? 100 : 0);
    const pos = real;
    const moving = e?.state === "opening" || e?.state === "closing";
    // Cada hoja ocupa la mitad de lo que queda cerrado
    const leaf = (100 - pos) / 2;
    const svc = (s: string, data: Record<string, unknown> = {}) =>
      call(this.hass, "cover", s, { entity_id: this.entity, ...data });
    return html`
      <div class="row ${na ? "na" : ""}">
        <div class="window" aria-hidden="true">
          <div class="sky"></div>
          <div class="leaf l ${moving ? "moving" : ""}" style="width:${leaf}%"></div>
          <div class="leaf r ${moving ? "moving" : ""}" style="width:${leaf}%"></div>
        </div>
        <div class="info">
          <b>${this.name}</b>
          <span class="muted"
            >${
              na
                ? "Sin conexión"
                : known
                  ? `${LABEL[e!.state]} · ${Math.round(pos)} %`
                  : "Posición desconocida"
            }</span
          >
        </div>
        <div class="btns">
          <button class="round" title="Abrir" @click=${() => svc("open_cover")}>
            ${icon(mdiArrowExpandHorizontal)}
          </button>
          <button class="round" title="Parar" @click=${() => svc("stop_cover")}>${icon(mdiStop)}</button>
          <button class="round" title="Cerrar" @click=${() => svc("close_cover")}>
            ${icon(mdiArrowCollapseHorizontal)}
          </button>
        </div>
      </div>
      <div class="presets ${na ? "na" : ""}">
        ${PRESETS.map(
          (p) =>
            html`<button
              class="preset ${Math.round(real) === p ? "on" : ""}"
              aria-label="${this.name} al ${p} %"
              @click=${() => svc("set_cover_position", { position: p })}
            >
              ${p} %
            </button>`,
        )}
      </div>
    `;
  }

  static styles = [
    shared,
    css`
      :host {
        display: block;
        padding: 10px 12px;
        border-radius: var(--radius-sm);
        background: var(--chip);
      }
      .row {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .na {
        opacity: 0.5;
        pointer-events: none;
      }
      .window {
        position: relative;
        width: 52px;
        height: 44px;
        border-radius: 8px;
        overflow: hidden;
        border: 2px solid var(--glass-strong);
        flex: none;
      }
      .sky {
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, var(--sky-soft), var(--sky));
      }
      .leaf {
        position: absolute;
        top: 0;
        bottom: 0;
        background: repeating-linear-gradient(90deg, var(--chip-strong) 0 4px, var(--track) 4px 6px);
        transition: width 1.4s var(--ease-soft);
      }
      .leaf.l {
        left: 0;
      }
      .leaf.r {
        right: 0;
      }
      .leaf.moving {
        animation: pulse 1.2s ease-in-out infinite;
      }
      @keyframes pulse {
        50% {
          opacity: 0.7;
        }
      }
      .info {
        flex: 1;
        display: grid;
        gap: 4px;
        min-width: 0;
      }
      .info b {
        font-size: var(--fs-small);
      }
      .info span {
        font-size: var(--fs-label);
      }
      .btns {
        display: flex;
        gap: 4px;
      }
      .presets {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 6px;
        margin-top: 10px;
      }
      .preset {
        display: grid;
        place-items: center;
        padding: 0;
        text-align: center;
        line-height: 1;
        min-height: 36px;
        border-radius: 999px;
        background: var(--glass-strong);
        color: var(--text);
        font-size: var(--fs-label);
        font-weight: 600;
        transition: transform 200ms var(--ease);
      }
      .preset:active {
        transform: scale(0.94);
      }
      .preset.on {
        background: var(--sky);
        color: #fff;
      }
      .btns .round {
        width: 36px;
        height: 36px;
        background: var(--glass-strong);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "fv2-curtain": CurtainControl;
  }
}
