import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  mdiAlertCircleOutline,
  mdiAlertOutline,
  mdiBellOutline,
  mdiCheckCircleOutline,
  mdiChevronDown,
  mdiChevronRight,
  mdiClose,
  mdiInformationOutline,
} from "@mdi/js";

import type { DashboardConfig, HomeAssistant } from "../types";
import { shared } from "../styles/tokens";
import { icon, relTime } from "../lib/ha";
import { alertCatalog, friendly, roomName, type Alert, type Level, type RuleStatus } from "../lib/alerts";
import { sheetStyles } from "./solar-sheet";

const ICON: Record<Level, string> = {
  bad: mdiAlertCircleOutline,
  warn: mdiAlertOutline,
  info: mdiInformationOutline,
};
const LEVEL_ES: Record<Level, string> = { bad: "Importante", warn: "Aviso", info: "Informativo" };
const ORDER: Record<Level, number> = { bad: 0, warn: 1, info: 2 };

const worst = (alerts: Alert[]): Level =>
  alerts.reduce<Level>((m, a) => (ORDER[a.level] < ORDER[m] ? a.level : m), "info");

/**
 * Catálogo de todos los avisos posibles (`ALERT_RULES` de `lib/alerts.ts`), se cumplan o no:
 * arriba los activos ahora; debajo, agrupados, los que podrían saltar. Tocar una regla despliega las
 * entidades que vigila. Eventos: `close` y `go` (detail = estancia).
 */
@customElement("fv2-alerts-sheet")
export class AlertsSheet extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ attribute: false }) config?: DashboardConfig;
  @state() private expanded = new Set<string>();

  private close = () => this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));

  private go(room: string) {
    this.dispatchEvent(new CustomEvent("go", { detail: room, bubbles: true, composed: true }));
  }

  private toggle(id: string) {
    const next = new Set(this.expanded);
    if (!next.delete(id)) next.add(id);
    this.expanded = next;
  }

  /** Desplegable con las entidades vigiladas. */
  private watched(s: RuleStatus) {
    if (!this.expanded.has(s.rule.id)) return nothing;
    return html`<ul class="ents">
      ${
        s.entities.length
          ? s.entities.map(
              (id) =>
                html`<li><span>${this.hass ? friendly(this.hass, id) : id}</span><code>${id}</code></li>`,
            )
          : html`<li class="muted">No hay ninguna entidad configurada para este aviso.</li>`
      }
    </ul>`;
  }

  private dots(levels: Level[]) {
    return html`<span class="dots" title=${levels.map((l) => LEVEL_ES[l]).join(" / ")}>
      ${levels.map((l) => html`<i class="${l}"></i>`)}
    </span>`;
  }

  private count(s: RuleStatus): string {
    const n = s.entities.length;
    return n === 1 ? "1 sensor" : `${n} sensores`;
  }

  /** Regla que se cumple ahora: una tarjeta de color con cada aviso. */
  private activeCard(s: RuleStatus) {
    const lvl = worst(s.active);
    return html`<div class="rule active ${lvl}">
      <button class="rhead" @click=${() => this.toggle(s.rule.id)}>
        <span class="a-ico">${icon(ICON[lvl])}</span>
        <span class="r-txt">
          <b>${s.rule.title}</b>
          <span class="muted">${s.rule.when}</span>
        </span>
        <span class="muted nowrap">${this.count(s)}</span>
        ${icon(this.expanded.has(s.rule.id) ? mdiChevronDown : mdiChevronRight)}
      </button>
      ${s.active.map(
        (a) =>
          html`<div class="inst ${a.level}" @click=${() => a.room && this.go(a.room)}>
            <span class="a-ico">${icon(ICON[a.level])}</span>
            <span class="r-txt">
              <b>${a.title}</b>
              <span class="muted"
                >${[a.detail, roomName(a.room), a.since ? relTime(a.since) : ""].filter(Boolean).join(" · ")}</span
              >
            </span>
            ${a.room ? icon(mdiChevronRight) : nothing}
          </div>`,
      )}
      ${this.watched(s)}
    </div>`;
  }

  /** Regla que no se cumple: fila apagada con su condición. */
  private idleRow(s: RuleStatus) {
    return html`<div class="rule">
      <button class="rhead" @click=${() => this.toggle(s.rule.id)}>
        <span class="a-ico ok">${icon(mdiCheckCircleOutline)}</span>
        <span class="r-txt">
          <b>${s.rule.title}</b>
          <span class="muted">${s.rule.when}</span>
        </span>
        ${this.dots(s.rule.levels)}
        <span class="muted nowrap">${this.count(s)}</span>
        ${icon(this.expanded.has(s.rule.id) ? mdiChevronDown : mdiChevronRight)}
      </button>
      ${this.watched(s)}
    </div>`;
  }

  render() {
    if (!this.hass) return nothing;
    const all = alertCatalog(this.hass, this.config?.alarm, this.config?.weather_alerts);
    const active = all
      .filter((s) => s.active.length)
      .sort((a, b) => ORDER[worst(a.active)] - ORDER[worst(b.active)]);
    const idle = all.filter((s) => !s.active.length);
    const groups = [...new Set(idle.map((s) => s.rule.group))];
    const n = active.reduce((acc, s) => acc + s.active.length, 0);

    return html`
      <div class="scrim" @click=${this.close}></div>
      <section class="sheet glass">
        <header>
          <span class="halo ${n ? "on" : ""}">${icon(mdiBellOutline)}</span>
          <div class="ttl">
            <h3>Todos los avisos</h3>
            <span class="muted"
              >${n ? `${n} activo${n > 1 ? "s" : ""} ahora` : "Ninguno activo"} · ${all.length} tipos
              vigilados</span
            >
          </div>
          <button class="round" title="Cerrar" @click=${this.close}>${icon(mdiClose)}</button>
        </header>

        <div class="sec">
          <span class="sub">Activos ahora</span>
          ${
            active.length
              ? active.map((s) => this.activeCard(s))
              : html`<p class="calm">Todo en orden. Nada que atender ahora mismo.</p>`
          }
        </div>

        ${groups.map(
          (g) =>
            html`<div class="sec">
              <span class="sub">${g}</span>
              ${idle.filter((s) => s.rule.group === g).map((s) => this.idleRow(s))}
            </div>`,
        )}
      </section>
    `;
  }

  static styles = [
    shared,
    sheetStyles,
    css`
      .sheet {
        width: min(760px, calc(100% - 32px));
      }
      @media (max-width: 720px) {
        .sheet {
          width: calc(100% - 16px);
        }
      }
      .sec {
        display: grid;
        gap: 6px;
        align-content: start;
      }
      .calm {
        margin: 0;
        font-size: var(--fs-small);
        color: var(--text-muted);
        font-family: var(--font-display);
        font-style: italic;
      }
      .rule {
        display: grid;
        gap: 4px;
        padding: 4px;
        border-radius: 14px;
        background: var(--chip);
      }
      .rule.active.bad {
        background: var(--danger-soft);
      }
      .rule.active.warn {
        background: var(--terracotta-soft);
      }
      .rule.active.info {
        background: var(--sky-soft);
      }
      .rhead {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        min-height: 44px;
        padding: 6px 8px;
        border-radius: 10px;
        text-align: left;
        color: var(--text);
        font-size: var(--fs-small);
      }
      .inst {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border-radius: 10px;
        background: var(--bg);
        font-size: var(--fs-small);
        cursor: pointer;
      }
      .r-txt {
        flex: 1;
        display: grid;
        min-width: 0;
      }
      .r-txt .muted {
        font-size: var(--fs-label);
      }
      .nowrap {
        white-space: nowrap;
        font-size: var(--fs-label);
      }
      .a-ico {
        display: grid;
        place-items: center;
        color: var(--sky);
      }
      .a-ico.ok {
        color: var(--sage);
        opacity: 0.8;
      }
      .warn > .rhead .a-ico,
      .inst.warn .a-ico {
        color: var(--terracotta);
      }
      .bad > .rhead .a-ico,
      .inst.bad .a-ico {
        color: var(--danger);
      }
      .dots {
        display: flex;
        gap: 4px;
      }
      .dots i {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--sky);
      }
      .dots i.warn {
        background: var(--terracotta);
      }
      .dots i.bad {
        background: var(--danger);
      }
      .ents {
        list-style: none;
        margin: 0;
        padding: 4px 10px 8px;
        display: grid;
        gap: 4px;
      }
      .ents li {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: var(--fs-label);
      }
      .ents code {
        color: var(--text-faint);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "fv2-alerts-sheet": AlertsSheet;
  }
}
