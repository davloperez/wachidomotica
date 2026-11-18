import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  mdiBroom,
  mdiCheckCircleOutline,
  mdiClose,
  mdiHomeImportOutline,
  mdiPause,
  mdiPlay,
  mdiRobotVacuum,
  mdiStop,
  mdiWater,
  mdiAlertCircleOutline,
} from "@mdi/js";

import type { HassEntity, HomeAssistant } from "../types";
import { shared } from "../styles/tokens";
import { fmt, icon, num, st } from "../lib/ha";
import { VACUUM } from "../house/rooms";
import { PORCH, ROOMS } from "../../../house-3d-v1/src/scene/plan";
import { sheetStyles } from "./solar-sheet";

const V = {
  vacuum: VACUUM.entity,
  battery: VACUUM.battery,
  room: "sensor.limpiasuelos_current_room",
  history: "sensor.limpiasuelos_cleaning_history",
  map: "camera.limpiasuelos_map",
  customized: "switch.limpiasuelos_customized_cleaning",
  cleangenius: "select.limpiasuelos_cleangenius",
  mode: "select.limpiasuelos_cleaning_mode",
  suction: "select.limpiasuelos_suction_level",
  humidity: "select.limpiasuelos_mop_pad_humidity",
  consumables: [
    ["Cepillo principal", "sensor.limpiasuelos_main_brush_left"],
    ["Cepillo lateral", "sensor.limpiasuelos_side_brush_left"],
    ["Filtro", "sensor.limpiasuelos_filter_left"],
    ["Sensores", "sensor.limpiasuelos_sensor_dirty_left"],
  ] as const,
};

/**
 * Estancias del robot (segmentos del mapa de Dreame) y qué zonas del plano de la casa cubren. El robot
 * agrupa Salón, Cocina y Entrada en una sola estancia; el exterior limpiable es el porche.
 */
interface RobotRoom {
  id: number;
  name: string;
  /** Nombres de estancias del plano compartido ("" = el hueco sin nombre junto a la cocina) */
  plan: string[];
  /** Nombre corto para las estancias estrechas del plano */
  short?: string;
  exterior?: boolean;
}
const ROBOT_ROOMS: RobotRoom[] = [
  { id: 11, name: "Salón y cocina", plan: ["Salón", "Cocina", "", "Entrada"] },
  { id: 2, name: "Lavadero", plan: ["Lavadero"] },
  { id: 5, name: "Oficina 1", short: "Ofi. 1", plan: ["Oficina 1"] },
  { id: 3, name: "Oficina 2", short: "Ofi. 2", plan: ["Oficina 2"] },
  { id: 8, name: "Dormitorio 2", short: "Dorm. 2", plan: ["Dormitorio 2"] },
  { id: 6, name: "Vestidor", plan: ["Vestidor"] },
  { id: 9, name: "Dormitorio 1", short: "Dorm. 1", plan: ["Dormitorio 1"] },
  { id: 13, name: "Baño 1", plan: ["Baño 1"] },
  { id: 10, name: "Dormitorio 3", short: "Dorm. 3", plan: ["Dormitorio 3"] },
  { id: 15, name: "Pasillo", plan: ["Pasillo"] },
  { id: 20, name: "Baño 2", plan: ["Baño 2"] },
  { id: 17, name: "Porche", plan: [], exterior: true },
];
const DEFAULT_ORDER = [11, 2, 5, 3, 8, 6, 9, 13, 10, 15, 20, 17];

type Rect = [number, number, number, number];
const PLAN_RECTS = new Map<number, Rect[]>(
  ROBOT_ROOMS.map((r) => [
    r.id,
    r.exterior ? [PORCH as Rect] : (r.plan.flatMap((n) => ROOMS.filter((x) => x.name === n).map((x) => x.rect)) as Rect[]),
  ]),
);
const ALL_RECTS = [...PLAN_RECTS.values()].flat();
const BOX = {
  x1: Math.min(...ALL_RECTS.map((r) => r[0])),
  z1: Math.min(...ALL_RECTS.map((r) => r[1])),
  x2: Math.max(...ALL_RECTS.map((r) => r[2])),
  z2: Math.max(...ALL_RECTS.map((r) => r[3])),
};
const area = (r: Rect) => Math.abs((r[2] - r[0]) * (r[3] - r[1]));

type Mode = "sweeping" | "mopping" | "both";
const MODES: { id: Mode; label: string; select: string; sub: string }[] = [
  { id: "sweeping", label: "Aspirar", select: "sweeping", sub: "Solo succión" },
  { id: "mopping", label: "Fregar", select: "mopping", sub: "Solo mopa" },
  { id: "both", label: "Aspirar y fregar", select: "sweeping_and_mopping", sub: "A la vez" },
];
const POWERS = [
  { label: "Silencio", fan: "silent", select: "quiet" },
  { label: "Estándar", fan: "standard", select: "standard" },
  { label: "Fuerte", fan: "strong", select: "strong" },
  { label: "Turbo", fan: "turbo", select: "turbo" },
];
const WETS = [
  { label: "Poco húmeda", select: "slightly_dry" },
  { label: "Húmeda", select: "moist" },
  { label: "Muy mojada", select: "wet" },
];

const STATE_ES: Record<string, string> = {
  docked: "En la base",
  cleaning: "Limpiando",
  returning: "Volviendo a la base",
  paused: "En pausa",
  idle: "En reposo",
  error: "Error",
  unavailable: "Sin conexión",
};
const TASK_ES: Record<string, string> = {
  "Room cleaning": "Por estancias",
  "Zone cleaning": "Por zona",
  Cleaning: "Completa",
  "Spot cleaning": "Puntual",
  "Custom cleaning": "Personalizada",
};
const METHOD_ES: Record<string, string> = {
  Cleangenius: "CleanGenius",
  "Default mode": "Ajustes por defecto",
  "Custom mode": "Personalizado",
};
const BLOCK_ES: Record<string, string> = {
  "Blocked by dynamic obstacle": "obstáculo",
  "Blocked by door": "puerta cerrada",
  "Blocked by threshold": "umbral",
};
const INTERRUPT_ES: Record<string, string> = {
  "Robot lifted": "robot levantado",
  "Low battery": "batería baja",
  "Stuck": "atascado",
};

interface Task {
  ts: number;
  at: Date;
  minutes: string;
  area: string;
  kind: string;
  completed: boolean;
  interrupt?: string;
  mop: boolean;
  method: string;
  pet: boolean;
  blocked: [number, string][];
}

const HISTORY_SHOWN = 6;

/**
 * Detalle del robot aspirador: estado en directo, modo (aspirar, fregar o ambos a la vez), potencia, humedad de
 * la mopa, selección visual y ordenada de estancias sobre el plano, y las últimas tareas de limpieza.
 */
@customElement("fv2-vacuum-sheet")
export class VacuumSheet extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private mode: Mode = "both";
  @state() private power = 1;
  @state() private wet = 1;
  /** IDs de estancias del robot, en el orden en que se limpiarán */
  @state() private order: number[] = [];
  @state() private busy?: string;
  @state() private warn?: string;
  @state() private more = false;
  /** Mapa mostrado: el de ahora o el de una limpieza del historial (su marca de tiempo) */
  @state() private mapTask?: number | "live";
  @state() private mapFailed = false;
  private ready = false;

  protected willUpdate(changed: PropertyValues<this>): void {
    if (!changed.has("hass") || this.ready || !this.hass) return;
    this.ready = true;
    const a = st(this.hass, V.vacuum)?.attributes ?? {};
    const cm = String(a.cleaning_mode ?? "").toLowerCase();
    this.mode = cm === "sweeping" ? "sweeping" : cm === "mopping" ? "mopping" : "both";
    const fan = POWERS.findIndex((p) => p.fan === a.fan_speed);
    if (fan >= 0) this.power = fan;
    const wet = ["slightly dry", "moist", "wet"].indexOf(String(a.mop_pad_humidity ?? "").toLowerCase());
    if (wet >= 0) this.wet = wet;
    this.order = this.preset("interior");
  }

  private close() {
    this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
  }

  /* ------------------------------ Estancias ------------------------------ */

  private sequence(): number[] {
    const seq = st(this.hass, V.vacuum)?.attributes.cleaning_sequence;
    const known = new Set(ROBOT_ROOMS.map((r) => r.id));
    const base = Array.isArray(seq) ? (seq as number[]).filter((i) => known.has(i)) : [];
    return [...base, ...DEFAULT_ORDER.filter((i) => !base.includes(i))];
  }

  private preset(zone: "interior" | "exterior" | "todo"): number[] {
    const ext = (id: number) => ROBOT_ROOMS.find((r) => r.id === id)?.exterior;
    return this.sequence().filter((id) => (zone === "todo" ? true : zone === "exterior" ? ext(id) : !ext(id)));
  }

  private zone(): "interior" | "exterior" | "todo" | "elegir" {
    const same = (z: "interior" | "exterior" | "todo") => {
      const p = this.preset(z);
      return p.length === this.order.length && p.every((i) => this.order.includes(i));
    };
    return same("interior") ? "interior" : same("exterior") ? "exterior" : same("todo") ? "todo" : "elegir";
  }

  private toggleRoom(id: number) {
    this.order = this.order.includes(id) ? this.order.filter((i) => i !== id) : [...this.order, id];
  }

  private roomName(id: number): string {
    return ROBOT_ROOMS.find((r) => r.id === id)?.name ?? `Estancia ${id}`;
  }

  /** Nombre de una estancia según el mapa del robot (para el historial). */
  private mapRoom(id: number): string {
    const rooms = st(this.hass, V.vacuum)?.attributes.rooms as Record<string, { id: number; name: string }[]> | undefined;
    const hit = Object.values(rooms ?? {})
      .flat()
      .find((r) => r.id === id);
    return hit?.name ?? this.roomName(id);
  }

  /* ------------------------------ Acciones ------------------------------ */

  private async svc(domain: string, service: string, data: Record<string, unknown>): Promise<boolean> {
    try {
      await this.hass?.callService(domain, service, data);
      return true;
    } catch (err) {
      console.warn("[functional-v2] robot", domain, service, err);
      return false;
    }
  }

  private async live(service: "pause" | "start" | "return_to_base" | "stop") {
    await this.svc("vacuum", service, { entity_id: V.vacuum });
  }

  /**
   * Prepara el robot y lanza la limpieza: desactiva CleanGenius y la limpieza personalizada (si no, ignora los
   * ajustes globales), fija modo, succión y humedad, el orden de las estancias y limpia los segmentos.
   */
  private async start() {
    if (!this.order.length || this.busy) return;
    const failed: string[] = [];
    const power = POWERS[this.power];
    const wet = WETS[this.wet];
    const mode = MODES.find((m) => m.id === this.mode)!;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    this.warn = undefined;
    this.busy = "Preparando el robot…";
    await this.svc("select", "select_option", { entity_id: V.cleangenius, option: "off" });
    await sleep(1500);
    await this.svc("switch", "turn_off", { entity_id: V.customized });
    await sleep(500);
    if (!(await this.svc("select", "select_option", { entity_id: V.mode, option: mode.select }))) failed.push("modo");
    if (!(await this.svc("vacuum", "set_fan_speed", { entity_id: V.vacuum, fan_speed: power.fan })))
      failed.push("potencia");
    if (this.mode !== "sweeping")
      if (!(await this.svc("select", "select_option", { entity_id: V.humidity, option: wet.select })))
        failed.push("humedad");
    this.busy = "Ordenando las estancias…";
    const rest = this.sequence().filter((i) => !this.order.includes(i));
    await this.svc("dreame_vacuum", "vacuum_set_cleaning_sequence", {
      entity_id: V.vacuum,
      cleaning_sequence: [...this.order, ...rest],
    });
    await sleep(1500);
    this.busy = "Empezando…";
    const ok = await this.svc("dreame_vacuum", "vacuum_clean_segment", {
      entity_id: V.vacuum,
      segments: this.order,
      suction_level: this.power,
      ...(this.mode === "sweeping" ? {} : { water_volume: this.wet + 1 }),
    });
    this.busy = undefined;
    if (!ok) this.warn = "No se pudo iniciar la limpieza. Revisa el estado del robot.";
    else if (failed.length) this.warn = `Limpieza iniciada, pero no se pudo ajustar: ${failed.join(", ")}.`;
  }

  /* ------------------------------ Historial ------------------------------ */

  private tasks(): Task[] {
    const a = st(this.hass, V.history)?.attributes ?? {};
    const out: Task[] = [];
    for (const [k, v] of Object.entries(a)) {
      if (!/^\d{2}-\d{2} \d{2}:\d{2}$/.test(k) && !(v && typeof v === "object" && "timestamp" in v)) continue;
      if (!v || typeof v !== "object") continue;
      const t = v as Record<string, unknown>;
      out.push({
        ts: Number(t.timestamp),
        at: new Date(Number(t.timestamp) * 1000),
        minutes: String(t.cleaning_time ?? "—"),
        area: String(t.cleaned_area ?? "—"),
        kind: TASK_ES[String(t.status)] ?? String(t.status ?? ""),
        completed: t.completed !== false,
        interrupt: t.interrupt_reason ? (INTERRUPT_ES[String(t.interrupt_reason)] ?? String(t.interrupt_reason)) : undefined,
        mop: t.mop_pad === "Installed",
        method: METHOD_ES[String(t.cleanup_method)] ?? String(t.cleanup_method ?? ""),
        pet: t.pet === true,
        blocked: Object.entries((t.blocked_rooms as Record<string, string> | undefined) ?? {}).map(([id, why]) => [
          Number(id),
          BLOCK_ES[why] ?? why,
        ]),
      });
    }
    return out.sort((x, y) => y.at.getTime() - x.at.getTime());
  }

  private url(path: string | undefined): string | undefined {
    return path ? (this.hass?.hassUrl ? this.hass.hassUrl(path) : path) : undefined;
  }

  /** Mapa de una limpieza pasada: la cámara del robot publica una imagen por tarea (el `v=` es su marca de tiempo). */
  private taskMap(ts: number): string | undefined {
    const pics = st(this.hass, V.map)?.attributes.cleaning_history_picture as Record<string, string> | undefined;
    const hit = Object.values(pics ?? {}).find((u) => new RegExp(`[?&]v=${ts}(&|$)`).test(u));
    return this.url(hit);
  }

  private pick(ts: number | "live") {
    this.mapTask = ts;
    this.mapFailed = false;
    this.updateComplete.then(() =>
      this.renderRoot.querySelector(".mapbox")?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
  }

  private when(d: Date): string {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    const diff = Math.round((day.getTime() - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
    const hm = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    if (diff === 0) return `Hoy · ${hm}`;
    if (diff === 1) return `Ayer · ${hm}`;
    return `${d.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} · ${hm}`;
  }

  /* -------------------------------- Vista -------------------------------- */

  private plan() {
    const w = BOX.x2 - BOX.x1;
    const hgt = BOX.z2 - BOX.z1;
    return html`<div class="plan" style="aspect-ratio:${w} / ${hgt}">
      ${ROBOT_ROOMS.map((r) => {
        const rects = PLAN_RECTS.get(r.id) ?? [];
        const big = [...rects].sort((a, b) => area(b) - area(a))[0];
        const n = this.order.indexOf(r.id);
        return rects.map(
          (rc) => html`<button
            class="rm ${n >= 0 ? "sel" : ""} ${r.exterior ? "ext" : ""}"
            style="left:${((rc[0] - BOX.x1) / w) * 100}%;top:${((rc[1] - BOX.z1) / hgt) * 100}%;width:${((rc[2] - rc[0]) / w) * 100}%;height:${((rc[3] - rc[1]) / hgt) * 100}%"
            title=${r.name}
            aria-pressed=${n >= 0}
            @click=${() => this.toggleRoom(r.id)}
          >
            ${
              rc === big
                ? html`<span class="lab">${n >= 0 ? html`<i class="num">${n + 1}</i>` : nothing}${r.short ?? r.name}</span>`
                : nothing
            }
          </button>`,
        );
      })}
    </div>`;
  }

  private mapPanel(active: boolean, tasks: Task[]) {
    const live = this.url(st(this.hass, V.map)?.attributes.entity_picture as string | undefined);
    // Sin elección: el mapa en directo si está limpiando y, si no, el de la última limpieza
    const sel = this.mapTask ?? (active || !tasks[0] ? "live" : tasks[0].ts);
    const task = sel === "live" ? undefined : tasks.find((t) => t.ts === sel);
    const showingLive = !task;
    const src = task ? this.taskMap(task.ts) : live;
    if (!live && !src) return nothing;
    return html`<div class="panel wide mapbox">
      <div class="head">
        <span class="sub">${showingLive ? (active ? "Mapa en directo" : "Mapa actual") : "Mapa de la limpieza"}</span>
        <div class="seg small">
          <button class=${showingLive ? "on" : ""} @click=${() => this.pick("live")}>Ahora</button>
          ${tasks[0] ? html`<button class=${!showingLive ? "on" : ""} @click=${() => this.pick(task?.ts ?? tasks[0].ts)}>Limpieza</button>` : nothing}
        </div>
      </div>
      ${
        task && !showingLive
          ? html`<span class="muted note">${this.when(task.at)} · ${task.minutes} · ${task.area} · ${task.kind}</span>`
          : html`<span class="muted note">${active ? "Se actualiza mientras limpia." : "Último estado del mapa del robot."} Toca una limpieza del historial para ver su recorrido.</span>`
      }
      ${
        src && !this.mapFailed
          ? html`<img class="map" alt="Mapa del robot" src=${src} @error=${() => (this.mapFailed = true)} />`
          : html`<p class="muted">Mapa no disponible para esta limpieza.</p>`
      }
    </div>`;
  }

  render() {
    const h = this.hass;
    if (!h) return nothing;
    const e: HassEntity | undefined = st(h, V.vacuum);
    const s = e?.state ?? "unavailable";
    const a = e?.attributes ?? {};
    const bat = num(h, V.battery);
    const running = s === "cleaning";
    const active = running || s === "paused" || s === "returning";
    const room = st(h, V.room)?.state;
    const progress = num(h, "sensor.limpiasuelos_cleaning_progress");
    const hasMop = a.mop_pad !== false;
    const zone = this.zone();
    const tasks = this.tasks();
    const shown = this.more ? tasks.slice(0, 20) : tasks.slice(0, HISTORY_SHOWN);
    const modeOk = (m: Mode) => hasMop || m === "sweeping";
    const mopping = this.mode !== "sweeping";
    return html`
      <div class="scrim" @click=${this.close}></div>
      <section class="sheet glass">
        <header>
          <span class="halo ${running ? "on" : ""}">${icon(mdiRobotVacuum)}</span>
          <div class="ttl">
            <h3>Robot aspirador</h3>
            <span class="muted">
              ${[
                STATE_ES[s] ?? s,
                active && room && room !== "unknown" ? room : "",
                active && a.cleaning_time ? `${a.cleaning_time} min · ${a.cleaned_area ?? 0} m²` : "",
                active && progress !== undefined ? `${Math.round(progress)} %` : "",
                bat !== undefined ? `batería ${bat} %` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          ${
            active
              ? html`<button class="btn" @click=${() => this.live(running ? "pause" : "start")}>
                    ${icon(running ? mdiPause : mdiPlay)} ${running ? "Pausar" : "Reanudar"}
                  </button>
                  <button class="btn danger" @click=${() => this.live("stop")}>${icon(mdiStop)} Parar</button>`
              : nothing
          }
          <button class="btn" @click=${() => this.live("return_to_base")}>
            ${icon(mdiHomeImportOutline)} A la base
          </button>
          <button class="round" title="Cerrar" @click=${this.close}>${icon(mdiClose)}</button>
        </header>

        <div class="grid">
          <div class="panel">
            <span class="sub">Estancias</span>
            <div class="seg">
              ${(
                [
                  ["interior", "Interior"],
                  ["exterior", "Exterior"],
                  ["todo", "Todo"],
                ] as const
              ).map(
                ([z, label]) =>
                  html`<button class=${zone === z ? "on" : ""} @click=${() => (this.order = this.preset(z))}>${label}</button>`,
              )}
              <button class=${zone === "elegir" ? "on" : ""} @click=${() => (this.order = zone === "elegir" ? this.order : [])}>
                Elegir
              </button>
            </div>
            ${this.plan()}
            <p class="note muted">
              ${
                this.order.length
                  ? html`Orden: ${this.order.map((id, i) => html`<b>${i + 1}</b> ${this.roomName(id)}${i < this.order.length - 1 ? " → " : ""}`)}`
                  : "Toca las estancias del plano en el orden en que quieres limpiarlas."
              }
              ${this.order.length ? html`<button class="link" @click=${() => (this.order = [])}>Quitar todas</button>` : nothing}
            </p>
          </div>

          <div class="panel">
            <span class="sub">Cómo limpiar</span>
            <div class="modes">
              ${MODES.map(
                (m) => html`<button
                  class="mode ${this.mode === m.id ? "on" : ""}"
                  ?disabled=${!modeOk(m.id)}
                  @click=${() => (this.mode = m.id)}
                >
                  ${icon(m.id === "sweeping" ? mdiBroom : m.id === "mopping" ? mdiWater : mdiRobotVacuum)}
                  <b>${m.label}</b><span>${m.sub}</span>
                </button>`,
              )}
            </div>
            ${hasMop ? nothing : html`<span class="note warn">Sin mopa instalada: solo se puede aspirar.</span>`}
            ${
              this.mode === "mopping"
                ? nothing
                : html`<span class="sub">Potencia de aspirado</span>
                    <div class="seg">
                      ${POWERS.map(
                        (p, i) => html`<button class=${this.power === i ? "on" : ""} @click=${() => (this.power = i)}>${p.label}</button>`,
                      )}
                    </div>`
            }
            ${
              mopping && hasMop
                ? html`<span class="sub">Humedad de la mopa</span>
                    <div class="seg">
                      ${WETS.map((p, i) => html`<button class=${this.wet === i ? "on" : ""} @click=${() => (this.wet = i)}>${p.label}</button>`)}
                    </div>`
                : nothing
            }
            <button class="btn primary go" ?disabled=${!this.order.length || !!this.busy || !e || s === "unavailable"} @click=${this.start}>
              ${icon(mdiPlay)}
              ${
                this.busy ??
                (this.order.length
                  ? `Limpiar ${this.order.length} estancia${this.order.length > 1 ? "s" : ""}`
                  : "Elige alguna estancia")
              }
            </button>
            ${this.warn ? html`<span class="note warn">${this.warn}</span>` : nothing}
            <span class="note muted"
              >Al empezar se desactiva CleanGenius para que se respeten estos ajustes.</span
            >
          </div>

          ${this.mapPanel(active, tasks)}

          <div class="panel wide">
            <div class="head">
              <span class="sub">Últimas limpiezas</span>
              <span class="muted note"
                >${fmt(num(h, "sensor.limpiasuelos_cleaning_count"), 0)} en total ·
                ${fmt(num(h, "sensor.limpiasuelos_total_cleaned_area"), 0)} m²</span
              >
            </div>
            ${
              shown.length
                ? html`<div class="tasks">
                    ${shown.map(
                      (t) => html`<div
                        class="task ${t.completed ? "" : "bad"} ${this.mapTask === t.ts ? "sel" : ""}"
                        @click=${() => this.pick(t.ts)}
                      >
                        <span class="t-ico">${icon(t.completed ? mdiCheckCircleOutline : mdiAlertCircleOutline)}</span>
                        <div class="t-main">
                          <b>${this.when(t.at)}</b>
                          <span class="muted"
                            >${t.minutes} · ${t.area} · ${t.kind}${t.completed ? "" : ` · interrumpida${t.interrupt ? ` (${t.interrupt})` : ""}`}</span
                          >
                          <span class="tags">
                            <i>${t.mop ? "Con mopa" : "Solo aspirado"}</i>
                            ${t.method ? html`<i>${t.method}</i>` : nothing}
                            ${t.pet ? html`<i>Mascotas</i>` : nothing}
                          </span>
                          ${
                            t.blocked.length
                              ? html`<span class="muted blocked"
                                  >No pudo entrar: ${t.blocked.map(([id, why]) => `${this.mapRoom(id)} (${why})`).join(", ")}</span
                                >`
                              : nothing
                          }
                        </div>
                        ${
                          this.taskMap(t.ts)
                            ? html`<img class="thumb" loading="lazy" alt="Mapa" src=${this.taskMap(t.ts)!} @error=${(e: Event) => ((e.target as HTMLElement).style.display = "none")} />`
                            : nothing
                        }
                      </div>`,
                    )}
                  </div>
                  ${
                    tasks.length > HISTORY_SHOWN
                      ? html`<button class="btn" @click=${() => (this.more = !this.more)}>
                          ${this.more ? "Ver menos" : `Ver más (${Math.min(tasks.length, 20) - HISTORY_SHOWN})`}
                        </button>`
                      : nothing
                  }`
                : html`<p class="muted">Sin historial disponible.</p>`
            }
            <div class="cons">
              ${V.consumables.map(([label, id]) => {
                const v = num(h, id);
                return html`<span class=${v !== undefined && v < 25 ? "low" : ""}>${label} <b class="num">${fmt(v, 0)} %</b></span>`;
              })}
            </div>
          </div>
        </div>
      </section>
    `;
  }

  static styles = [
    shared,
    sheetStyles,
    css`
      header .btn {
        white-space: nowrap;
      }
      .note {
        font-size: var(--fs-label);
        margin: 0;
      }
      .note.warn {
        color: var(--terracotta);
      }
      .note b {
        color: var(--text);
      }
      .link {
        margin-left: 8px;
        color: var(--sky);
        font-weight: 600;
        font-size: var(--fs-label);
      }
      .plan {
        position: relative;
        width: 100%;
        max-width: 520px;
        margin: 0 auto;
        background: var(--p-ground, var(--chip-strong));
        border-radius: var(--radius-sm);
        overflow: hidden;
      }
      .rm {
        position: absolute;
        display: grid;
        place-items: center;
        padding: 0;
        background: var(--chip-strong);
        outline: 1px solid var(--bg);
        color: var(--text-muted);
        transition:
          background 200ms,
          color 200ms;
      }
      .rm.ext {
        background: var(--chip);
      }
      .rm.sel {
        background: var(--sage);
        color: #fff;
      }
      .rm:active {
        transform: none;
        filter: none;
      }
      .lab {
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        font-size: var(--fs-label);
        font-weight: 600;
        text-align: center;
        line-height: 1.1;
        padding: 2px;
      }
      .lab i {
        display: inline-grid;
        place-items: center;
        min-width: 20px;
        height: 20px;
        border-radius: 50%;
        background: #fff;
        color: var(--sage);
        font-style: normal;
        font-weight: 800;
      }
      .modes {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }
      .mode {
        display: grid;
        justify-items: center;
        gap: 2px;
        padding: 12px 6px;
        border-radius: var(--radius-sm);
        background: var(--glass-strong);
        color: var(--text-muted);
        font-size: var(--fs-label);
        box-shadow: inset 0 0 0 1px var(--glass-border);
      }
      .mode b {
        color: var(--text);
        font-size: var(--fs-small);
      }
      .mode.on {
        background: var(--sage);
        color: #fff;
        box-shadow: none;
      }
      .mode.on b {
        color: #fff;
      }
      .mode:disabled {
        opacity: 0.45;
      }
      .go {
        margin-top: 4px;
        min-height: 52px;
      }
      .go:disabled {
        opacity: 0.5;
      }
      .tasks {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
        gap: 8px;
      }
      .task {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 10px;
        padding: 10px 12px;
        border-radius: var(--radius-sm);
        background: var(--glass-strong);
        font-size: var(--fs-small);
      }
      .task.bad {
        background: var(--amber-soft);
      }
      .t-ico {
        color: var(--sage);
      }
      .task.bad .t-ico {
        color: var(--amber);
      }
      .task {
        align-items: start;
        cursor: pointer;
        grid-template-columns: auto 1fr auto;
      }
      .task.sel {
        box-shadow: inset 0 0 0 2px var(--sage);
      }
      .thumb {
        width: 64px;
        height: 64px;
        object-fit: contain;
        border-radius: 8px;
        background: #1a1a1a;
      }
      .map {
        width: 100%;
        max-height: 440px;
        object-fit: contain;
        border-radius: var(--radius-sm);
        background: #1a1a1a;
      }
      .seg.small {
        min-width: 180px;
      }
      .t-main {
        display: grid;
        align-content: start;
        gap: 2px;
        min-width: 0;
      }
      .t-main .muted {
        font-size: var(--fs-label);
      }
      .tags {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: 4px;
        margin-top: 4px;
      }
      .tags i {
        font-style: normal;
        font-size: var(--fs-label);
        line-height: 1.3;
        padding: 2px 10px;
        border-radius: 999px;
        background: var(--chip);
        color: var(--text-muted);
      }
      .cons {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 16px;
        font-size: var(--fs-label);
        color: var(--text-muted);
      }
      .cons .low b {
        color: var(--terracotta);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "fv2-vacuum-sheet": VacuumSheet;
  }
}
