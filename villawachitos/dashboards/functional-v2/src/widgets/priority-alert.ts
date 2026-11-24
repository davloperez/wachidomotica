import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  mdiBellRing,
  mdiCheck,
  mdiClose,
  mdiDoorOpen,
  mdiMapMarkerOutline,
  mdiPause,
  mdiSmokeDetectorVariantAlert,
  mdiVolumeOff,
  mdiWaterAlert,
} from "@mdi/js";
import type { HomeAssistant } from "../types";
import { shared } from "../styles/tokens";
import { call, icon, st } from "../lib/ha";
import { DOORBELL, SMOKE, VACUUM_LEAK, type PriorityAlert } from "../lib/priority";

const hhmm = (t: number) => new Date(t).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

/**
 * Alertas prioritarias a pantalla completa (fondo opaco, sin transparencias). Cada alerta es una
 * tarjeta grande con sus acciones. Eventos: `dismiss` (detail = clave) y `go` (detail = estancia).
 */
@customElement("fv2-priority")
export class PriorityAlerts extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ attribute: false }) alerts: PriorityAlert[] = [];
  @state() private armed = false;
  @state() private opening?: "sent" | "open" | "error";
  private armTimer = 0;
  private doneTimer = 0;

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearTimeout(this.armTimer);
    window.clearTimeout(this.doneTimer);
  }

  private dismiss(a: PriorityAlert): void {
    this.armed = false;
    this.opening = undefined;
    this.dispatchEvent(new CustomEvent("dismiss", { detail: a.key, bubbles: true, composed: true }));
  }

  private go(a: PriorityAlert, room: string): void {
    this.dismiss(a);
    this.dispatchEvent(new CustomEvent("go", { detail: room, bubbles: true, composed: true }));
  }

  /** Abrir la puerta pide un segundo toque (por si se toca sin querer). */
  private async open(a: PriorityAlert): Promise<void> {
    window.clearTimeout(this.armTimer);
    if (!this.armed) {
      this.armed = true;
      this.armTimer = window.setTimeout(() => (this.armed = false), 4000);
      return;
    }
    this.armed = false;
    this.opening = "sent";
    try {
      await this.hass?.callService("lock", "unlock", { entity_id: DOORBELL.lock });
      this.opening = "open";
      // La puerta ya está abierta: la alerta se va sola en un momento
      this.doneTimer = window.setTimeout(() => this.dismiss(a), 3500);
    } catch (err) {
      console.error("[functional-v2] abrir portero", err);
      this.opening = "error";
    }
  }

  render() {
    if (!this.alerts.length) return nothing;
    return html`<div class="screen" role="alertdialog" aria-live="assertive">
      ${this.alerts.map((a) =>
        a.kind === "doorbell" ? this.doorbell(a) : a.kind === "smoke" ? this.smoke(a) : this.leak(a),
      )}
    </div>`;
  }

  private doorbell(a: PriorityAlert) {
    const lock = st(this.hass, DOORBELL.lock);
    const unavailable = !lock || lock.state === "unavailable";
    const label =
      this.opening === "sent"
        ? "Abriendo…"
        : this.opening === "open"
          ? "Puerta abierta"
          : this.opening === "error"
            ? "No se pudo abrir · reintentar"
            : this.armed
              ? "Toca otra vez para abrir"
              : "Abrir puerta";
    return html`<section class="card bell">
      <span class="halo"><span class="big anim-shake">${icon(mdiBellRing)}</span></span>
      <div class="txt">
        <h2>Llaman a la puerta</h2>
        <p>Portero de la calle · ${hhmm(a.since)}</p>
      </div>
      <div class="actions">
        <button
          class="btn big ${this.armed ? "armed" : "primary"} ${this.opening === "open" ? "done" : ""}"
          ?disabled=${unavailable || this.opening === "sent" || this.opening === "open"}
          @click=${() => this.open(a)}
        >
          ${icon(this.opening === "open" ? mdiCheck : mdiDoorOpen)}
          ${unavailable ? "Portero sin conexión" : label}
        </button>
        <button class="btn big" @click=${() => this.dismiss(a)}>${icon(mdiClose)} Descartar</button>
      </div>
    </section>`;
  }

  private smoke(a: PriorityAlert) {
    const muted = st(this.hass, SMOKE.silence)?.state === "on";
    const canMute = !!st(this.hass, SMOKE.silence) && st(this.hass, SMOKE.silence)!.state !== "unavailable";
    return html`<section class="card leak">
      <span class="halo"><span class="big anim-shake">${icon(mdiSmokeDetectorVariantAlert)}</span></span>
      <div class="txt">
        <h2>Humo en la cocina</h2>
        <p>Detector de humo · desde las ${hhmm(a.since)}</p>
      </div>
      <div class="actions">
        ${
          canMute
            ? html`<button
                class="btn big danger"
                ?disabled=${muted}
                @click=${() => call(this.hass, "switch", "turn_on", { entity_id: SMOKE.silence })}
              >
                ${icon(mdiVolumeOff)} ${muted ? "Alarma silenciada" : "Silenciar la alarma"}
              </button>`
            : nothing
        }
        <button class="btn big primary" @click=${() => this.go(a, SMOKE.room)}>
          ${icon(mdiMapMarkerOutline)} Ver en el plano
        </button>
        <button class="btn big" @click=${() => this.dismiss(a)}>${icon(mdiClose)} Descartar</button>
      </div>
    </section>`;
  }

  private leak(a: PriorityAlert) {
    const vac = st(this.hass, VACUUM_LEAK.vacuum);
    const busy = vac && ["cleaning", "returning"].includes(vac.state);
    return html`<section class="card leak">
      <span class="halo"><span class="big anim-bob">${icon(mdiWaterAlert)}</span></span>
      <div class="txt">
        <h2>Fuga de agua</h2>
        <p>Sensor de la base del limpiasuelos (salón) · desde las ${hhmm(a.since)}</p>
      </div>
      <div class="actions">
        ${
          busy
            ? html`<button
                class="btn big danger"
                @click=${() => call(this.hass, "vacuum", "pause", { entity_id: VACUUM_LEAK.vacuum })}
              >
                ${icon(mdiPause)} Pausar el robot
              </button>`
            : nothing
        }
        <button class="btn big primary" @click=${() => this.go(a, VACUUM_LEAK.room)}>
          ${icon(mdiMapMarkerOutline)} Ver en el plano
        </button>
        <button class="btn big" @click=${() => this.dismiss(a)}>${icon(mdiClose)} Descartar</button>
      </div>
    </section>`;
  }

  static styles = [
    shared,
    css`
      :host {
        position: absolute;
        inset: 0;
        z-index: 50;
        pointer-events: none;
      }
      .screen {
        position: absolute;
        inset: 0;
        pointer-events: auto;
        background: var(--bg);
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: var(--space-4);
        padding: var(--space-4);
      }
      .card {
        width: min(560px, 100%);
        margin: 0 auto;
        display: grid;
        justify-items: center;
        text-align: center;
        gap: var(--space-3);
        padding: var(--space-4) var(--space-4) var(--space-4);
        border-radius: var(--radius);
        background: var(--glass);
        border: 2px solid var(--amber);
        animation: rise 300ms var(--ease) both;
      }
      .card.leak {
        border-color: var(--danger);
      }
      .halo {
        position: relative;
        display: grid;
        place-items: center;
        width: 112px;
        height: 112px;
        border-radius: 50%;
        background: var(--amber);
        color: #fff;
      }
      .leak .halo {
        background: var(--danger);
      }
      /* Dos anillos que se expanden (solo transform/opacity) */
      .halo::before,
      .halo::after {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: 50%;
        border: 3px solid var(--amber);
        animation: ring 2s ease-out infinite;
      }
      .halo::after {
        animation-delay: 1s;
      }
      .leak .halo::before,
      .leak .halo::after {
        border-color: var(--danger);
      }
      .big svg {
        width: 58px;
        height: 58px;
      }
      h2 {
        margin: 0;
        font-family: var(--font-display);
        font-weight: 500;
        font-size: var(--fs-hero);
        line-height: 1.05;
      }
      p {
        margin: 6px 0 0;
        color: var(--text-muted);
        font-size: var(--fs-body);
      }
      .actions {
        display: grid;
        gap: 10px;
        width: 100%;
      }
      .btn.big {
        min-height: 60px;
        font-size: var(--fs-body);
        font-weight: 700;
        border-radius: 18px;
      }
      .btn.big svg {
        width: 24px;
        height: 24px;
      }
      .btn.danger {
        background: var(--danger);
        color: #fff;
      }
      .btn.done {
        background: var(--sage);
        color: #fff;
      }
      .btn[disabled] {
        cursor: default;
      }
      .btn[disabled]:not(.done) {
        opacity: 0.6;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "fv2-priority": PriorityAlerts;
  }
}
