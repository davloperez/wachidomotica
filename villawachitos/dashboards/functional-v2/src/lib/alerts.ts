/**
 * Catálogo de avisos de la vista general. Cada aviso posible es una `AlertRule` (grupo, niveles,
 * cuándo salta, entidades que vigila y cómo se evalúa). El panel de _Avisos_ enseña solo los que se
 * cumplen (`computeAlerts`); la hoja «Todos los avisos» enseña todo el catálogo, activo o no
 * (`alertCatalog`).
 *
 * ⚠ Al añadir o quitar un aviso, o un dispositivo que genera avisos, hay que tocar AQUÍ la regla
 * correspondiente (ver `CLAUDE.md`): lo que salga de `rooms.ts` (puertas, fugas, electrodomésticos…)
 * se recoge solo, lo demás necesita su regla.
 */
import type { HomeAssistant } from "../types";
import { EXTRA_LEAKS, FRIDGE, ROOMS_DEF, ENERGY, ROOM_BY_ID, type DeviceDef } from "../house/rooms";
import { isOn, isUnavailable, num, st } from "./ha";
import { weatherAlerts, weatherSensorIds } from "./weather";
import { DOORBELL, VACUUM_LEAK } from "./priority";

export type Level = "bad" | "warn" | "info";

export interface Alert {
  level: Level;
  title: string;
  detail?: string;
  room?: string;
  since?: string;
}

/** Datos con los que se evalúa una regla. */
export interface AlertCtx {
  hass: HomeAssistant;
  alarm?: string;
  weather?: string[];
}

export interface AlertRule {
  id: string;
  /** Sección de la hoja «Todos los avisos» */
  group: string;
  /** Niveles que puede tener (el aviso real trae el suyo) */
  levels: Level[];
  title: string;
  /** Condición, en una frase: «Salta si…» */
  when: string;
  /** Alerta a pantalla completa (`priority.ts`): no sale en el panel de Avisos */
  fullscreen?: boolean;
  /** Entidades que vigila (para contarlas y listarlas) */
  entities: (c: AlertCtx) => string[];
  /** Avisos activos ahora (lista vacía = no aplica) */
  check: (c: AlertCtx) => Alert[];
}

/** `binary_sensor` de avería que no son relevantes en el panel. */
const IGNORE = [/connectif/, /cpu_vulnerabilities/];
/** Prefijo de las entidades del robot aspirador (sus averías se sitúan en el salón, donde está la base) */
const VACUUM_ID = VACUUM_LEAK.vacuum.split(".")[1];

/** Dispositivos de un tipo en todas las estancias, con la estancia a la que pertenecen. */
function devicesOf<T extends DeviceDef["type"]>(
  type: T,
): { room: string; dev: Extract<DeviceDef, { type: T }> }[] {
  return ROOMS_DEF.flatMap((r) =>
    r.devices
      .filter((d): d is Extract<DeviceDef, { type: T }> => d.type === type)
      .map((dev) => ({ room: r.id, dev })),
  );
}

const leakSensors = (): (readonly [string, string | undefined])[] => [
  ...ROOMS_DEF.flatMap((r) => (r.leaks ?? []).map((l) => [l, r.id] as const)),
  ...EXTRA_LEAKS.map((l) => [l, undefined] as const),
];
const doors = () => ROOMS_DEF.flatMap((r) => (r.doors ?? []).map((d) => ({ ...d, room: r.id })));
const gates = () => devicesOf("gates").flatMap(({ room, dev }) => dev.gates.map((g) => ({ ...g, room })));

/** `binary_sensor` de clase `problem` que existen en HA (menos los ignorados y el arenero, que tiene su regla). */
function problemSensors(hass: HomeAssistant): string[] {
  return Object.values(hass.states)
    .filter(
      (e) =>
        e.entity_id.startsWith("binary_sensor.") &&
        e.attributes.device_class === "problem" &&
        !IGNORE.some((re) => re.test(e.entity_id)) &&
        !e.entity_id.includes("arenero"),
    )
    .map((e) => e.entity_id);
}

const since = (c: AlertCtx, id: string) => st(c.hass, id)?.last_changed;

/**
 * El orden importa: a igual nivel, el panel de Avisos respeta el de este array.
 * Las reglas `fullscreen` van al final y no cuentan para el panel de Avisos.
 */
export const ALERT_RULES: AlertRule[] = [
  // ── Seguridad ───────────────────────────────────────────────────────────
  {
    id: "alarm-triggered",
    group: "Seguridad",
    levels: ["bad"],
    title: "Alarma disparada",
    when: "La alarma de la vivienda está disparada",
    entities: (c) => (c.alarm ? [c.alarm] : []),
    check: (c) => {
      const a = st(c.hass, c.alarm);
      return a?.state === "triggered"
        ? [{ level: "bad", title: "Alarma disparada", since: a.last_changed }]
        : [];
    },
  },
  {
    id: "alarm-pending",
    group: "Seguridad",
    levels: ["bad"],
    title: "Prealarma",
    when: "La alarma está en cuenta atrás antes de dispararse",
    entities: (c) => (c.alarm ? [c.alarm] : []),
    check: (c) => {
      const a = st(c.hass, c.alarm);
      return a?.state === "pending"
        ? [{ level: "bad", title: "Prealarma: desconecta si es una falsa alarma", since: a.last_changed }]
        : [];
    },
  },
  // ── Agua ────────────────────────────────────────────────────────────────
  {
    id: "leak",
    group: "Agua",
    levels: ["bad"],
    title: "Fuga de agua",
    when: "Un sensor de agua detecta humedad",
    entities: () => leakSensors().map(([id]) => id),
    check: (c) =>
      leakSensors()
        .filter(([id]) => isOn(c.hass, id))
        .map(([id, room]) => ({
          level: "bad" as const,
          title: "Fuga de agua",
          detail: friendly(c.hass, id),
          room,
          since: since(c, id),
        })),
  },
  // ── Puertas ─────────────────────────────────────────────────────────────
  {
    id: "door-open",
    group: "Puertas",
    levels: ["warn"],
    title: "Puerta abierta",
    when: "Una puerta con sensor de contacto está abierta",
    entities: () => doors().map((d) => d.entity),
    check: (c) =>
      doors()
        .filter((d) => isOn(c.hass, d.entity))
        .map((d) => ({
          level: "warn" as const,
          title: `${d.name} abierta`,
          room: d.room,
          since: since(c, d.entity),
        })),
  },
  {
    id: "gate-open",
    group: "Puertas",
    levels: ["info"],
    title: "Puerta de la parcela abierta",
    when: "Una puerta del jardín o del garaje está abierta",
    entities: () => gates().map((g) => g.entity),
    check: (c) =>
      gates()
        .filter((g) => isOn(c.hass, g.entity))
        .map((g) => ({
          level: "info" as const,
          title: `Puerta ${g.name.toLowerCase()} abierta`,
          room: g.room,
          since: since(c, g.entity),
        })),
  },
  // ── Cocina ──────────────────────────────────────────────────────────────
  {
    id: "fridge-door",
    group: "Cocina",
    levels: ["warn"],
    title: "Puerta del frigorífico abierta",
    when: "La puerta del frigorífico está abierta",
    entities: () => [FRIDGE.sensors.door],
    check: (c) =>
      isOn(c.hass, FRIDGE.sensors.door)
        ? [
            {
              level: "warn",
              title: "Puerta del frigorífico abierta",
              room: "cocina",
              since: since(c, FRIDGE.sensors.door),
            },
          ]
        : [],
  },
  {
    id: "fridge-temp",
    group: "Cocina",
    levels: ["warn"],
    title: "Frigorífico demasiado caliente",
    when: "El frigorífico supera los 9°",
    entities: () => [FRIDGE.sensors.fridge],
    check: (c) => {
      const t = num(c.hass, FRIDGE.sensors.fridge);
      return t !== undefined && t > 9
        ? [{ level: "warn", title: `Frigorífico a ${t}°`, room: "cocina" }]
        : [];
    },
  },
  // ── Electrodomésticos ───────────────────────────────────────────────────
  {
    id: "dishwasher-supplies",
    group: "Electrodomésticos",
    levels: ["info"],
    title: "Lavavajillas: falta sal o abrillantador",
    when: "El lavavajillas avisa de que falta sal o abrillantador",
    entities: () => devicesOf("dishwasher").flatMap(({ dev }) => [dev.salt, dev.rinse]),
    check: (c) =>
      devicesOf("dishwasher").flatMap(({ room, dev }) =>
        (
          [
            [dev.salt, "sal"],
            [dev.rinse, "abrillantador"],
          ] as const
        )
          .filter(([id]) => ["on", "present", "true"].includes(st(c.hass, id)?.state ?? ""))
          .map(([, what]) => ({ level: "info" as const, title: `Lavavajillas: falta ${what}`, room })),
      ),
  },
  {
    id: "dishwasher-done",
    group: "Electrodomésticos",
    levels: ["info"],
    title: "Lavavajillas terminado",
    when: "El lavavajillas ha acabado el ciclo",
    entities: () => devicesOf("dishwasher").map(({ dev }) => dev.state),
    check: (c) =>
      devicesOf("dishwasher")
        .filter(({ dev }) => st(c.hass, dev.state)?.state?.toLowerCase() === "finished")
        .map(({ room, dev }) => ({
          level: "info" as const,
          title: "Lavavajillas terminado",
          room,
          since: since(c, dev.state),
        })),
  },
  {
    id: "washer-done",
    group: "Electrodomésticos",
    levels: ["info"],
    title: "Lavadora terminada",
    when: "La lavadora ha acabado y hay que tender la ropa",
    entities: () => devicesOf("washer").map(({ dev }) => dev.status),
    check: (c) =>
      devicesOf("washer")
        .filter(({ dev }) => st(c.hass, dev.status)?.state === "Terminada")
        .map(({ room, dev }) => ({
          level: "info" as const,
          title: "Lavadora terminada: tender la ropa",
          room,
          since: since(c, dev.running),
        })),
  },
  {
    id: "litter-full",
    group: "Electrodomésticos",
    levels: ["warn"],
    title: "Arenero: cubo lleno",
    when: "El cubo de residuos del arenero está lleno",
    entities: () => devicesOf("litter").map(({ dev }) => dev.full),
    check: (c) =>
      devicesOf("litter")
        .filter(({ dev }) => isOn(c.hass, dev.full))
        .map(({ room }) => ({ level: "warn" as const, title: "Arenero: cubo lleno", room })),
  },
  {
    id: "litter-clean",
    group: "Electrodomésticos",
    levels: ["info"],
    title: "Arenero: necesita limpieza",
    when: "El arenero pide limpieza (y el cubo no está lleno)",
    entities: () => devicesOf("litter").map(({ dev }) => dev.clean),
    check: (c) =>
      devicesOf("litter")
        .filter(({ dev }) => !isOn(c.hass, dev.full) && isOn(c.hass, dev.clean))
        .map(({ room }) => ({ level: "info" as const, title: "Arenero: necesita limpieza", room })),
  },
  // ── Meteorología ────────────────────────────────────────────────────────
  {
    id: "weather",
    group: "Meteorología",
    levels: ["info", "warn", "bad"],
    title: "Aviso meteorológico (AEMET)",
    when: "Un sensor de Meteoalarm está activo: amarillo = info, naranja = aviso, rojo = importante",
    entities: (c) => weatherSensorIds(c.hass, c.weather),
    check: (c) => weatherAlerts(c.hass, c.weather),
  },
  // ── Energía ─────────────────────────────────────────────────────────────
  {
    id: "battery-low",
    group: "Energía",
    levels: ["warn"],
    title: "Batería solar baja",
    when: "La batería de la casa baja del 15 %",
    entities: () => [ENERGY.sensors.soc],
    check: (c) => {
      const soc = num(c.hass, ENERGY.sensors.soc);
      return soc !== undefined && soc < 15
        ? [{ level: "warn", title: `Batería solar al ${Math.round(soc)} %`, room: "lavadero" }]
        : [];
    },
  },
  // ── Sistema ─────────────────────────────────────────────────────────────
  {
    id: "problem",
    group: "Sistema",
    levels: ["info", "warn"],
    title: "Avería de un dispositivo",
    when: "Un binary_sensor de clase «problem» está activo (frigorífico y Aidoo cuentan como aviso)",
    entities: (c) => problemSensors(c.hass),
    check: (c) =>
      problemSensors(c.hass)
        .filter((id) => isOn(c.hass, id))
        .map((id) => ({
          level: id.includes("frigo") || id.includes("aidoo") ? ("warn" as const) : ("info" as const),
          title: friendly(c.hass, id),
          room: id.includes("frigo")
            ? "cocina"
            : id.includes(VACUUM_ID) || id.includes("aidoo")
              ? "salon"
              : undefined,
          since: since(c, id),
        })),
  },
  {
    id: "offline",
    group: "Sistema",
    levels: ["info"],
    title: "Dispositivos sin conexión",
    when: "Una luz o persiana del panel está «unavailable»",
    entities: () =>
      ROOMS_DEF.flatMap((r) => [...r.lights.map((l) => l.entity), ...r.covers.map((v) => v.entity)]),
    check: (c) => {
      const offline = [
        ...new Set(
          ROOMS_DEF.flatMap((r) => [
            ...r.lights.map((l) => l.entity),
            ...r.covers.map((v) => v.entity),
          ]).filter((id) => isUnavailable(st(c.hass, id))),
        ),
      ];
      return offline.length
        ? [
            {
              level: "info",
              title: `${offline.length} dispositivo${offline.length > 1 ? "s" : ""} sin conexión`,
              detail:
                offline
                  .map((id) => friendly(c.hass, id))
                  .slice(0, 3)
                  .join(", ") + (offline.length > 3 ? "…" : ""),
            },
          ]
        : [];
    },
  },
  // ── A pantalla completa (priority.ts) ───────────────────────────────────
  {
    id: "doorbell",
    group: "A pantalla completa",
    levels: ["warn"],
    title: "Llaman a la puerta",
    when: "Suena el timbre del portero: tarjeta a pantalla completa durante 2 min o hasta descartarla",
    fullscreen: true,
    entities: () => [DOORBELL.event, DOORBELL.ringing],
    check: (c) =>
      isOn(c.hass, DOORBELL.ringing)
        ? [
            {
              level: "warn",
              title: "Llaman a la puerta",
              room: DOORBELL.room,
              since: since(c, DOORBELL.ringing),
            },
          ]
        : [],
  },
  {
    id: "vacuum-leak",
    group: "A pantalla completa",
    levels: ["bad"],
    title: "Fuga de agua en el limpiasuelos",
    when: "El sensor de la base del limpiasuelos está mojado: tarjeta a pantalla completa hasta descartarla",
    fullscreen: true,
    entities: () => [VACUUM_LEAK.sensor],
    check: (c) =>
      isOn(c.hass, VACUUM_LEAK.sensor)
        ? [
            {
              level: "bad",
              title: "Fuga de agua en el limpiasuelos",
              room: VACUUM_LEAK.room,
              since: since(c, VACUUM_LEAK.sensor),
            },
          ]
        : [],
  },
];

export interface RuleStatus {
  rule: AlertRule;
  /** Avisos activos de esta regla (vacío = no aplica ahora) */
  active: Alert[];
  /** Entidades que vigila */
  entities: string[];
}

/** Todas las reglas con su estado actual (hoja «Todos los avisos»). */
export function alertCatalog(
  hass: HomeAssistant | undefined,
  alarm?: string,
  weatherSensors?: string[],
): RuleStatus[] {
  if (!hass) return [];
  const c: AlertCtx = { hass, alarm, weather: weatherSensors };
  return ALERT_RULES.map((rule) => ({ rule, active: rule.check(c), entities: rule.entities(c) }));
}

const ORDER: Record<Level, number> = { bad: 0, warn: 1, info: 2 };

/** Avisos activos del panel de Avisos, del más grave al menos. */
export function computeAlerts(
  hass: HomeAssistant | undefined,
  alarm?: string,
  weatherSensors?: string[],
): Alert[] {
  if (!hass) return [];
  const c: AlertCtx = { hass, alarm, weather: weatherSensors };
  return ALERT_RULES.filter((r) => !r.fullscreen)
    .flatMap((r) => r.check(c))
    .sort((x, y) => ORDER[x.level] - ORDER[y.level]);
}

export function friendly(hass: HomeAssistant, id: string): string {
  const name = hass.states[id]?.attributes.friendly_name;
  return typeof name === "string" ? name : id;
}

export function roomName(id?: string): string | undefined {
  return id ? ROOM_BY_ID.get(id)?.name : undefined;
}
