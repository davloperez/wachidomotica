import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { mdiVideoOffOutline } from "@mdi/js";
import type { HomeAssistant } from "../types";
import { shared } from "../styles/tokens";
import { icon } from "../lib/ha";
import { isUnavailableCam, snapshotUrl } from "../lib/cameras";

/**
 * Instantánea de una cámara que se renueva sola cada `interval` segundos mientras está en pantalla.
 * La imagen nueva se descarga aparte y solo se cambia cuando ya está lista (sin parpadeos).
 */
@customElement("fv2-cam-thumb")
export class CamThumb extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property() entity = "";
  @property() name = "";
  /** Segundos entre imágenes (0 = solo una vez) */
  @property({ type: Number }) interval = 20;
  /** Avisa con el borde en ámbar (gato) o rojo (persona) */
  @property() alert: "" | "animal" | "person" = "";
  /** Cómo encaja la imagen en su caja */
  @property() fit: "cover" | "contain" = "cover";
  /** Oculta el nombre superpuesto (para miniaturas pequeñas) */
  @property({ type: Boolean, attribute: "hide-label" }) hideLabel = false;
  /** Rellena todo el alto disponible en vez de mantener 16:9 */
  @property({ type: Boolean, reflect: true }) fill = false;
  @state() private src?: string;
  private timer = 0;
  private loading = false;

  connectedCallback(): void {
    super.connectedCallback();
    this.start();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this.timer);
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("entity") || changed.has("interval")) this.start();
  }

  private start(): void {
    window.clearInterval(this.timer);
    this.src = undefined;
    this.refresh();
    if (this.interval > 0) this.timer = window.setInterval(() => this.refresh(), this.interval * 1000);
  }

  private refresh(): void {
    if (this.loading || !this.entity || document.visibilityState === "hidden") return;
    if (isUnavailableCam(this.hass, this.entity)) {
      this.src = undefined;
      return;
    }
    const next = snapshotUrl(this.hass, this.entity, Date.now());
    if (!next) return;
    this.loading = true;
    const img = new Image();
    img.onload = () => {
      this.loading = false;
      this.src = next;
    };
    img.onerror = () => {
      this.loading = false;
    };
    img.src = next;
  }

  render() {
    const off = isUnavailableCam(this.hass, this.entity);
    return html`<div class="box ${this.alert}" style="--fit:${this.fit}">
      ${
        this.src && !off
          ? html`<img src=${this.src} alt=${this.name} draggable="false" />`
          : html`<div class="none">
              ${icon(mdiVideoOffOutline)}<span>${off ? "Sin conexión" : "Cargando…"}</span>
            </div>`
      }
      ${this.name && !this.hideLabel ? html`<span class="lbl">${this.name}</span>` : nothing}
    </div>`;
  }

  static styles = [
    shared,
    css`
      :host {
        display: block;
      }
      :host([fill]) {
        height: 100%;
      }
      :host([fill]) .box {
        aspect-ratio: auto;
        height: 100%;
        border-radius: 0;
      }
      .box {
        position: relative;
        aspect-ratio: 16 / 9;
        border-radius: var(--radius-sm);
        overflow: hidden;
        background: var(--track);
        border: 2px solid transparent;
      }
      .box.animal {
        border-color: var(--amber);
      }
      .box.person {
        border-color: var(--danger);
      }
      img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: var(--fit, cover);
      }
      .none {
        position: absolute;
        inset: 0;
        display: grid;
        place-content: center;
        justify-items: center;
        gap: 4px;
        color: var(--text-muted);
        font-size: var(--fs-label);
      }
      .lbl {
        position: absolute;
        left: 0;
        bottom: 0;
        padding: 3px 8px;
        border-top-right-radius: 8px;
        background: #000;
        color: #fff;
        font-size: var(--fs-label);
        font-weight: 600;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "fv2-cam-thumb": CamThumb;
  }
}
