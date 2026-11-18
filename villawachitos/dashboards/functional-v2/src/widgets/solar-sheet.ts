import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { mdiClose, mdiSolarPowerVariant } from "@mdi/js";

import type { HomeAssistant } from "../types";
import { shared } from "../styles/tokens";
import { fmt, icon, num } from "../lib/ha";
import { dailyTotals, hourlyMeans, type Point } from "../lib/data";
import { ENERGY } from "../house/rooms";
import type { Bar } from "../charts/charts";
import "../charts/charts";

/** Sensores de la instalación (Sigenergy): los de energía diaria se ponen a cero cada día. */
const S = (id: string) => `sensor.david_lopez_perez_${id}`;
const DAY = {
  pv: S("daily_pv_generation"),
  load: S("home_consumption_today"),
  export: S("grid_export_today"),
  import: S("grid_import_today"),
  charge: S("battery_charging_today"),
  discharge: S("battery_discharging_today"),
};
const TOTAL = {
  pv: S("lifetime_pv_generation"),
  load: S("home_consumption_total"),
  export: S("grid_export_total"),
  import: S("grid_import_total"),
  discharge: S("battery_discharging_total"),
};
const INVERTER = {
  temperature: S("inverter_0080_internal_temperature"),
  voltage: S("inverter_0080_phase_a_voltage"),
  frequency: S("inverter_0080_grid_frequency"),
};
const DAYS_SHOWN = 30;

/** Estilos de las hojas de detalle (instalación solar, depuradora): panel flotante con secciones. */
export const sheetStyles = css`
  :host {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
  }
  .scrim {
    position: absolute;
    inset: 0;
    background: var(--bg);
    animation: fade 400ms ease forwards;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  .sheet {
    position: relative;
    width: min(980px, calc(100% - 32px));
    max-height: calc(100% - 48px);
    overflow-y: auto;
    padding: var(--space-4);
    display: grid;
    gap: var(--space-3);
    background: var(--glass-strong);
    animation: rise 300ms var(--ease);
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .ttl {
    flex: 1;
    display: grid;
  }
  h3 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 500;
    font-size: var(--fs-title);
  }
  .halo {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--chip);
    color: var(--text-faint);
  }
  .halo.on {
    color: var(--amber);
    box-shadow: 0 0 0 4px var(--amber-soft);
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }
  .panel {
    display: grid;
    gap: 10px;
    align-content: start;
    padding: 12px;
    border-radius: var(--radius-sm);
    background: var(--chip);
    min-width: 0;
  }
  .panel.wide {
    grid-column: 1 / -1;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .sub {
    font-size: var(--fs-label);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .legend {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    font-size: var(--fs-label);
    color: var(--text-muted);
  }
  .legend i {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 6px;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .stat {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .stat .lbl {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--fs-label);
    color: var(--text-muted);
  }
  .stat .lbl i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c);
  }
  .stat b {
    font-size: 20px;
    color: var(--text);
  }
  .stat .faint {
    font-size: var(--fs-label);
  }
  @media (max-width: 720px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
`;

/**
 * Resumen de la instalación solar: flujo en directo, balance de hoy, curvas de las últimas 24 h,
 * producción y consumo de los últimos 30 días y totales desde la puesta en marcha.
 */
@customElement("fv2-solar-sheet")
export class SolarSheet extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private hours: Record<string, Point[]> = {};
  @state() private days: Record<string, Point[]> = {};

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("hass") && !changed.get("hass") && this.hass) void this.load();
  }

  private async load(): Promise<void> {
    const h = this.hass;
    if (!h) return;
    const s = ENERGY.sensors;
    try {
      const [hours, days] = await Promise.all([
        hourlyMeans(h, [s.pv, s.load, s.soc], 24),
        dailyTotals(h, [DAY.pv, DAY.load], DAYS_SHOWN),
      ]);
      this.hours = hours;
      this.days = days;
    } catch (err) {
      console.warn("[functional-v2] resumen solar", err);
    }
  }

  private close() {
    this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
  }

  render() {
    const h = this.hass;
    if (!h) return nothing;
    const s = ENERGY.sensors;
    const pv = num(h, s.pv) ?? 0;
    const bat = num(h, s.battery) ?? 0;
    const grid = num(h, s.grid) ?? 0;
    const load = num(h, s.load) ?? 0;
    const soc = num(h, s.soc) ?? 0;
    const d = (id: string) => num(h, id);
    const self = (imp?: number, used?: number) =>
      imp !== undefined && used ? Math.max(0, Math.min(100, Math.round((1 - imp / used) * 100))) : undefined;
    const selfToday = self(d(DAY.import), d(DAY.load));
    const selfTotal = self(d(TOTAL.import), d(TOTAL.load));
    const capacity = d(S("battery_total_capacity"));
    const cycles = capacity ? (d(TOTAL.discharge) ?? 0) / capacity : undefined;

    // Barras de los últimos 30 días (hoy, con el valor en directo)
    const today = new Date().toDateString();
    const pvDays = this.days[DAY.pv] ?? [];
    const loadDays = this.days[DAY.load] ?? [];
    const bars: Bar[] = pvDays.map(([t, v], i) => {
      const date = new Date(t);
      const isToday = date.toDateString() === today;
      const l = loadDays.find(([lt]) => new Date(lt).toDateString() === date.toDateString())?.[1] ?? 0;
      return {
        label: i % 5 === 0 || isToday ? String(date.getDate()) : "",
        values: [isToday ? (d(DAY.pv) ?? v) : v, isToday ? (d(DAY.load) ?? l) : l],
        current: isToday,
      };
    });
    const sum = (i: number) => bars.reduce((acc, b) => acc + b.values[i], 0);
    const best = bars.reduce((m, b) => Math.max(m, b.values[0]), 0);

    return html`
      <div class="scrim" @click=${this.close}></div>
      <section class="sheet glass">
        <header>
          <span class="halo ${pv > 0.05 ? "on" : ""}">${icon(mdiSolarPowerVariant)}</span>
          <div class="ttl">
            <h3>Instalación solar</h3>
            <span class="muted"
              >${pv > 0.05 ? `Produciendo ${fmt(pv, 2)} kW` : "Sin producción ahora"} · batería al
              ${fmt(soc, 0)} %</span
            >
          </div>
          <button class="round" title="Cerrar" @click=${this.close}>${icon(mdiClose)}</button>
        </header>

        <div class="grid">
          <div class="panel">
            <span class="sub">Ahora</span>
            <fv2-energy-flow
              .pv=${pv}
              .battery=${bat}
              .grid=${grid}
              .load=${load}
              .soc=${soc}
            ></fv2-energy-flow>
          </div>

          <div class="panel">
            <span class="sub">Hoy</span>
            <div class="stats three">
              ${this.stat("Producido", fmt(d(DAY.pv), 1), "kWh", "var(--amber)")}
              ${this.stat("Consumido", fmt(d(DAY.load), 1), "kWh", "var(--terracotta)")}
              ${this.stat("Autosuficiencia", selfToday !== undefined ? `${selfToday} %` : "—", "sin red")}
              ${this.stat("Vertido", fmt(d(DAY.export), 1), "kWh a la red", "var(--lilac)")}
              ${this.stat("Comprado", fmt(d(DAY.import), 1), "kWh de la red", "var(--sky)")}
              ${this.stat("Batería", `${fmt(d(DAY.charge), 1)} / ${fmt(d(DAY.discharge), 1)}`, "kWh carga / descarga", "var(--sage)")}
            </div>
          </div>

          <div class="panel wide">
            <span class="sub">Últimas 24 horas</span>
            <fv2-area-chart
              .height=${130}
              .digits=${1}
              .series=${[
                { data: this.hours[s.pv] ?? [], color: "var(--amber)", unit: " kW", label: "Solar" },
                { data: this.hours[s.load] ?? [], color: "var(--terracotta)", unit: " kW", label: "Consumo" },
                {
                  data: this.hours[s.soc] ?? [],
                  color: "var(--sage)",
                  unit: " %",
                  own: true,
                  label: "Batería",
                },
              ]}
            ></fv2-area-chart>
          </div>

          <div class="panel wide">
            <div class="head">
              <span class="sub">Últimos ${DAYS_SHOWN} días</span>
              <span class="legend">
                <span><i style="background:var(--amber)"></i>Solar ${fmt(sum(0), 0)} kWh</span>
                <span><i style="background:var(--terracotta)"></i>Consumo ${fmt(sum(1), 0)} kWh</span>
                ${best ? html`<span class="muted">Mejor día ${fmt(best, 1)} kWh</span>` : nothing}
              </span>
            </div>
            <fv2-bar-chart
              .bars=${bars}
              .colors=${["var(--amber)", "var(--terracotta)"]}
              .height=${130}
              unit="kWh"
            ></fv2-bar-chart>
          </div>

          <div class="panel">
            <span class="sub">Desde la puesta en marcha</span>
            <div class="stats three">
              ${this.stat("Producido", fmt(d(TOTAL.pv), 0), "kWh", "var(--amber)")}
              ${this.stat("Consumido", fmt(d(TOTAL.load), 0), "kWh", "var(--terracotta)")}
              ${this.stat("Autosuficiencia", selfTotal !== undefined ? `${selfTotal} %` : "—", "sin red")}
              ${this.stat("Vertido", fmt(d(TOTAL.export), 0), "kWh", "var(--lilac)")}
              ${this.stat("Comprado", fmt(d(TOTAL.import), 0), "kWh", "var(--sky)")}
              ${this.stat("Ciclos", fmt(cycles, 1), "de batería", "var(--sage)")}
            </div>
          </div>

          <div class="panel">
            <span class="sub">Equipos</span>
            <div class="stats three">
              ${this.stat("Batería", `${fmt(d(S("battery_stored_energy")), 1)}`, `de ${fmt(capacity, 1)} kWh`)}
              ${this.stat("Inversor", `${fmt(d(INVERTER.temperature), 0)}°`, "temperatura")}
              ${this.stat("Red", `${fmt(d(INVERTER.voltage), 0)} V`, `${fmt(d(INVERTER.frequency), 2)} Hz`)}
            </div>
          </div>
        </div>
      </section>
    `;
  }

  private stat(label: string, value: string, sub: string, color?: string) {
    return html`<div class="stat" style=${color ? `--c:${color}` : ""}>
      <span class="lbl">${color ? html`<i></i>` : nothing}${label}</span>
      <b class="num">${value}</b>
      <span class="faint">${sub}</span>
    </div>`;
  }

  static styles = [shared, sheetStyles];
}

declare global {
  interface HTMLElementTagNameMap {
    "fv2-solar-sheet": SolarSheet;
  }
}
