import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  mdiAirConditioner,
  mdiAirFilter,
  mdiCameraOutline,
  mdiCat,
  mdiChartBar,
  mdiDishwasher,
  mdiDotsHorizontal,
  mdiFridgeOutline,
  mdiGate,
  mdiHeatingCoil,
  mdiHomeImportOutline,
  mdiLockOpenVariantOutline,
  mdiLockOutline,
  mdiMinus,
  mdiMotionSensor,
  mdiPause,
  mdiPlay,
  mdiPlus,
  mdiPot,
  mdiPower,
  mdiPowerPlugOutline,
  mdiPrinterOutline,
  mdiPump,
  mdiRobotVacuum,
  mdiFan,
  mdiFlower,
  mdiTablet,
  mdiTune,
  mdiSolarPowerVariant,
  mdiTelevision,
  mdiVolumeHigh,
  mdiVolumeMinus,
  mdiVolumeOff,
  mdiVolumePlus,
  mdiWashingMachine,
} from "@mdi/js";
import type { HomeAssistant } from "../types";
import { shared } from "../styles/tokens";
import type { Slider } from "./slider";
import "./slider";
import { HVAC_ES, call, fmt, icon, isOn, isUnavailable, moreInfo, num, relTime, st } from "../lib/ha";
import { hourlyMeans, type Point } from "../lib/data";
import { ENERGY, FRIDGE, type DeviceDef } from "../house/rooms";
import "../charts/charts";
import "./cam-thumb";

const DEVICE_ICONS: Record<DeviceDef["type"], string> = {
  hvac: mdiAirConditioner,
  tv: mdiTelevision,
  vacuum: mdiRobotVacuum,
  fridge: mdiFridgeOutline,
  printer: mdiPrinterOutline,
  dishwasher: mdiDishwasher,
  airfryer: mdiPot,
  washer: mdiWashingMachine,
  litter: mdiCat,
  towel: mdiHeatingCoil,
  switch: mdiPowerPlugOutline,
  pump: mdiPump,
  energy: mdiSolarPowerVariant,
  gates: mdiGate,
  lock: mdiLockOutline,
  cameras: mdiCameraOutline,
  presence: mdiMotionSensor,
};

const MEDIA_OFF = ["off", "standby", "unavailable", "unknown"];
const PRINTER_ES: Record<string, string> = {
  idle: "En espera",
  printing: "Imprimiendo",
  stopped: "Detenida",
  unavailable: "Apagada",
};

/** Icono de un dispositivo: por tipo, salvo las pantallas Shelly (tablet), el ambientador (flor) y la ventilación (ventilador). */
export function deviceIcon(d: DeviceDef): string {
  if (d.type === "presence" && (d.occupancy ?? d.illuminance)?.includes("shelly")) return mdiTablet;
  if (d.type === "switch") {
    if (d.dose) return mdiFlower;
    if (d.entity.includes("ventilacion")) return mdiFan;
  }
  return DEVICE_ICONS[d.type];
}

/** Resumen corto para el marcador del dispositivo sobre el plano. */
export function deviceBrief(h: HomeAssistant | undefined, d: DeviceDef): string {
  switch (d.type) {
    case "fridge":
      return `${fmt(num(h, FRIDGE.sensors.fridge), 0)}° · ${fmt(num(h, FRIDGE.sensors.freezer), 0)}°`;
    case "vacuum": {
      const s = st(h, d.entity)?.state ?? "";
      const bat = num(h, d.battery);
      return `${VACUUM_ES[s] ?? s}${bat !== undefined ? ` · ${bat} %` : ""}`;
    }
    case "printer": {
      const s = st(h, d.entity)?.state ?? "unavailable";
      const low = Math.min(...Object.values(d.inks).map((id) => num(h, id) ?? 100));
      return low < 15 ? `Tinta ${fmt(low, 0)} %` : (PRINTER_ES[s] ?? s);
    }
    case "washer":
      return st(h, d.status)?.state ?? d.name;
    case "energy": {
      const pv = num(h, ENERGY.sensors.pv) ?? 0;
      const soc = num(h, ENERGY.sensors.soc);
      return `${pv > 0.05 ? `☀ ${fmt(pv, 1)} kW · ` : ""}${fmt(soc, 0)} %`;
    }
    case "towel":
      return `Toallero · ${isOn(h, d.entity) ? "calentando" : "apagado"}`;
    case "pump":
      return isOn(h, d.entity) ? `Filtrando · ${fmt(num(h, d.power), 0)} W` : "Depuradora parada";
    case "gates": {
      const open = d.gates.filter((g) => isOn(h, g.entity)).length;
      return open ? `${open} abierta${open > 1 ? "s" : ""}` : "Cerradas";
    }
    case "hvac": {
      const e = st(h, d.entity);
      if (!e || e.state === "unavailable") return "Clima sin conexión";
      const cur = e.attributes.current_temperature as number | undefined;
      return e.state === "off"
        ? `Apagado${cur !== undefined ? ` · ${fmt(cur, 1)}°` : ""}`
        : `${HVAC_ES[e.state] ?? e.state} a ${fmt(e.attributes.temperature as number, 0)}°`;
    }
    case "tv": {
      const e = st(h, d.entity);
      if (!e || e.state === "unavailable") return `${d.name} · sin conexión`;
      return MEDIA_OFF.includes(e.state) || e.state === "idle"
        ? `${d.name} · ${e.state === "idle" ? "en espera" : "apagada"}`
        : `${d.name} · ${(e.attributes.media_title ?? e.attributes.app_name ?? "encendida") as string}`;
    }
    case "dishwasher": {
      const s = (st(h, d.state)?.state ?? "unavailable").toLowerCase();
      const p = num(h, d.progress);
      return `Lavavajillas · ${DISH_ES[s] ?? s}${s === "run" && p !== undefined ? ` ${p} %` : ""}`;
    }
    case "airfryer": {
      const rem = num(h, d.remaining);
      return rem ? `Freidora · ${rem} min` : "Freidora parada";
    }
    case "litter": {
      const visits = num(h, d.visits);
      const warn = isOn(h, d.full) ? " · cubo lleno" : isOn(h, d.clean) ? " · limpiar" : "";
      return `Arenero · ${fmt(visits, 0)} visitas${warn}`;
    }
    case "cameras": {
      const person = d.cameras.some((c) => isOn(h, c.person));
      const motion = d.cameras.some((c) => isOn(h, c.motion));
      return `${d.name} · ${person ? "persona" : motion ? "movimiento" : "tranquila"}`;
    }
    case "presence":
      return d.occupancy ? `${d.name} · ${isOn(h, d.occupancy) ? "hay alguien" : "vacío"}` : d.name;
    case "lock": {
      const s = st(h, d.entity)?.state;
      return `${d.name} · ${!s || s === "unavailable" ? "sin conexión" : s === "locked" ? "cerrado" : "abierto"}`;
    }
    case "switch": {
      const e = st(h, d.entity);
      const p = num(h, d.power);
      if (!e || e.state === "unavailable") return `${d.name} · sin conexión`;
      return `${d.name} · ${e.state === "on" ? (p !== undefined ? `${fmt(p, 0)} W` : "encendido") : "apagado"}`;
    }
  }
}

const VACUUM_ES: Record<string, string> = {
  docked: "En la base",
  cleaning: "Limpiando",
  returning: "Volviendo a la base",
  paused: "En pausa",
  idle: "En reposo",
  error: "Error",
};
const DISH_ES: Record<string, string> = {
  ready: "Listo",
  run: "Lavando",
  finished: "Terminado",
  delayedstart: "Inicio diferido",
  pause: "En pausa",
  inactive: "Apagado",
  actionrequired: "Requiere atención",
  aborting: "Cancelando",
  unavailable: "Sin conexión",
};

/** Tarjeta de un dispositivo de la estancia; el contenido depende del tipo. */
@customElement("fv2-device")
export class DeviceCard extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ attribute: false }) def?: DeviceDef;
  @state() private series: Record<string, Point[]> = {};
  @state() private armed?: string;
  @state() private hvacDraft?: number;
  @state() private doseDraft?: number;
  private armTimer = 0;
  private loadTimer = 0;
  private tickTimer = 0;

  connectedCallback(): void {
    super.connectedCallback();
    this.loadTimer = window.setInterval(() => this.load(), 5 * 60_000);
    // La cuenta atrás de la próxima dosificación se refresca cada 20 s
    this.tickTimer = window.setInterval(() => {
      if (this.def?.type === "switch" && this.def.dose) this.requestUpdate();
    }, 20_000);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this.loadTimer);
    window.clearInterval(this.tickTimer);
    window.clearTimeout(this.armTimer);
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("def") || (changed.has("hass") && !changed.get("hass") && this.hass)) this.load();
    if (changed.has("hass") && this.hvacDraft !== undefined && this.def?.type === "hvac") {
      const prev = (changed.get("hass") as HomeAssistant | undefined)?.states[this.def.entity];
      if (prev?.attributes.temperature !== this.hass?.states[this.def.entity]?.attributes.temperature)
        this.hvacDraft = undefined;
    }
  }

  /** Series de 24 h para las tarjetas con gráfica. */
  private async load(): Promise<void> {
    const d = this.def;
    if (!this.hass || !d) return;
    const ids =
      d.type === "fridge"
        ? [FRIDGE.sensors.fridge, FRIDGE.sensors.freezer]
        : d.type === "pump"
          ? [d.power]
          : d.type === "energy"
            ? [ENERGY.sensors.soc, ENERGY.sensors.pv]
            : [];
    if (!ids.length) return;
    try {
      this.series = await hourlyMeans(this.hass, ids, 24);
    } catch (err) {
      console.warn("[functional-v2] estadísticas", err);
    }
  }

  /** Acción con confirmación: el primer toque arma el botón 4 s, el segundo la ejecuta. */
  /** Abre el visor de cámaras a pantalla completa (lo muestra el panel raíz). */
  private openCameras(entity: string): void {
    this.dispatchEvent(
      new CustomEvent("open-cameras", { detail: { entity, mode: "single" }, bubbles: true, composed: true }),
    );
  }

  private confirm(key: string, action: () => void): void {
    if (this.armed === key) {
      this.armed = undefined;
      action();
      return;
    }
    this.armed = key;
    window.clearTimeout(this.armTimer);
    this.armTimer = window.setTimeout(() => (this.armed = undefined), 4000);
  }

  render() {
    const d = this.def;
    if (!d) return nothing;
    const { status, body, entity, active } = this.content(d);
    return html`
      <section class="card ${active ? "active" : ""}">
        <header class="card-head">
          <span class="ico">${icon(deviceIcon(d))}</span>
          <div class="grow ttl">
            <b>${d.name}</b>
            ${status ? html`<span>${status}</span>` : nothing}
          </div>
          ${
            entity
              ? html`<button class="dots" title="Más información" @click=${() => moreInfo(this, entity)}>
                  ${icon(mdiDotsHorizontal)}
                </button>`
              : nothing
          }
        </header>
        ${body}
      </section>
    `;
  }

  private content(d: DeviceDef): {
    status?: string;
    body: TemplateResult | typeof nothing;
    entity?: string;
    active?: boolean;
  } {
    const h = this.hass;
    switch (d.type) {
      case "hvac":
        return this.hvac(d.entity);
      case "tv":
        return this.tv(d.entity);
      case "vacuum": {
        const e = st(h, d.entity);
        const bat = num(h, d.battery);
        const cleaning = e?.state === "cleaning";
        return {
          entity: d.entity,
          active: cleaning,
          status: `${VACUUM_ES[e?.state ?? ""] ?? e?.state ?? "—"}${bat !== undefined ? ` · ${bat} %` : ""}`,
          body: html`<div class="actions">
            <button
              class="btn ${cleaning ? "" : "primary"}"
              @click=${() => call(h, "vacuum", cleaning ? "pause" : "start", { entity_id: d.entity })}
            >
              ${icon(cleaning ? mdiPause : mdiPlay)} ${cleaning ? "Pausar" : "Limpiar"}
            </button>
            <button class="btn" @click=${() => call(h, "vacuum", "return_to_base", { entity_id: d.entity })}>
              ${icon(mdiHomeImportOutline)} A la base
            </button>
            <button
              class="btn wide"
              @click=${() => this.dispatchEvent(new CustomEvent("open-vacuum", { bubbles: true, composed: true }))}
            >
              ${icon(mdiTune)} Personalizar limpieza e historial
            </button>
          </div>`,
        };
      }
      case "fridge": {
        const s = FRIDGE.sensors;
        const open = isOn(h, s.door);
        return {
          entity: s.fridge,
          active: open,
          status: open ? "¡Puerta abierta!" : "Puerta cerrada",
          body: html`
            <div class="stats">
              ${this.stat("Frigorífico", `${fmt(num(h, s.fridge), 0)}°`, `objetivo ${fmt(num(h, s.fridgeTarget), 0)}°`, "var(--sky)")}
              ${this.stat("Congelador", `${fmt(num(h, s.freezer), 0)}°`, `objetivo ${fmt(num(h, s.freezerTarget), 0)}°`, "var(--lilac)")}
            </div>
            <fv2-area-chart
              .height=${80}
              .digits=${0}
              .series=${[
                {
                  data: this.series[s.fridge] ?? [],
                  color: "var(--sky)",
                  unit: "°",
                  own: true,
                  label: "Frigorífico",
                },
                {
                  data: this.series[s.freezer] ?? [],
                  color: "var(--lilac)",
                  unit: "°",
                  own: true,
                  label: "Congelador",
                },
              ]}
            ></fv2-area-chart>
          `,
        };
      }
      case "printer": {
        const state = st(h, d.entity)?.state ?? "unavailable";
        const inks: [string, string, string][] = [
          ["Negro", d.inks.black, "#3d3d3d"],
          ["Cian", d.inks.cyan, "#2fa8d8"],
          ["Magenta", d.inks.magenta, "#d6408f"],
          ["Amarillo", d.inks.yellow, "#e8c22e"],
        ];
        return {
          entity: d.entity,
          active: state === "printing",
          status: PRINTER_ES[state] ?? state,
          body: html`<div class="inks">
            ${inks.map(([label, id, color]) => {
              const v = num(h, id);
              return html`<div class="ink" style="--c:${color}">
                <span class="lbl">${label}</span>
                <div class="ink-bar"><i style="height:${v ?? 0}%"></i></div>
                <b class="num">${v !== undefined ? `${fmt(v, 0)} %` : "—"}</b>
              </div>`;
            })}
          </div>`,
        };
      }
      case "dishwasher": {
        const state = st(h, d.state)?.state ?? "unavailable";
        const progress = num(h, d.progress);
        const end = st(h, d.end)?.state;
        const running = state.toLowerCase() === "run";
        const warn = [
          st(h, d.salt)?.state === "on" || st(h, d.salt)?.state === "present" ? "Sal" : "",
          st(h, d.rinse)?.state === "on" || st(h, d.rinse)?.state === "present" ? "Abrillantador" : "",
        ].filter(Boolean);
        return {
          entity: d.state,
          active: running,
          status: DISH_ES[state.toLowerCase()] ?? state,
          body: html`
            ${running && progress !== undefined ? this.bar(progress, "var(--sky)", `${progress} %`) : nothing}
            <div class="chips">
              <span class="pill"
                >${st(h, d.door)?.state === "open" ? "Puerta abierta" : "Puerta cerrada"}</span
              >
              ${end && !isUnavailable(st(h, d.end)) ? html`<span class="pill info">Termina ${new Date(end).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</span>` : nothing}
              ${warn.map((w) => html`<span class="pill warn">Falta ${w.toLowerCase()}</span>`)}
            </div>
          `,
        };
      }
      case "airfryer": {
        const status = st(h, d.status)?.state ?? "—";
        const t = num(h, d.temperature);
        const rem = num(h, d.remaining);
        const cooking = !!rem && rem > 0;
        return {
          entity: d.status,
          active: cooking,
          status: cooking ? `Cocinando · quedan ${rem} min` : status === "bereit" ? "Lista" : status,
          body: html`<div class="stats">
            ${this.stat("Temperatura", `${fmt(t, 0)}°`, "interior")}${this.stat("Restante", `${fmt(rem, 0)}`, "minutos")}
          </div>`,
        };
      }
      case "washer": {
        const p = num(h, d.power) ?? 0;
        const on = isOn(h, d.entity);
        const run = st(h, d.running);
        const running = run?.state === "on";
        const status = st(h, d.status)?.state;
        const since = run?.last_changed ? new Date(run.last_changed) : undefined;
        const mins = since ? Math.round((Date.now() - since.getTime()) / 60_000) : undefined;
        const at = since?.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
        return {
          entity: d.status,
          active: running,
          status: `${status && !isUnavailable(st(h, d.status)) ? status : on ? "En espera" : "Enchufe apagado"}${running ? ` · ${fmt(p, 0)} W` : ""}`,
          body: html`${
              running && mins !== undefined
                ? html`<div class="chips">
                    <span class="pill info">En marcha desde las ${at}</span>
                    <span class="pill"
                      >${mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`}</span
                    >
                  </div>`
                : status === "Terminada" && at
                  ? html`<div class="chips"><span class="pill ok">Terminó a las ${at}</span></div>`
                  : nothing
            }
            <div class="line-ctl">
              <span class="muted">Enchufe</span>
              <button
                class="toggle ${on ? "on" : ""}"
                @click=${() => call(h, "switch", "toggle", { entity_id: d.entity })}
              ></button>
            </div>`,
        };
      }
      case "litter": {
        const visits = num(h, d.visits);
        const sand = num(h, d.sand);
        const alerts = [
          isOn(h, d.clean) ? "Necesita limpieza" : "",
          isOn(h, d.full) ? "Cubo lleno" : "",
        ].filter(Boolean);
        return {
          entity: d.status,
          status: st(h, d.status)?.state === "idle" ? "En reposo" : st(h, d.status)?.state,
          body: html`
            <div class="stats">
              ${this.stat("Visitas hoy", fmt(visits, 0), "")}${this.stat("Arena", `${fmt(sand, 0)} %`, "")}
            </div>
            ${alerts.length ? html`<div class="chips">${alerts.map((a) => html`<span class="pill warn">${a}</span>`)}</div>` : nothing}
          `,
        };
      }
      case "towel": {
        const on = isOn(h, d.entity);
        const mode = st(h, d.mode);
        const opts = (mode?.attributes.options as string[] | undefined) ?? [];
        return {
          entity: d.entity,
          active: on,
          status: on ? "Calentando" : "Apagado",
          body: html`
            <div class="line-ctl">
              <span class="muted">Encendido</span>
              <button
                class="toggle amber ${on ? "on" : ""}"
                @click=${() => call(h, "switch", "toggle", { entity_id: d.entity })}
              ></button>
            </div>
            ${
              opts.length
                ? html`<div class="seg">
                    ${opts.map(
                      (o) =>
                        html`<button
                          class=${mode?.state === o ? "on" : ""}
                          @click=${() => call(h, "input_select", "select_option", { entity_id: d.mode, option: o })}
                        >
                          ${o.replace("Automático ", "Auto ")}
                        </button>`,
                    )}
                  </div>`
                : nothing
            }
          `,
        };
      }
      case "switch": {
        const on = isOn(h, d.entity);
        const p = num(h, d.power);
        return {
          entity: d.entity,
          active: on,
          status: `${on ? "Encendido" : "Apagado"}${p !== undefined ? ` · ${fmt(p, 0)} W` : ""}`,
          body: html`<div class="line-ctl">
              <span class="muted">${isUnavailable(st(h, d.entity)) ? "Sin conexión" : "Encendido"}</span>
              <button
                class="toggle ${on ? "on" : ""}"
                @click=${() => call(h, "switch", "toggle", { entity_id: d.entity })}
              ></button>
            </div>
            ${d.dose ? this.dose(d.dose) : nothing}`,
        };
      }
      case "pump": {
        const on = isOn(h, d.entity);
        const p = num(h, d.power);
        return {
          entity: d.entity,
          active: on,
          status: on ? `Filtrando · ${fmt(p, 0)} W` : "Parada",
          body: html`
            <div class="line-ctl">
              <span class="muted">Depuradora</span>
              <button
                class="toggle ${on ? "on" : ""}"
                @click=${() => call(h, "switch", "toggle", { entity_id: d.entity })}
              ></button>
            </div>
            <fv2-area-chart
              .height=${70}
              .digits=${0}
              .trend=${false}
              .series=${[{ data: this.series[d.power] ?? [], color: "var(--sky)", unit: " W", label: "Potencia" }]}
            ></fv2-area-chart>
            <button
              class="btn wide"
              @click=${() => this.dispatchEvent(new CustomEvent("open-pump", { bubbles: true, composed: true }))}
            >
              Horario, consumo e historial
            </button>
          `,
        };
      }
      case "energy":
        return this.energy();
      case "gates": {
        const open = d.gates.filter((g) => isOn(h, g.entity));
        return {
          active: open.length > 0,
          status: open.length ? `${open.length} abierta${open.length > 1 ? "s" : ""}` : "Todas cerradas",
          body: html`<div class="list">
            ${d.gates.map((g) => {
              const e = st(h, g.entity);
              const o = e?.state === "on";
              return html`<div class="li tap" @click=${() => moreInfo(this, g.entity)}>
                <span class="dot ${o ? "warn" : "ok"}"></span><b>${g.name}</b>
                <span class="muted"
                  >${isUnavailable(e) ? "Sin sensor" : o ? "Abierta" : "Cerrada"} ·
                  ${relTime(e?.last_changed)}</span
                >
              </div>`;
            })}
          </div>`,
        };
      }
      case "lock": {
        const e = st(h, d.entity);
        const locked = e?.state === "locked";
        return {
          entity: d.entity,
          status: isUnavailable(e) ? "Sin conexión" : locked ? "Cerrada" : "Abierta",
          body: html`<button
            class="btn ${this.armed === "lock" ? "armed" : "primary"} wide"
            @click=${() => this.confirm("lock", () => call(h, "lock", "unlock", { entity_id: d.entity }))}
          >
            ${icon(mdiLockOpenVariantOutline)}
            ${this.armed === "lock" ? "Toca otra vez para abrir" : "Abrir la puerta de la calle"}
          </button>`,
        };
      }
      case "cameras": {
        const busy = d.cameras.filter((c) => isOn(h, c.motion) || isOn(h, c.person));
        return {
          active: busy.length > 0,
          status: busy.length ? `Movimiento en ${busy.length}` : "Sin movimiento",
          body: html`<div class="cam-grid">
              ${d.cameras
                .filter((c) => c.camera)
                .map(
                  (c) =>
                    html`<button
                      class="cam-tile"
                      aria-label="Ver ${c.name} en directo"
                      @click=${() => this.openCameras(c.camera!)}
                    >
                      <fv2-cam-thumb
                        .hass=${h}
                        .entity=${c.camera!}
                        .name=${c.name}
                        .alert=${isOn(h, c.person) ? "person" : isOn(h, c.motion) ? "motion" : ""}
                      ></fv2-cam-thumb>
                    </button>`,
                )}
            </div>
            <div class="list">
              ${d.cameras.map((c) => {
                const person = isOn(h, c.person);
                const motion = isOn(h, c.motion);
                return html`<div class="li tap" @click=${() => moreInfo(this, c.motion)}>
                  <span class="dot ${person ? "bad" : motion ? "warn" : "ok"}"></span><b>${c.name}</b>
                  <span class="muted"
                    >${person ? "Persona" : motion ? "Movimiento" : "Tranquilo"} ·
                    ${relTime(st(h, c.motion)?.last_changed)}</span
                  >
                </div>`;
              })}
            </div>`,
        };
      }
      case "presence": {
        const occ = st(h, d.occupancy);
        const lux = num(h, d.illuminance);
        const present = occ?.state === "on";
        return {
          entity: d.occupancy ?? d.illuminance,
          active: present,
          status: !occ ? undefined : present ? "Hay alguien" : `Sin presencia · ${relTime(occ.last_changed)}`,
          body:
            lux !== undefined
              ? html`<div class="stats">${this.stat("Luz ambiente", `${fmt(lux, 0)}`, "lux")}</div>`
              : nothing,
        };
      }
    }
  }

  /** Tiempo que falta para la próxima dosificación (según el temporizador) y su hora. */
  private nextDose(timer: string): { text: string; at?: string } {
    const e = st(this.hass, timer);
    if (!e || isUnavailable(e)) return { text: "Sin conexión" };
    const fmtLeft = (ms: number) => {
      const m = Math.max(0, Math.ceil(ms / 60_000));
      return m < 1
        ? "menos de 1 min"
        : m >= 60
          ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`
          : `${m} min`;
    };
    if (e.state === "active") {
      const end = Date.parse(e.attributes.finishes_at as string);
      if (!Number.isFinite(end)) return { text: "—" };
      return {
        text: fmtLeft(end - Date.now()),
        at: new Date(end).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
      };
    }
    if (e.state === "paused") {
      const [hh = 0, mm = 0, ss = 0] = String(e.attributes.remaining ?? "0:0:0")
        .split(":")
        .map(Number);
      return { text: `En pausa · ${fmtLeft((hh * 3600 + mm * 60 + ss) * 1000)}` };
    }
    return { text: "Sin programar" };
  }

  /** Dosificación periódica: descarga inmediata, cuenta atrás, intervalo y programación automática. */
  private dose(c: NonNullable<Extract<DeviceDef, { type: "switch" }>["dose"]>) {
    const h = this.hass;
    const iv = st(h, c.interval);
    const min = (iv?.attributes.min as number | undefined) ?? 10;
    const max = (iv?.attributes.max as number | undefined) ?? 480;
    const step = (iv?.attributes.step as number | undefined) ?? 5;
    const val = this.doseDraft ?? num(h, c.interval) ?? min;
    const auto = isOn(h, c.auto);
    const dosing = isOn(h, c.script);
    const { text, at } = this.nextDose(c.timer);
    const hm = (m: number) =>
      m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`;
    const setInterval = (v: number) => {
      this.doseDraft = undefined;
      call(h, "input_number", "set_value", { entity_id: c.interval, value: v });
      // El nuevo intervalo se aplica ya: la cuenta atrás en marcha se reinicia con él
      if (st(h, c.timer)?.state === "active")
        call(h, "timer", "start", { entity_id: c.timer, duration: v * 60 });
    };
    return html`
      <div class="dose">
        <div class="dose-next">
          <div>
            <span class="faint">Próxima dosis</span>
            <b class="num">${auto || st(h, c.timer)?.state === "active" ? text : "Automático desactivado"}</b>
          </div>
          ${at && auto ? html`<span class="muted num">a las ${at}</span>` : nothing}
        </div>
        <button
          class="btn wide"
          ?disabled=${dosing || isUnavailable(st(h, c.script))}
          @click=${() => call(h, "script", "turn_on", { entity_id: c.script })}
        >
          ${dosing ? "Dosificando…" : "Dosificar ahora"}
        </button>
        <div class="dose-iv">
          <span class="muted">Cada <b class="num">${hm(val)}</b></span>
          <fv2-slider
            variant="thin"
            min=${min}
            max=${max}
            step=${step}
            label="Intervalo entre dosis"
            .value=${val}
            fill="var(--sky)"
            @input=${(ev: Event) => (this.doseDraft = Number((ev.target as Slider).value))}
            @change=${(ev: Event) => setInterval(Number((ev.target as Slider).value))}
          ></fv2-slider>
        </div>
        <div class="line-ctl">
          <span class="muted">Automático${c.hours ? ` · ${c.hours}` : ""}</span>
          <button
            class="toggle ${auto ? "on" : ""}"
            @click=${() => call(h, "automation", "toggle", { entity_id: c.auto })}
          ></button>
        </div>
      </div>
    `;
  }

  private hvac(entity: string) {
    const h = this.hass;
    const e = st(h, entity);
    const a = e?.attributes ?? {};
    const mode = e?.state ?? "off";
    const target = this.hvacDraft ?? (a.temperature as number | undefined) ?? 24;
    const cur = a.current_temperature as number | undefined;
    const min = (a.min_temp as number | undefined) ?? 15;
    const max = (a.max_temp as number | undefined) ?? 32;
    const modes = (a.hvac_modes as string[] | undefined) ?? [];
    const fans = (a.fan_modes as string[] | undefined) ?? [];
    const on = mode !== "off";
    const color = mode === "heat" ? "var(--terracotta)" : mode === "cool" ? "var(--sky)" : "var(--sage)";
    const set = (t: number) => {
      const v = Math.max(min, Math.min(max, t));
      this.hvacDraft = v;
      call(h, "climate", "set_temperature", { entity_id: entity, temperature: v });
    };
    const FAN_ES: Record<string, string> = { auto: "Auto", low: "Bajo", medium: "Medio", high: "Alto" };
    return {
      entity,
      active: on,
      status: `${HVAC_ES[mode] ?? mode}${cur !== undefined ? ` · ${fmt(cur, 1)}° dentro` : ""}`,
      body: html`
        <div class="hvac">
          <button class="round" title="Bajar" @click=${() => set(target - 1)}>${icon(mdiMinus)}</button>
          <fv2-ring
            .value=${((target - min) / (max - min)) * 100}
            .size=${132}
            .stroke=${11}
            gauge
            .color=${on ? color : "var(--text-faint)"}
          >
            <div class="ring-in">
              <span class="faint">Objetivo</span>
              <b class="big num">${fmt(target, 0)}°</b>
              <span class="faint">${on ? (HVAC_ES[mode] ?? mode) : "Apagado"}</span>
            </div>
          </fv2-ring>
          <button class="round" title="Subir" @click=${() => set(target + 1)}>${icon(mdiPlus)}</button>
        </div>
        <div class="seg">
          ${modes.map(
            (m) =>
              html`<button
                class=${m === mode ? "on" : ""}
                @click=${() => call(h, "climate", "set_hvac_mode", { entity_id: entity, hvac_mode: m })}
              >
                ${m === "off" ? icon(mdiPower) : (HVAC_ES[m] ?? m)}
              </button>`,
          )}
        </div>
        ${
          fans.length
            ? html`<div class="seg">
                ${fans.map(
                  (f) =>
                    html`<button
                      class=${f === a.fan_mode ? "on" : ""}
                      @click=${() => call(h, "climate", "set_fan_mode", { entity_id: entity, fan_mode: f })}
                    >
                      ${icon(mdiAirFilter)} ${FAN_ES[f] ?? f}
                    </button>`,
                )}
              </div>`
            : nothing
        }
      `,
    };
  }

  private tv(entity: string) {
    const h = this.hass;
    const e = st(h, entity);
    const on = !!e && !MEDIA_OFF.includes(e.state);
    const a = e?.attributes ?? {};
    const vol = typeof a.volume_level === "number" ? Math.round(a.volume_level * 100) : undefined;
    const sources = (a.source_list as string[] | undefined) ?? [];
    const remote = `remote.${entity.split(".")[1]}`;
    const power = () => {
      if (on) call(h, "media_player", "turn_off", { entity_id: entity });
      else if (h?.states[remote]) call(h, "remote", "turn_on", { entity_id: remote });
      else call(h, "media_player", "turn_on", { entity_id: entity });
    };
    const what = (a.media_title ?? a.app_name ?? a.source) as string | undefined;
    return {
      entity,
      active: on,
      status: on ? `Encendida${what ? ` · ${what}` : ""}` : "Apagada",
      body: html`
        <div class="actions">
          <button class="btn ${on ? "" : "primary"}" @click=${power}>
            ${icon(mdiPower)} ${on ? "Apagar" : "Encender"}
          </button>
          ${
            on
              ? html`
                  <button
                    class="round"
                    title="Bajar volumen"
                    @click=${() => call(h, "media_player", "volume_down", { entity_id: entity })}
                  >
                    ${icon(mdiVolumeMinus)}
                  </button>
                  <span class="num vol">${vol ?? "—"}</span>
                  <button
                    class="round"
                    title="Subir volumen"
                    @click=${() => call(h, "media_player", "volume_up", { entity_id: entity })}
                  >
                    ${icon(mdiVolumePlus)}
                  </button>
                  <button
                    class="round ${a.is_volume_muted ? "on" : ""}"
                    title="Silencio"
                    @click=${() => call(h, "media_player", "volume_mute", { entity_id: entity, is_volume_muted: !a.is_volume_muted })}
                  >
                    ${icon(a.is_volume_muted ? mdiVolumeOff : mdiVolumeHigh)}
                  </button>
                `
              : nothing
          }
        </div>
        ${
          on && sources.length
            ? html`<div class="chips">
                ${sources
                  .slice(0, 8)
                  .map(
                    (s) =>
                      html`<button
                        class="pill ${s === a.source ? "ok" : ""}"
                        @click=${() => call(h, "media_player", "select_source", { entity_id: entity, source: s })}
                      >
                        ${s}
                      </button>`,
                  )}
              </div>`
            : nothing
        }
      `,
    };
  }

  private energy() {
    const h = this.hass;
    const s = ENERGY.sensors;
    const pv = num(h, s.pv) ?? 0;
    const bat = num(h, s.battery) ?? 0;
    const grid = num(h, s.grid) ?? 0;
    const load = num(h, s.load) ?? 0;
    const soc = num(h, s.soc) ?? 0;
    const today = (id: string) => num(h, `sensor.david_lopez_perez_${id}`);
    return {
      entity: s.soc,
      active: pv > 0.05,
      status: pv > 0.05 ? `Produciendo ${fmt(pv, 2)} kW` : "Sin producción",
      body: html`
        <fv2-energy-flow .pv=${pv} .battery=${bat} .grid=${grid} .load=${load} .soc=${soc}></fv2-energy-flow>
        <div class="stats four">
          ${this.stat("Solar hoy", `${fmt(today("daily_pv_generation"), 1)}`, "kWh", "var(--amber)")}
          ${this.stat("Consumo", `${fmt(today("home_consumption_today"), 1)}`, "kWh", "var(--terracotta)")}
          ${this.stat("Vertido", `${fmt(today("grid_export_today"), 1)}`, "kWh", "var(--lilac)")}
          ${this.stat("Comprado", `${fmt(today("grid_import_today"), 1)}`, "kWh", "var(--sky)")}
        </div>
        <button
          class="btn wide"
          @click=${() => this.dispatchEvent(new CustomEvent("open-solar", { bubbles: true, composed: true }))}
        >
          ${icon(mdiChartBar)} Ver el resumen de la instalación
        </button>
        <span class="sub">Batería y producción · últimas 24 h</span>
        <fv2-area-chart
          .height=${90}
          .digits=${0}
          .series=${[
            { data: this.series[s.soc] ?? [], color: "var(--sage)", unit: " %", own: true, label: "Batería" },
            { data: this.series[s.pv] ?? [], color: "var(--amber)", unit: " kW", own: true, label: "Solar" },
          ]}
        ></fv2-area-chart>
      `,
    };
  }

  private stat(label: string, value: string, sub: string, color?: string) {
    return html`<div class="stat" style=${color ? `--c:${color}` : ""}>
      <span class="lbl">${color ? html`<i></i>` : nothing}${label}</span>
      <b class="num">${value}</b>
      ${sub ? html`<span class="faint">${sub}</span>` : nothing}
    </div>`;
  }

  private bar(pct: number, color: string, label: string) {
    return html`<div class="progress">
      <span style="width:${pct}%;background:${color}"></span><b>${label}</b>
    </div>`;
  }

  static styles = [
    shared,
    css`
      :host {
        display: block;
        border-radius: var(--radius-sm);
        background: var(--chip);
        transition: background 400ms var(--ease);
      }
      .card {
        padding: 12px;
      }
      .card.active {
        background: var(--sage-soft);
        border-radius: var(--radius-sm);
      }
      .ttl {
        display: grid;
        min-width: 0;
      }
      .ttl b {
        color: var(--text);
        font-size: var(--fs-small);
      }
      .ttl span {
        font-weight: 500;
        font-size: var(--fs-label);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .active .ico {
        background: var(--sage);
        color: #fff;
      }
      .dots {
        display: grid;
        place-items: center;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        color: var(--text-faint);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }
      .actions .round {
        width: 38px;
        height: 38px;
        background: var(--glass-strong);
      }
      .vol {
        min-width: 2ch;
        text-align: center;
        font-weight: 700;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
        gap: 8px;
      }
      .stats.four {
        grid-template-columns: repeat(2, 1fr);
      }
      .stat {
        display: grid;
        padding: 8px 10px;
        border-radius: 12px;
        background: var(--glass-strong);
      }
      .stat .lbl {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: var(--fs-label);
        color: var(--text-muted);
      }
      .stat i {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--c);
      }
      .stat b {
        font-size: calc(var(--fs-title) * 1.05);
        font-weight: 700;
      }
      .stat .faint {
        font-size: var(--fs-label);
      }
      .sub {
        font-size: var(--fs-label);
        color: var(--text-muted);
        font-weight: 600;
      }
      .dose {
        display: grid;
        gap: 10px;
      }
      .dose-next {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px 10px;
        border-radius: 12px;
        background: var(--chip);
      }
      .dose-next > div {
        display: grid;
        gap: 2px;
      }
      .dose-next .faint {
        font-size: var(--fs-label);
      }
      .dose-iv {
        display: grid;
        gap: 6px;
      }
      .line-ctl {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: var(--fs-small);
      }
      .list {
        display: grid;
        gap: 6px;
      }
      .cam-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 8px;
        margin-bottom: 8px;
      }
      .cam-tile {
        padding: 0;
        border: 0;
        background: none;
        cursor: pointer;
      }
      .tap {
        cursor: pointer;
      }
      .li {
        display: grid;
        grid-template-columns: 10px auto 1fr;
        align-items: center;
        gap: 8px;
        font-size: var(--fs-small);
      }
      .li .muted {
        text-align: right;
        font-size: var(--fs-label);
      }
      .dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--sage);
      }
      .dot.warn {
        background: var(--amber);
        animation: glow 1.8s ease-in-out infinite;
      }
      .dot.bad {
        background: var(--danger);
        animation: glow 1.1s ease-in-out infinite;
      }
      .wide {
        width: 100%;
        padding: 12px;
      }
      .hvac {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-3);
      }
      .ring-in {
        display: grid;
        gap: 0;
        font-size: var(--fs-label);
      }
      .big {
        font-size: 34px;
        font-weight: 600;
        line-height: 1.05;
      }
      .seg button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
      }
      .inks {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--space-2);
        text-align: center;
      }
      .ink {
        display: grid;
        justify-items: center;
        gap: 4px;
      }
      .ink .lbl {
        font-size: var(--fs-label);
        color: var(--text-faint);
      }
      .ink-bar {
        position: relative;
        width: 18px;
        height: 54px;
        border-radius: 6px;
        background: var(--track);
        overflow: hidden;
      }
      .ink-bar i {
        position: absolute;
        inset: auto 0 0;
        background: var(--c);
        border-radius: 6px;
        transition: height 600ms var(--ease);
      }
      .progress {
        position: relative;
        height: 24px;
        border-radius: 999px;
        background: var(--track);
        overflow: hidden;
      }
      .progress span {
        position: absolute;
        inset: 0 auto 0 0;
        border-radius: 999px;
        transition: width 1s var(--ease);
      }
      .progress b {
        position: relative;
        display: block;
        text-align: center;
        line-height: 24px;
        font-size: var(--fs-label);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "fv2-device": DeviceCard;
  }
}
