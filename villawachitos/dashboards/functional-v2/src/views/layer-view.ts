import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { mdiArrowCollapseDown, mdiArrowCollapseUp, mdiClose, mdiLightbulbOffOutline } from "@mdi/js";
import type { HomeAssistant } from "../types";
import { shared } from "../styles/tokens";
import { call, fmt, icon, moreInfo, num, st } from "../lib/ha";
import { ENERGY, type RoomDef } from "../house/rooms";
import {
  ALARM,
  LAYER_BY_ID,
  itemActive,
  itemAlert,
  rowState,
  type LayerId,
  type LayerItem,
} from "../house/layers";
import "../widgets/lights";
import "../widgets/covers";
import "../widgets/devices";

interface Group {
  room: RoomDef;
  items: LayerItem[];
}

/**
 * Panel de una capa: todos los dispositivos de ese tipo en la casa, agrupados por estancia
 * y repartidos en dos columnas (una en pantallas estrechas) (el plano queda arriba con sus marcadores).
 */
@customElement("fv2-layer")
export class LayerView extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ attribute: false }) layer?: LayerId;
  @property({ attribute: false }) items: LayerItem[] = [];
  @state() private armed?: string;
  private armTimer = 0;

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearTimeout(this.armTimer);
  }

  /** Lleva a la vista el control de un elemento (al tocar su marcador) y lo resalta. */
  focusItem(key: string): void {
    const el = this.renderRoot.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
  }

  /** Acciones de toda la casa: piden un segundo toque. */
  private confirm(key: string, action: () => void): void {
    window.clearTimeout(this.armTimer);
    if (this.armed === key) {
      this.armed = undefined;
      action();
      return;
    }
    this.armed = key;
    this.armTimer = window.setTimeout(() => (this.armed = undefined), 4000);
  }

  private close() {
    this.dispatchEvent(new CustomEvent("layer", { detail: undefined, bubbles: true, composed: true }));
  }

  private groups(): Group[] {
    const out: Group[] = [];
    for (const it of this.items) {
      const g = out.find((x) => x.room === it.room);
      if (g) g.items.push(it);
      else out.push({ room: it.room, items: [it] });
    }
    return out;
  }

  /** Reparte las estancias entre las dos columnas para que queden parejas. */
  private columns(): [Group[], Group[]] {
    const weight = (g: Group) =>
      1.4 + g.items.reduce((a, it) => a + (it.kind === "device" ? 2.4 : it.kind === "cover" ? 1.6 : 1), 0);
    const total = this.groups().reduce((a, g) => a + weight(g), 0) + 3;
    const left: Group[] = [];
    const right: Group[] = [];
    // La columna izquierda empieza con la cabecera de la capa
    let acc = 3;
    for (const g of this.groups()) {
      if (acc + weight(g) / 2 <= total / 2) {
        left.push(g);
        acc += weight(g);
      } else right.push(g);
    }
    return [left, right];
  }

  private summary(): string {
    const h = this.hass;
    const its = this.items;
    const active = its.filter((it) => itemActive(h, it)).length;
    switch (this.layer) {
      case "luces":
        return active ? `${active} de ${its.length} encendidas` : `Las ${its.length} apagadas`;
      case "persianas": {
        const pos = its
          .map((it) =>
            it.kind === "cover" ? (st(h, it.entity)?.attributes.current_position as number) : undefined,
          )
          .filter((p): p is number => typeof p === "number");
        return pos.length
          ? `Apertura media ${Math.round(pos.reduce((a, b) => a + b, 0) / pos.length)} %`
          : `${its.length} persianas`;
      }
      case "energia": {
        const pv = num(h, ENERGY.sensors.pv);
        const load = num(h, ENERGY.sensors.load);
        const soc = num(h, ENERGY.sensors.soc);
        return [
          pv !== undefined ? `☀ ${fmt(pv, 1)} kW` : "",
          load !== undefined ? `casa ${fmt(load, 1)} kW` : "",
          soc !== undefined ? `batería ${fmt(soc, 0)} %` : "",
        ]
          .filter(Boolean)
          .join(" · ");
      }
      case "seguridad": {
        const alarm = its.find((it) => it.key === ALARM);
        const alerts = its.filter((it) => itemAlert(h, it)).length;
        return `${alarm && alarm.kind === "row" ? `Alarma: ${rowState(h, alarm)}` : ""}${alerts ? ` · ${alerts} aviso${alerts > 1 ? "s" : ""}` : " · todo en orden"}`;
      }
      default:
        return active ? `${active} de ${its.length} en marcha` : `${its.length} dispositivos, nada en marcha`;
    }
  }

  private actions() {
    const h = this.hass;
    if (this.layer === "luces") {
      const on = this.items
        .filter((it) => it.kind === "light" && itemActive(h, it))
        .map((it) => (it as { entity: string }).entity);
      return html`<button
        class="btn ${this.armed === "off" ? "armed" : ""}"
        ?disabled=${!on.length}
        @click=${() => this.confirm("off", () => call(h, "light", "turn_off", { entity_id: on }))}
      >
        ${icon(mdiLightbulbOffOutline)} ${this.armed === "off" ? "¿Apagar todas?" : "Apagar todas"}
      </button>`;
    }
    if (this.layer === "persianas") {
      const ids = this.items.map((it) => (it as { entity: string }).entity);
      return html`<button
          class="btn ${this.armed === "up" ? "armed" : ""}"
          @click=${() => this.confirm("up", () => call(h, "cover", "open_cover", { entity_id: ids }))}
        >
          ${icon(mdiArrowCollapseUp)} ${this.armed === "up" ? "¿Seguro?" : "Subir todas"}
        </button>
        <button
          class="btn ${this.armed === "down" ? "armed" : ""}"
          @click=${() => this.confirm("down", () => call(h, "cover", "close_cover", { entity_id: ids }))}
        >
          ${icon(mdiArrowCollapseDown)} ${this.armed === "down" ? "¿Seguro?" : "Bajar todas"}
        </button>`;
    }
    return nothing;
  }

  render() {
    const def = this.layer ? LAYER_BY_ID.get(this.layer) : undefined;
    if (!def) return nothing;
    const [left, right] = this.columns();
    const actions = this.actions();
    return html`
      <div class="col">
        <section class="glass card head" style="--d:0">
          <header class="card-head">
            <span class="ico">${icon(def.icon)}</span>
            <div class="grow ttl">
              <span class="eyebrow">Capa · toda la casa</span>
              <b>${def.name}</b>
            </div>
            <button class="round sm" title="Cerrar la capa" @click=${this.close}>${icon(mdiClose)}</button>
          </header>
          <p class="sum">${this.summary()}</p>
          ${actions === nothing ? nothing : html`<div class="actions">${actions}</div>`}
        </section>
        ${left.map((g, i) => this.group(g, i + 1))}
      </div>
      <div class="col">${right.map((g, i) => this.group(g, i + 1))}</div>
    `;
  }

  private group(g: Group, d: number) {
    const h = this.hass;
    const active = g.items.filter((it) => itemActive(h, it)).length;
    // Todo lo de la estancia va dentro de su recuadro (luces, filas y dispositivos), como en Seguridad > Entrada
    const items = [...g.items.filter((it) => it.kind !== "device"), ...g.items.filter((it) => it.kind === "device")];
    return html`<div class="group" style="--d:${d}">
      <section class="glass card">
        <header class="card-head">
          <span class="ico sm">${icon(g.room.icon)}</span>
          <b class="grow room">${g.room.name}</b>
          ${active ? html`<span class="count num">${active}/${g.items.length}</span>` : nothing}
        </header>
        <div class="tiles">
          ${repeat(
            items,
            (it) => it.key,
            (it) => this.item(it),
          )}
        </div>
      </section>
    </div>`;
  }

  private item(it: LayerItem) {
    const h = this.hass;
    switch (it.kind) {
      case "light":
        return html`<fv2-light-tile
          data-key=${it.key}
          .hass=${h}
          .entity=${it.entity}
          .name=${it.name}
        ></fv2-light-tile>`;
      case "cover":
        return html`<fv2-cover
          data-key=${it.key}
          .hass=${h}
          .entity=${it.entity}
          .name=${it.name}
        ></fv2-cover>`;
      case "device":
        return html`<fv2-device
          data-key=${it.key}
          data-type=${it.device.type}
          .hass=${h}
          .def=${it.device}
        ></fv2-device>`;
      case "row": {
        const alert = itemAlert(h, it);
        const on = itemActive(h, it);
        return html`<div
          class="row ${alert ? "alert" : on ? "on" : ""}"
          data-key=${it.key}
          title=${it.row === "alarm" ? "Conectar o desconectar la alarma" : "Más información"}
          @click=${() => moreInfo(this, it.entity)}
        >
          <span class="r-ico">${icon(it.icon)}</span>
          <b>${it.name}</b>
          <span class="r-state num">${rowState(h, it)}</span>
        </div>`;
      }
    }
  }

  static styles = [
    shared,
    css`
      :host {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 330px), 1fr));
        align-items: start;
        gap: var(--space-3);
        padding: var(--space-3);
      }
      .col {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        min-width: 0;
      }
      .card,
      .group {
        flex: none;
        animation: rise 320ms var(--ease) both;
        animation-delay: calc(var(--d) * 30ms);
      }
      .group {
        display: grid;
        gap: 8px;
      }
      .group > .card:only-child,
      .group > .card {
        padding: 12px var(--space-3);
      }
      .ttl {
        display: grid;
      }
      .ttl b {
        color: var(--text);
        font-family: var(--font-display);
        font-weight: 400;
        font-size: 1.6rem;
        line-height: 1.1;
      }
      .eyebrow {
        font-size: var(--fs-label);
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--text-muted);
      }
      .sum {
        margin: 0;
        color: var(--text-muted);
        font-size: var(--fs-small);
      }
      .actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .actions .btn {
        flex: 1;
      }
      .round.sm {
        width: 36px;
        height: 36px;
      }
      .card-head .ico.sm {
        width: 1.9em;
        height: 1.9em;
      }
      .room {
        color: var(--text);
      }
      .count {
        font-size: var(--fs-label);
        font-weight: 700;
        color: var(--amber);
      }
      .tiles {
        display: grid;
        gap: 8px;
      }
      .row {
        cursor: pointer;
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border-radius: var(--radius-sm);
        background: var(--chip);
        font-size: var(--fs-small);
      }
      .r-ico {
        display: grid;
        place-items: center;
        color: var(--text-muted);
      }
      .r-state {
        color: var(--text-muted);
        font-weight: 600;
      }
      .row.on .r-ico,
      .row.on .r-state {
        color: var(--sage);
      }
      .row.alert {
        background: var(--amber-soft);
      }
      .row.alert .r-ico,
      .row.alert .r-state {
        color: var(--amber);
      }
      .flash {
        animation: flash 1.6s var(--ease);
      }
      @keyframes flash {
        0%,
        70% {
          outline: 3px solid var(--amber);
          outline-offset: 2px;
        }
        100% {
          outline: 3px solid transparent;
          outline-offset: 2px;
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "fv2-layer": LayerView;
  }
}
