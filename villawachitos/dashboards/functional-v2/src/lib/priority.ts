/**
 * Alertas prioritarias: aparecen a pantalla completa, por encima de todo, hasta que se descartan.
 *
 * - **Timbre** del portero Fermax DuoX: la entidad `event.*_doorbell` cambia su estado (la hora del
 *   último timbrazo) cada vez que llaman; además `binary_sensor.*_doorbell_zero` está a `on` unos
 *   segundos. La alerta dura `RING_MS` o hasta que se descarta o se abre la puerta.
 * - **Fuga de agua** en la base del limpiasuelos Dreame: mientras el sensor esté mojado. Al descartarla
 *   no vuelve a salir hasta que el sensor se seque y se moje otra vez.
 */
import type { HomeAssistant } from "../types";
import { st } from "./ha";

export const DOORBELL = {
  event: "event.jardin_norte_portero_automatico_exterior_duox_doorbell",
  ringing: "binary_sensor.jardin_norte_portero_automatico_exterior_duox_doorbell_zero",
  lock: "lock.jardin_norte_portero_automatico_exterior_duox_zero",
  /** Estancia donde está (para "ver en el plano") */
  room: "exterior",
};

export const VACUUM_LEAK = {
  sensor: "binary_sensor.sensor_agua_dreame_water_leak",
  vacuum: "vacuum.x60_pro_master",
  room: "salon",
};

/** Cuánto dura en pantalla la alerta del timbre si nadie la toca */
export const RING_MS = 2 * 60_000;

export type PriorityKind = "doorbell" | "leak";

export interface PriorityAlert {
  kind: PriorityKind;
  /** Identifica esta aparición concreta (para poder descartarla) */
  key: string;
  /** Momento en que empezó (ms) */
  since: number;
}

const STORE = "fv2-dismissed-alerts";

/** Sigue el estado de las entidades y decide qué alertas están activas. */
export class PriorityWatcher {
  private lastEvent?: string;
  private ring?: { key: string; at: number };
  private dismissed = new Set<string>();

  constructor() {
    try {
      const v = JSON.parse(localStorage.getItem(STORE) ?? "[]") as string[];
      this.dismissed = new Set(v.slice(-20));
    } catch {
      /* sin almacenamiento */
    }
  }

  dismiss(key: string): void {
    this.dismissed.add(key);
    try {
      localStorage.setItem(STORE, JSON.stringify([...this.dismissed].slice(-20)));
    } catch {
      /* ignorar */
    }
  }

  update(hass: HomeAssistant | undefined, now = Date.now()): PriorityAlert[] {
    if (!hass) return [];
    const out: PriorityAlert[] = [];

    // Timbre: un cambio del evento (o el sensor a "on") arranca la alerta
    const ev = st(hass, DOORBELL.event)?.state;
    const valid = (s?: string) => !!s && Number.isFinite(Date.parse(s));
    if (valid(ev) && ev !== this.lastEvent) {
      const at = Date.parse(ev!);
      // Al cargar el panel solo cuenta si el timbrazo es de hace un momento
      if (this.lastEvent !== undefined || now - at < 45_000)
        this.ring = { key: `ring:${ev}`, at: Math.min(at, now) };
      this.lastEvent = ev;
    } else if (this.lastEvent === undefined) this.lastEvent = ev ?? "";
    const bin = st(hass, DOORBELL.ringing);
    if (bin?.state === "on" && (!this.ring || now - this.ring.at > 60_000))
      this.ring = { key: `ring:${bin.last_changed}`, at: now };
    if (this.ring && now - this.ring.at < RING_MS && !this.dismissed.has(this.ring.key))
      out.push({ kind: "doorbell", key: this.ring.key, since: this.ring.at });

    // Fuga en el robot
    const leak = st(hass, VACUUM_LEAK.sensor);
    if (leak?.state === "on") {
      const key = `leak:${leak.last_changed}`;
      if (!this.dismissed.has(key))
        out.push({ kind: "leak", key, since: Date.parse(leak.last_changed) || now });
    }
    return out;
  }
}
