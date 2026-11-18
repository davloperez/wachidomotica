import { LitElement, css, html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { mdiArrowCollapseDown, mdiArrowCollapseUp, mdiStop } from "@mdi/js";
import type { HomeAssistant } from "../types";
import { shared } from "../styles/tokens";
import { call, icon, isUnavailable, st } from "../lib/ha";

const LABEL: Record<string, string> = {
  open: "Abierta",
  closed: "Cerrada",
  opening: "Subiendo…",
  closing: "Bajando…",
};

/** Persiana: dibujo con lamas que bajan según la posición, botones y posición exacta. */
@customElement("fv2-cover")
export class CoverControl extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property() entity = "";
  @property() name = "";
  @state() private draft?: number;

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("hass") && this.draft !== undefined) {
      const prev = (changed.get("hass") as HomeAssistant | undefined)?.states[this.entity];
      const next = this.hass?.states[this.entity];
      if (prev?.attributes.current_position !== next?.attributes.current_position) this.draft = undefined;
    }
  }

  render() {
    const e = st(this.hass, this.entity);
    const na = isUnavailable(e);
    const real = (e?.attributes.current_position as number | undefined) ?? (e?.state === "open" ? 100 : 0);
    const pos = this.draft ?? real;
    const moving = e?.state === "opening" || e?.state === "closing";
    const svc = (s: string, data: Record<string, unknown> = {}) =>
      call(this.hass, "cover", s, { entity_id: this.entity, ...data });
    return html`
      <div class="row ${na ? "na" : ""}">
        <div class="window" aria-hidden="true">
          <div class="sky"></div>
          <div class="blind ${moving ? "moving" : ""}" style="height:${100 - pos}%"></div>
        </div>
        <div class="info">
          <b>${this.name}</b>
          <span class="muted"
            >${na ? "Sin conexión" : `${LABEL[e!.state] ?? e!.state} · ${Math.round(pos)} %`}</span
          >
          <input
            type="range"
            class="slider thin"
            min="0"
            max="100"
            step="5"
            aria-label="Apertura ${this.name}"
            .value=${String(pos)}
            style="--pct:${pos}%; --fill: var(--sky)"
            ?disabled=${na}
            @input=${(ev: Event) => (this.draft = Number((ev.target as HTMLInputElement).value))}
            @change=${(ev: Event) => svc("set_cover_position", { position: Number((ev.target as HTMLInputElement).value) })}
          />
        </div>
        <div class="btns">
          <button class="round" title="Subir" @click=${() => svc("open_cover")}>
            ${icon(mdiArrowCollapseUp)}
          </button>
          <button class="round" title="Parar" @click=${() => svc("stop_cover")}>${icon(mdiStop)}</button>
          <button class="round" title="Bajar" @click=${() => svc("close_cover")}>
            ${icon(mdiArrowCollapseDown)}
          </button>
        </div>
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
        width: 40px;
        height: 52px;
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
      .blind {
        position: absolute;
        left: 0;
        right: 0;
        top: 0;
        background: repeating-linear-gradient(180deg, var(--chip-strong) 0 4px, var(--track) 4px 6px);
        transition: height 1.4s var(--ease-soft);
      }
      .blind.moving {
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
    "fv2-cover": CoverControl;
  }
}
