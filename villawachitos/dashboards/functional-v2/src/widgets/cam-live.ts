import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { mdiRefresh } from "@mdi/js";
import type { HomeAssistant } from "../types";
import { shared } from "../styles/tokens";
import { icon } from "../lib/ha";
import { isUnavailableCam, mjpegUrl, startLive, type LiveStream } from "../lib/cameras";
import "./cam-thumb";

/** `live`: WebRTC; `mjpeg` e `images` son las alternativas si el directo no arranca. */
type Source = "connecting" | "live" | "mjpeg" | "images";

/**
 * Una cámara: en directo fluido (WebRTC) si `live`, o una imagen que se renueva cada `snapEvery` segundos.
 * Si el directo no arranca, cae a MJPEG (solo con `mjpeg`) y después a imágenes cada segundo.
 */
@customElement("fv2-cam-live")
export class CamLive extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property() entity = "";
  @property() name = "";
  @property({ type: Boolean }) live = false;
  @property() fit: "cover" | "contain" = "cover";
  @property({ type: Boolean, reflect: true }) fill = false;
  /** Permite el vídeo MJPEG como segunda opción (con varias cámaras a la vez es demasiado pesado) */
  @property({ type: Boolean }) mjpeg = false;
  /** Segundos entre imágenes cuando no hay directo */
  @property({ type: Number }) snapEvery = 3;
  @property() alert: "" | "animal" | "person" = "";
  @state() private source: Source = "connecting";
  @state() private why = "";
  @query("video") private video?: HTMLVideoElement;
  private stream?: LiveStream;
  private key = "";

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stop();
  }

  private stop(): void {
    this.stream?.stop();
    this.stream = undefined;
    this.key = "";
  }

  protected updated(changed: PropertyValues<this>): void {
    if (!changed.has("entity") && !changed.has("live") && this.key) return;
    const key = this.live && this.entity ? this.entity : "";
    if (key === this.key) return;
    this.stop();
    this.key = key;
    if (key) void this.connect();
  }

  private async connect(): Promise<void> {
    const entity = this.entity;
    this.source = "connecting";
    this.why = "";
    if (!this.hass || isUnavailableCam(this.hass, entity)) {
      this.source = "images";
      return;
    }
    if (typeof RTCPeerConnection === "undefined") return this.fallback("Este navegador no admite WebRTC");
    await this.updateComplete;
    const video = this.video;
    if (!video) return;
    try {
      this.stream = await startLive(
        this.hass,
        entity,
        video,
        () => entity === this.entity && (this.source = "live"),
        (why) => entity === this.entity && this.fallback(why),
      );
    } catch (err) {
      this.fallback(String((err as { message?: string })?.message ?? err));
    }
  }

  private fallback(why: string): void {
    this.stream?.stop();
    this.stream = undefined;
    this.why = why;
    this.source = this.mjpeg && mjpegUrl(this.hass, this.entity) ? "mjpeg" : "images";
  }

  private retry(): void {
    this.stop();
    this.key = this.entity;
    void this.connect();
  }

  private thumb(every: number) {
    return html`<fv2-cam-thumb
      .hass=${this.hass}
      .entity=${this.entity}
      .name=${this.name}
      .interval=${every}
      .fit=${this.fit}
      .fill=${this.fill}
      .alert=${this.alert}
    ></fv2-cam-thumb>`;
  }

  render() {
    if (!this.live) return this.thumb(this.snapEvery);
    if (this.source === "images") return html`${this.thumb(1)}${this.note()}`;
    return html`<div class="box ${this.alert}" style="--fit:${this.fit}">
      <video
        class=${this.source === "live" ? "show" : ""}
        autoplay
        muted
        playsinline
        disablepictureinpicture
      ></video>
      ${
        this.source === "mjpeg"
          ? html`<img
              src=${mjpegUrl(this.hass, this.entity) ?? ""}
              alt=${this.name}
              @error=${() => (this.source = "images")}
            />`
          : nothing
      }
      ${this.source === "connecting" ? html`<div class="msg">Conectando…</div>` : nothing}
      ${this.name ? html`<span class="lbl">${this.name}</span>` : nothing}
      ${this.source === "mjpeg" ? this.note() : nothing}
    </div>`;
  }

  /** Aviso de que no hay directo, solo con una cámara grande (`fill`) */
  private note() {
    if (!this.fill) return nothing;
    return html`<div class="note">
      <span
        >${this.source === "mjpeg" ? "Vídeo alternativo" : "Imágenes cada segundo"}${this.why ? ` · ${this.why}` : ""}</span
      >
      <button class="btn sm" @click=${this.retry}>${icon(mdiRefresh)} Reintentar directo</button>
    </div>`;
  }

  static styles = [
    shared,
    css`
      :host {
        display: block;
        position: relative;
      }
      :host([fill]) {
        height: 100%;
      }
      .box {
        position: relative;
        aspect-ratio: 16 / 9;
        border-radius: var(--radius-sm);
        overflow: hidden;
        background: var(--track);
        border: 2px solid transparent;
      }
      :host([fill]) .box {
        aspect-ratio: auto;
        height: 100%;
        border-radius: 0;
      }
      .box.animal {
        border-color: var(--amber);
      }
      .box.person {
        border-color: var(--danger);
      }
      video,
      img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: var(--fit, cover);
      }
      video {
        opacity: 0;
      }
      video.show {
        opacity: 1;
      }
      .msg {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
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
      .note {
        position: absolute;
        left: 8px;
        right: 8px;
        bottom: 8px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 6px 10px;
        border-radius: 10px;
        background: #000;
        font-size: var(--fs-label);
        color: #d0d0d0;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "fv2-cam-live": CamLive;
  }
}
