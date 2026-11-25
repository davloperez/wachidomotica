import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { mdiClose, mdiViewGridOutline, mdiVideoOutline } from "@mdi/js";
import type { HomeAssistant } from "../types";
import { shared } from "../styles/tokens";
import { icon } from "../lib/ha";
import { allCameras, camAlert } from "../lib/cameras";
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
  /** Columnas de la cuadrícula, calculadas para aprovechar todo el espacio (celdas lo más cercanas a 16:9) */
  @state() private cols = 0;
  private observer?: ResizeObserver;

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.observer?.disconnect();
  }

  protected updated(): void {
    const grid = this.renderRoot.querySelector<HTMLElement>(".grid");
    if (!grid) {
      this.observer?.disconnect();
      this.observer = undefined;
      return;
    }
    if (this.observer) return;
    this.observer = new ResizeObserver(() => this.fitGrid(grid));
    this.observer.observe(grid);
    this.fitGrid(grid);
  }

  private fitGrid(grid: HTMLElement): void {
    const { width, height } = grid.getBoundingClientRect();
    const n = this.cams.length;
    if (!width || !height || !n) return;
    let best = 1;
    let bestArea = 0;
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      // Mayor imagen 16:9 que cabe en cada celda
      const w = Math.min(width / cols, ((height / rows) * 16) / 9);
      if (w > bestArea + 0.5) {
        bestArea = w;
        best = cols;
      }
    }
    if (best !== this.cols) this.cols = best;
  }

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
    const cols = this.cols || Math.ceil(Math.sqrt(this.cams.length));
    const rows = Math.ceil(this.cams.length / cols);
    return html`<div class="grid" style="--cols:${cols};--rows:${rows}">
      ${this.cams.map(
        (c) =>
          html`<button class="cell" @click=${() => this.pick(c.entity)} aria-label=${c.name}>
            <fv2-cam-live
              .hass=${this.hass}
              .entity=${c.entity}
              .name=${c.name}
              .live=${this.live}
              .snapEvery=${3}
              .alert=${camAlert(this.hass, c)}
              fill
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
        overflow: hidden;
        display: grid;
        grid-template-columns: repeat(var(--cols, 1), minmax(0, 1fr));
        grid-template-rows: repeat(var(--rows, 1), minmax(0, 1fr));
        gap: 8px;
      }
      .cell {
        min-height: 0;
        overflow: hidden;
        border-radius: var(--radius-sm);
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
