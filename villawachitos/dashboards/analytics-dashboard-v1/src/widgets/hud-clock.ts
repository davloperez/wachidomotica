import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

/**
 * Reloj grande. Vive en su propio componente para que el tic de cada segundo
 * no obligue a renderizar el dashboard completo.
 */
@customElement("adv1-clock")
export class HudClock extends LitElement {
  @property() lang = "es";
  @state() private now = new Date();
  private timer?: number;

  connectedCallback(): void {
    super.connectedCallback();
    this.timer = window.setInterval(() => (this.now = new Date()), 1000);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this.timer);
  }

  render() {
    const h = String(this.now.getHours()).padStart(2, "0");
    const m = String(this.now.getMinutes()).padStart(2, "0");
    const s = String(this.now.getSeconds()).padStart(2, "0");
    const weekday = this.now.toLocaleDateString(this.lang, { weekday: "long" });
    const date = this.now.toLocaleDateString(this.lang, { day: "numeric", month: "long", year: "numeric" });
    const secProgress = this.now.getSeconds() / 59;

    return html`
      <div class="time">
        <span class="hm">${h}<span class="colon">:</span>${m}</span>
        <span class="sec">${s}</span>
      </div>
      <div class="seconds-bar"><span style="transform: scaleX(${secProgress})"></span></div>
      <div class="date"><b>${weekday}</b> · ${date}</div>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }
    .time {
      display: flex;
      align-items: flex-start;
      gap: 0.12em;
      line-height: 0.92;
      font-family: var(--font-ui);
      font-variant-numeric: tabular-nums;
      font-weight: 300;
      font-size: var(--fs-clock);
      letter-spacing: -0.04em;
      color: var(--text);
    }
    .colon {
      color: var(--accent);
      text-shadow: var(--accent-glow);
      animation: blink 2s steps(1) infinite;
      padding: 0 0.02em;
    }
    .sec {
      font-size: 0.3em;
      font-weight: 500;
      margin-top: 0.3em;
      color: var(--accent);
      letter-spacing: 0;
    }
    .seconds-bar {
      margin-top: var(--space-2);
      height: 2px;
      width: 100%;
      background: var(--grid-line);
      border-radius: 2px;
      overflow: hidden;
    }
    .seconds-bar span {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, var(--accent-2), var(--accent));
      transform-origin: left;
      transition: transform 900ms linear;
      box-shadow: var(--accent-glow);
    }
    .date {
      margin-top: var(--space-2);
      font-size: var(--fs-body);
      color: var(--text-muted);
    }
    .date b {
      color: var(--text);
      font-weight: 600;
      text-transform: capitalize;
    }
    @keyframes blink {
      50% {
        opacity: 0.35;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "adv1-clock": HudClock;
  }
}
