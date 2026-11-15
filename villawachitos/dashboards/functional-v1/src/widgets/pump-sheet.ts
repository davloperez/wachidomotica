import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { mdiClose, mdiPool, mdiPower } from "@mdi/js";

import type { HomeAssistant } from "../types";
import { shared } from "../styles/tokens";
import { call, fmt, icon, isOn, num, st } from "../lib/ha";
import { dailyChange, hourlyMeans, stateSpans, type Point, type Span } from "../lib/data";
import { PUMP } from "../house/rooms";
import type { Bar } from "../charts/charts";
import { sheetStyles } from "./solar-sheet";
import "../charts/charts";

/** Interruptor Zigbee de la bomba y su programación en Home Assistant. */
const P = {
  switch: PUMP.entity,
  power: PUMP.power,
  current: "sensor.interruptor_depuradora_current_a",
  voltage: "sensor.interruptor_depuradora_voltage_a",
  temperature: "sensor.interruptor_depuradora_temperature",
  energy: "sensor.interruptor_depuradora_energy",
  schedule: "schedule.horario_depuradora_de_piscina",
  automation: "automation.encendido_y_apagado_automatico_de_depuradora_de_la_piscina",
};
const DAYS_SHOWN = 14;
const WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const WEEK_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

type Block = { from: string; to: string };
type Schedule = Partial<Record<(typeof WEEK)[number], Block[]>>;

const minutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
const hm = (mins: number) =>
  mins >= 60
    ? `${Math.floor(mins / 60)} h${mins % 60 ? ` ${String(Math.round(mins % 60)).padStart(2, "0")} min` : ""}`
    : `${Math.round(mins)} min`;
const clock = (d: Date) => d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

/**
 * Detalle de la depuradora: estado y medidas en directo, horario semanal (ayudante `schedule`),
 * curva de potencia de 24 h, horas de filtrado y energía de los últimos 14 días.
 */
@customElement("fv1-pump-sheet")
export class PumpSheet extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private hours: Record<string, Point[]> = {};
  @state() private energy: Point[] = [];
  @state() private spans: Span[] = [];
  @state() private schedule?: Schedule;
  @state() private armed = false;

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("hass") && !changed.get("hass") && this.hass) void this.load();
  }

  private async load(): Promise<void> {
    const h = this.hass;
    if (!h) return;
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (DAYS_SHOWN - 1));
    const [hours, energy, spans] = await Promise.allSettled([
      hourlyMeans(h, [P.power], 24),
      dailyChange(h, [P.energy], DAYS_SHOWN),
      stateSpans(h, [P.switch], since),
    ]);
    if (hours.status === "fulfilled") this.hours = hours.value;
    if (energy.status === "fulfilled") this.energy = energy.value[P.energy] ?? [];
    if (spans.status === "fulfilled") this.spans = spans.value[P.switch] ?? [];
    // El horario completo solo lo puede leer un administrador; si no, queda el próximo arranque
    try {
      const list = await h.callWS<(Schedule & { id: string })[]>({ type: "schedule/list" });
      this.schedule = list.find((x) => `schedule.${x.id}` === P.schedule);
    } catch {
      this.schedule = undefined;
    }
  }

  private close() {
    this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
  }

  private toggle() {
    if (!this.armed) {
      this.armed = true;
      window.setTimeout(() => (this.armed = false), 4000);
      return;
    }
    this.armed = false;
    call(this.hass, "switch", "toggle", { entity_id: P.switch });
  }

  /** Minutos en marcha de cada día (desde los tramos del historial). */
  private runPerDay(): Map<string, number> {
    const out = new Map<string, number>();
    for (const s of this.spans) {
      if (s.state !== "on") continue;
      let from = s.from;
      while (from < s.to) {
        const d = new Date(from);
        const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
        const to = Math.min(s.to, next);
        out.set(d.toDateString(), (out.get(d.toDateString()) ?? 0) + (to - from) / 60_000);
        from = to;
      }
    }
    return out;
  }

  render() {
    const h = this.hass;
    if (!h) return nothing;
    const on = isOn(h, P.switch);
    const sw = st(h, P.switch);
    const power = num(h, P.power);
    const sched = st(h, P.schedule);
    const next = sched?.attributes.next_event ? new Date(String(sched.attributes.next_event)) : undefined;
    const auto = isOn(h, P.automation);
    const perDay = this.runPerDay();
    const todayMin = perDay.get(new Date().toDateString()) ?? 0;

    // Últimos 14 días: horas de filtrado y energía por día
    const days: Date[] = [];
    for (let i = DAYS_SHOWN - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push(d);
    }
    const label = (d: Date, i: number) => (i % 3 === 0 || i === DAYS_SHOWN - 1 ? String(d.getDate()) : "");
    const hoursBars: Bar[] = days.map((d, i) => ({
      label: label(d, i),
      values: [(perDay.get(d.toDateString()) ?? 0) / 60],
      current: i === DAYS_SHOWN - 1,
    }));
    const kwh = (d: Date) =>
      this.energy.find(([t]) => new Date(t).toDateString() === d.toDateString())?.[1] ?? 0;
    const energyBars: Bar[] = days.map((d, i) => ({
      label: label(d, i),
      values: [kwh(d)],
      current: i === DAYS_SHOWN - 1,
    }));
    const totalH = hoursBars.reduce((a, b) => a + b.values[0], 0);
    const totalKwh = energyBars.reduce((a, b) => a + b.values[0], 0);
    const todayKwh = energyBars[energyBars.length - 1]?.values[0];
    const daySince = new Date(Date.now() - 24 * 3600_000);

    return html`
      <div class="scrim" @click=${this.close}></div>
      <section class="sheet glass">
        <header>
          <span class="halo pump ${on ? "on" : ""}">${icon(mdiPool)}</span>
          <div class="ttl">
            <h3>Depuradora</h3>
            <span class="muted"
              >${
                on
                  ? `Filtrando · ${fmt(power, 0)} W · desde las ${clock(new Date(sw?.last_changed ?? Date.now()))}`
                  : `Parada${next ? ` · próximo arranque ${this.when(next)}` : ""}`
              }</span
            >
          </div>
          <button class="btn ${this.armed ? "armed" : on ? "danger" : "primary"}" @click=${this.toggle}>
            ${icon(mdiPower)} ${this.armed ? "¿Seguro?" : on ? "Apagar ahora" : "Encender ahora"}
          </button>
          <button class="round" title="Cerrar" @click=${this.close}>${icon(mdiClose)}</button>
        </header>

        <div class="grid">
          <div class="panel">
            <span class="sub">Ahora</span>
            <div class="stats three">
              ${this.stat("Potencia", fmt(power, 0), "W", "var(--sky)")}
              ${this.stat("Intensidad", fmt(num(h, P.current), 2), "A")}
              ${this.stat("Tensión", fmt(num(h, P.voltage), 0), "V")}
              ${this.stat("Hoy", hm(todayMin), "de filtrado", "var(--sage)")}
              ${this.stat("Energía hoy", fmt(todayKwh, 2), "kWh")}
              ${this.stat("Interruptor", `${fmt(num(h, P.temperature), 0)}°`, "temperatura")}
            </div>
          </div>

          <div class="panel">
            <div class="head">
              <span class="sub">Horario</span>
              <label class="auto">
                <span class="muted">Programación automática</span>
                <button
                  class="toggle ${auto ? "on" : ""}"
                  aria-label="Programación automática"
                  @click=${() => call(h, "automation", auto ? "turn_off" : "turn_on", { entity_id: P.automation })}
                ></button>
              </label>
            </div>
            ${this.week()}
            <span class="faint note"
              >${
                auto
                  ? next
                    ? `Próximo cambio ${this.when(next)} (${sched?.state === "on" ? "parar" : "arrancar"}).`
                    : ""
                  : "Programación desactivada: la bomba solo se mueve a mano."
              }
              El horario se edita en Home Assistant (ayudante
              «${sched?.attributes.friendly_name ?? "Horario"}»).</span
            >
          </div>

          <div class="panel wide">
            <span class="sub">Últimas 24 horas</span>
            <fv1-area-chart
              .height=${110}
              .digits=${0}
              .trend=${false}
              .series=${[{ data: this.hours[P.power] ?? [], color: "var(--sky)", unit: " W", label: "Potencia media" }]}
            ></fv1-area-chart>
            <fv1-timeline
              .rows=${[{ label: "En marcha", spans: this.spans, color: "var(--sage)" }]}
              .from=${daySince.getTime()}
              .to=${Date.now()}
            ></fv1-timeline>
          </div>

          <div class="panel">
            <div class="head">
              <span class="sub">Filtrado · ${DAYS_SHOWN} días</span>
              <span class="legend muted"
                >${hm(totalH * 60)} · media ${hm((totalH * 60) / DAYS_SHOWN)}/día</span
              >
            </div>
            <fv1-bar-chart
              .bars=${hoursBars}
              .colors=${["var(--sage)"]}
              .height=${110}
              unit="h"
            ></fv1-bar-chart>
          </div>

          <div class="panel">
            <div class="head">
              <span class="sub">Energía · ${DAYS_SHOWN} días</span>
              <span class="legend muted"
                >${fmt(totalKwh, 1)} kWh · total ${fmt(num(h, P.energy), 0)} kWh desde la instalación</span
              >
            </div>
            <fv1-bar-chart
              .bars=${energyBars}
              .colors=${["var(--sky)"]}
              .height=${110}
              unit="kWh"
            ></fv1-bar-chart>
          </div>
        </div>
      </section>
    `;
  }

  /** "hoy a las 14:00", "mañana a las 10:00" o "el lun. a las 10:00". */
  private when(d: Date): string {
    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const day =
      d.toDateString() === today.toDateString()
        ? "hoy"
        : d.toDateString() === tomorrow.toDateString()
          ? "mañana"
          : `el ${d.toLocaleDateString("es-ES", { weekday: "short" })}`;
    return `${day} a las ${clock(d)}`;
  }

  /** Semana en barras de 24 h con los tramos del horario y la hora actual marcada. */
  private week() {
    const s = this.schedule;
    if (!s) return nothing;
    const now = new Date();
    const todayIdx = (now.getDay() + 6) % 7;
    const nowPct = ((now.getHours() * 60 + now.getMinutes()) / 1440) * 100;
    return html`<div class="week">
      ${WEEK.map((k, i) => {
        const blocks = s[k] ?? [];
        const total = blocks.reduce((a, b) => a + minutes(b.to) - minutes(b.from), 0);
        return html`<div class="day ${i === todayIdx ? "today" : ""}">
          <span class="dn">${WEEK_ES[i]}</span>
          <div class="track">
            ${blocks.map(
              (b) =>
                html`<span
                  class="blk"
                  title="${b.from.slice(0, 5)}–${b.to.slice(0, 5)}"
                  style="left:${(minutes(b.from) / 1440) * 100}%;width:${((minutes(b.to) - minutes(b.from)) / 1440) * 100}%"
                ></span>`,
            )}
            ${i === todayIdx ? html`<span class="now" style="left:${nowPct}%"></span>` : nothing}
          </div>
          <span class="dt">${hm(total)}</span>
        </div>`;
      })}
      <div class="day hours">
        <span></span>
        <div class="scale"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
        <span></span>
      </div>
    </div>`;
  }

  private stat(label: string, value: string, sub: string, color?: string) {
    return html`<div class="stat" style=${color ? `--c:${color}` : ""}>
      <span class="lbl">${color ? html`<i></i>` : nothing}${label}</span>
      <b class="num">${value}</b>
      <span class="faint">${sub}</span>
    </div>`;
  }

  static styles = [
    shared,
    sheetStyles,
    css`
      .halo.pump.on {
        color: var(--sky);
        box-shadow: 0 0 40px -6px var(--sky);
      }
      header .btn {
        white-space: nowrap;
      }
      .auto {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: var(--fs-label);
      }
      .note {
        font-size: var(--fs-label);
      }
      .week {
        display: grid;
        gap: 5px;
      }
      .day {
        display: grid;
        grid-template-columns: 34px 1fr 64px;
        align-items: center;
        gap: 8px;
        font-size: var(--fs-label);
        color: var(--text-muted);
      }
      .day.today .dn {
        color: var(--text);
        font-weight: 700;
      }
      .dt {
        text-align: right;
      }
      .track {
        position: relative;
        height: 12px;
        border-radius: 6px;
        background: var(--track);
      }
      .day.today .track {
        outline: 1.5px solid var(--sky-soft);
      }
      .blk {
        position: absolute;
        top: 0;
        bottom: 0;
        min-width: 3px;
        border-radius: 6px;
        background: var(--sky);
      }
      .now {
        position: absolute;
        top: -3px;
        bottom: -3px;
        width: 2px;
        margin-left: -1px;
        border-radius: 1px;
        background: var(--text);
      }
      .scale {
        display: flex;
        justify-content: space-between;
        color: var(--text-faint);
        font-size: 10px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "fv1-pump-sheet": PumpSheet;
  }
}
