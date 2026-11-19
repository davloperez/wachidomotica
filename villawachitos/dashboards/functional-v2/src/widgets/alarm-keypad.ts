import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { mdiBackspaceOutline, mdiClose, mdiShieldOffOutline } from "@mdi/js";
import type { HomeAssistant } from "../types";
import { shared } from "../styles/tokens";
import { icon, st } from "../lib/ha";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

/**
 * Teclado para desconectar la alarma con PIN (Alarmo).
 * El código lo comprueba Alarmo en el servidor: aquí solo se envía con `alarm_disarm`.
 * Alarmo no devuelve error si el código es incorrecto (lanza un evento), así que se
 * comprueba el estado de la alarma un momento después de enviarlo.
 */
@customElement("fv2-alarm-keypad")
export class AlarmKeypad extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property() entity = "";
  @state() private code = "";
  @state() private busy = false;
  @state() private error = "";

  private press(k: string) {
    if (this.busy) return;
    this.error = "";
    if (k === "del") this.code = this.code.slice(0, -1);
    else if (k && this.code.length < 12) this.code += k;
  }

  private async send() {
    if (!this.hass || !this.code || this.busy) return;
    this.busy = true;
    try {
      await this.hass.callService("alarm_control_panel", "alarm_disarm", {
        entity_id: this.entity,
        code: this.code,
      });
    } catch (err) {
      console.error("[functional-v2] alarm_disarm", err);
    }
    await new Promise((r) => window.setTimeout(r, 1200));
    this.busy = false;
    if (st(this.hass, this.entity)?.state === "disarmed") this.close();
    else {
      this.code = "";
      this.error = "Código incorrecto";
    }
  }

  private close() {
    this.code = "";
    this.error = "";
    this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
  }

  render() {
    return html`
      <div class="scrim" @click=${() => this.close()}></div>
      <div class="pad glass" role="dialog" aria-label="Desconectar alarma">
        <header>
          <b>Desconectar alarma</b>
          <button class="round" aria-label="Cerrar" @click=${() => this.close()}>${icon(mdiClose)}</button>
        </header>
        <div class="dots ${this.error ? "err" : ""}">
          ${this.code ? html`${"•".repeat(this.code.length)}` : html`<span class="faint">Introduce el PIN</span>`}
        </div>
        ${this.error ? html`<div class="msg">${this.error}</div>` : nothing}
        <div class="keys">
          ${KEYS.map((k) =>
            k === ""
              ? html`<span></span>`
              : html`<button
                  class="key"
                  aria-label=${k === "del" ? "Borrar" : k}
                  @click=${() => this.press(k)}
                >
                  ${k === "del" ? icon(mdiBackspaceOutline) : k}
                </button>`,
          )}
        </div>
        <button class="btn danger go" ?disabled=${!this.code || this.busy} @click=${() => this.send()}>
          ${icon(mdiShieldOffOutline)} ${this.busy ? "Comprobando…" : "Desconectar"}
        </button>
      </div>
    `;
  }

  static styles = [
    shared,
    css`
      :host {
        position: fixed;
        inset: 0;
        z-index: 50;
        display: grid;
        place-items: center;
      }
      .scrim {
        position: absolute;
        inset: 0;
        background: rgb(0 0 0 / 35%);
      }
      .pad {
        position: relative;
        display: grid;
        gap: 14px;
        width: min(320px, calc(100vw - 32px));
        padding: 18px;
        border-radius: 24px;
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .dots {
        text-align: center;
        font-size: 28px;
        letter-spacing: 6px;
        min-height: 36px;
      }
      .dots .faint {
        font-size: var(--fs-small);
        letter-spacing: 0;
      }
      .dots.err {
        color: var(--danger);
      }
      .msg {
        text-align: center;
        color: var(--danger);
        font-size: var(--fs-small);
        margin-top: -8px;
      }
      .keys {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }
      .key {
        display: grid;
        place-items: center;
        height: 56px;
        border-radius: 16px;
        background: var(--chip);
        color: var(--text);
        font-size: 22px;
        font-weight: 600;
      }
      .key:active {
        transform: scale(0.94);
      }
      .go {
        width: 100%;
      }
      .go[disabled] {
        opacity: 0.5;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "fv2-alarm-keypad": AlarmKeypad;
  }
}
