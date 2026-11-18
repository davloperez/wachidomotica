import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { mdiClose, mdiViewGridOutline, mdiVideoOutline } from "@mdi/js";
import type { HomeAssistant } from "../types";
import { shared } from "../styles/tokens";
import { icon, isOn } from "../lib/ha";
import { allCameras } from "../lib/cameras";
import "./cam-live";

type Mode = "single" | "grid";

/**
 * Cámaras a pantalla completa: una en grande o todas en cuadrícula.
 * En escritorio todo va en directo fluido (WebRTC); en las Shelly y el móvil, imágenes cada 3 s.
 */
@customElement("fv2-camera-viewer")
export class CameraViewer extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  /** Cámara que se abre en grande */
  @property() entity = "";
  @property() mode: Mode = "single";
  /** Directo fluido (escritorio) o imágenes cada 3 s */
  @property({ type: Boolean }) live = false;

  private cams = allCameras();

  private close(): void {
    this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
  }

  private pick(entity: string): void {
    this.mode = "single";
    this.entity = entity;
  }

  private name(): string {
    return this.cams.find((c) => c.entity === this.entity)?.name ?? "Cámara";
  }

  private grid() {
    return html`<div class="grid">
      ${this.cams.map(
        (c) =>
          html`<button class="cell" @click=${() => this.pick(c.entity)} aria-label=${c.name}>
            <fv2-cam-live
              .hass=${this.hass}
              .entity=${c.entity}
              .name=${c.name}
              .live=${this.live}
              .snapEvery=${3}
              .alert=${isOn(this.hass, c.person) ? "person" : isOn(this.hass, c.motion) ? "motion" : ""}
            ></fv2-cam-live>
          </button>`,
      )}
    </div>`;
  }

  render() {
    const single = this.mode === "single";
    return html`
      <header>
        <div class="ttl">
          <b>${single ? this.name() : "Todas las cámaras"}</b>
          <span class="muted"
            >${this.live ? "En directo" : "Imagen cada 3 s"}${single ? "" : " · toca una para verla en grande"}</span
          >
        </div>
        <button class="btn" @click=${() => (this.mode = single ? "grid" : "single")}>
          ${icon(single ? mdiViewGridOutline : mdiVideoOutline)} ${single ? "Todas" : "Una sola"}
        </button>
        <button class="round" title="Cerrar" @click=${this.close}>${icon(mdiClose)}</button>
      </header>
      ${
        single
          ? html`<div class="stage">
                <fv2-cam-live
                  .hass=${this.hass}
                  .entity=${this.entity}
                  .live=${this.live}
                  .snapEvery=${3}
                  .mjpeg=${true}
                  .fit=${"contain"}
                  fill
                ></fv2-cam-live>
              </div>
              <nav>
                ${this.cams.map(
                  (c) =>
                    html`<button
                      class="chip ${c.entity === this.entity ? "on" : ""}"
                      @click=${() => this.pick(c.entity)}
                    >
                      ${c.name}
                    </button>`,
                )}
              </nav>`
          : this.grid()
      }
    `;
  }

  static styles = [
    shared,
    css`
      :host {
        position: absolute;
        inset: 0;
        z-index: 25;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px;
        background: #000;
        color: #fff;
      }
      header {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .ttl {
        flex: 1;
        display: grid;
        min-width: 0;
      }
      .ttl b {
        font-size: var(--fs-title);
      }
      .muted {
        color: #b9b9b9;
        font-size: var(--fs-label);
      }
      .stage {
        position: relative;
        flex: 1;
        min-height: 0;
        border-radius: var(--radius-sm);
        overflow: hidden;
        background: #111;
      }
      nav {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        padding-bottom: 2px;
      }
      .chip {
        flex: none;
        padding: 8px 14px;
        border-radius: 999px;
        border: 0;
        background: #2a2a2a;
        color: #fff;
        font: inherit;
        font-size: var(--fs-label);
        font-weight: 600;
      }
      .chip.on {
        background: var(--sky);
        color: #000;
      }
      .grid {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        align-content: start;
        gap: 8px;
      }
      .cell {
        padding: 0;
        border: 0;
        background: none;
        cursor: pointer;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "fv2-camera-viewer": CameraViewer;
  }
}
