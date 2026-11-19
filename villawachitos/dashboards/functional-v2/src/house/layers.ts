/**
 * Capas del panel: cada capa reúne todos los dispositivos de la casa de un mismo tipo
 * (luces, persianas, clima, energía, electrodomésticos, seguridad y multimedia), con su
 * posición en el plano y su estancia. Un dispositivo puede estar en varias capas
 * (la lavadora es electrodoméstico y también consumo).
 */
import {
  mdiBlindsHorizontal,
  mdiDoorClosed,
  mdiFlash,
  mdiLightbulbGroupOutline,
  mdiShieldHomeOutline,
  mdiTelevisionClassic,
  mdiThermometer,
  mdiWashingMachine,
  mdiWaterAlertOutline,
  mdiMapMarkerQuestionOutline,
} from "@mdi/js";
import type { HomeAssistant } from "../types";
import { ALARM_ES, fmt, isOn, num, st } from "../lib/ha";
import { POOL, WALLS, type Rect } from "../plan/house-plan";
import { ENERGY, EXTRA_LEAKS, ROOMS_DEF, TV, deviceSpot, lampPos, type DeviceDef, type RoomDef } from "./rooms";

export type LayerId = "luces" | "persianas" | "clima" | "energia" | "electro" | "seguridad" | "multimedia";

export interface LayerDef {
  id: LayerId;
  name: string;
  icon: string;
}

export const LAYERS: LayerDef[] = [
  { id: "luces", name: "Luces", icon: mdiLightbulbGroupOutline },
  { id: "persianas", name: "Persianas", icon: mdiBlindsHorizontal },
  { id: "clima", name: "Clima", icon: mdiThermometer },
  { id: "energia", name: "Energía", icon: mdiFlash },
  { id: "electro", name: "Electrodomésticos", icon: mdiWashingMachine },
  { id: "seguridad", name: "Seguridad", icon: mdiShieldHomeOutline },
  { id: "multimedia", name: "Multimedia", icon: mdiTelevisionClassic },
];

export const LAYER_BY_ID = new Map(LAYERS.map((l) => [l.id, l]));

/** Sensores sencillos que se muestran como una fila (sin tarjeta propia). */
export type RowKind = "climate" | "door" | "leak" | "alarm";

export type LayerItem = {
  key: string;
  room: RoomDef;
  name: string;
  /** Punto del marcador en el plano (sin él, solo aparece en la lista) */
  pos?: [x: number, y: number, z: number];
} & (
  | { kind: "light"; entity: string }
  | { kind: "cover"; entity: string; curtain?: boolean }
  | { kind: "device"; device: DeviceDef }
  | { kind: "row"; row: RowKind; entity: string; second?: string; icon: string }
);

/* ------------------------------------------------------------------ */
/* Puntos del plano                                                    */
/* ------------------------------------------------------------------ */

const area = ([x1, z1, x2, z2]: Rect) => Math.abs((x2 - x1) * (z2 - z1));

/** Centro de la estancia en planta (su acceso, o el rectángulo mayor; la piscina para el exterior). */
function roomCenter(room: RoomDef): [number, number] {
  if (room.anchor) return room.anchor;
  const r = room.rects.length ? [...room.rects].sort((a, b) => area(b) - area(a))[0] : POOL.rect;
  return [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
}

/** Persianas: centro de su ventana en el muro del plano. */
export function coverSpot(entity: string): [number, number, number] | undefined {
  for (const w of WALLS)
    for (const o of w.openings ?? []) {
      if (o.cover !== entity) continue;
      const dx = w.to[0] - w.from[0];
      const dz = w.to[1] - w.from[1];
      const len = Math.hypot(dx, dz) || 1;
      return [w.from[0] + (dx / len) * o.at, 1.2, w.from[1] + (dz / len) * o.at];
    }
  return undefined;
}

/** Sitio de los dispositivos que no tienen mueble propio en el plano. */
const SPOTS: Record<string, [number, number, number]> = {
  // Control del aire acondicionado: dentro del armario del recibidor (entrada)
  "climate.aidoo_28_cc_ff_82_82_6f": [-5.8, 1.4, -2.1],
  // Pantallas de pared Shelly (presencia y luz ambiente)
  "binary_sensor.shellywalldisplay_0205030bbdd8_ocupacion": [1.15, 1.4, -0.85],
  // Shelly Cocina, en la pared sur de la cocina (antes «salón sur»)
  "sensor.shelly_salon_sur_iluminancia": [-5.6, 1.4, 4.4],
  "binary_sensor.oficina_1_shellywalldisplay_oficina1_ocupacion": [-3.7, 1.4, -3.0],
  "binary_sensor.oficina_2_shellywalldisplay_oficina2_ocupacion": [0.95, 1.4, -3.0],
  "media_player.fire_tv_dormitorio": [3.4, 1.0, 2.35],
  "binary_sensor.sensor_movimiento_vestidor_occupancy": [2.9, 2.2, 0.5],
  // Cortinas del salón, delante de la puerta grande (balconeras 1 y 2) y de la pequeña (balconera 3)
  "cover.cortina_grande_salon": [-3.6, 1.2, 3.4],
  "cover.cortina_pequena_salon": [-0.07, 1.2, 3.4],
  // Fugas, puerta principal y alarma
  "binary_sensor.sensor_agua_dreame_water_leak": [0.6, 0.3, -1.25],
  "binary_sensor.sensor_puerta_principal_contact": [-4.8, 1.3, -4.04],
  "alarm_control_panel.alarma_vivienda": [-4.1, 1.5, -2.6],
  // Cámaras exteriores
  "binary_sensor.cam_garaje_motion": [-8.8, 2.4, -8.6],
  "binary_sensor.cam_patio_lavadero_motion_2": [-7.9, 2.4, -2.0],
  "binary_sensor.cam_piscina_este_motion": [3.2, 2.2, 11.3],
  "binary_sensor.cam_piscina_oeste_motion_2": [-5.7, 2.2, 11.3],
  "binary_sensor.cam_exterior_este_motion_2": [8.2, 2.2, 0],
};

/** Pantallas que no son dispositivos de ninguna estancia (solo en la capa multimedia). */
const MEDIA: { room: string; entity: string; name: string }[] = [
  { room: "dormitorio_1", entity: "media_player.fire_tv_dormitorio", name: "Fire TV" },
];

export const ALARM = "alarm_control_panel.alarma_vivienda";

/** Grupo de la lista para lo que aún no tiene estancia en Home Assistant. */
const UNPLACED: RoomDef = {
  id: "sin_ubicar",
  name: "Sin ubicación",
  icon: mdiMapMarkerQuestionOutline,
  rects: [],
  lights: [],
  covers: [],
  devices: [],
};

const DEVICE_LAYER: Record<DeviceDef["type"], LayerId[]> = {
  hvac: ["clima"],
  towel: ["clima"],
  tv: ["multimedia"],
  vacuum: ["electro"],
  fridge: ["electro"],
  printer: ["electro"],
  dishwasher: ["electro"],
  airfryer: ["electro"],
  litter: ["electro"],
  washer: ["electro", "energia"],
  switch: ["energia"],
  pump: ["energia"],
  energy: ["energia"],
  gates: ["seguridad"],
  lock: ["seguridad"],
  cameras: ["seguridad"],
  presence: ["seguridad"],
};

/** Clave de entidad de un dispositivo (para su sitio y para no repetirlo). */
function deviceEntity(d: DeviceDef): string | undefined {
  if ("entity" in d) return d.entity;
  if (d.type === "presence") return d.occupancy ?? d.illuminance;
  if (d.type === "cameras" && d.cameras.length === 1) return d.cameras[0].motion;
  return undefined;
}

/** Clave de un dispositivo en las listas y marcadores (tipo + entidad o nombre). */
export function deviceKey(d: DeviceDef): string {
  return `${d.type}:${deviceEntity(d) ?? d.name}`;
}

/** Todos los elementos de una capa, en el orden de las estancias. */
export function layerItems(layer: LayerId): LayerItem[] {
  const out: LayerItem[] = [];
  for (const room of ROOMS_DEF) {
    const c = roomCenter(room);
    // Lo que no tiene sitio en el plano se reparte en círculo alrededor del centro de la estancia
    let loose = 0;
    const around = (): [number, number, number] => {
      const a = loose++ * 2.1 + 0.6;
      return [c[0] + Math.cos(a) * 0.7, 1.0, c[1] + Math.sin(a) * 0.7];
    };
    const spot = (key: string | undefined, fallback?: [number, number, number]) =>
      (key && SPOTS[key]) || fallback || around();

    if (layer === "luces")
      for (const l of room.lights)
        out.push({
          key: l.entity,
          room,
          name: l.name,
          kind: "light",
          entity: l.entity,
          pos: spot(l.entity, lampPos(l.entity)),
        });

    if (layer === "persianas")
      for (const cv of room.covers)
        out.push({
          key: cv.entity,
          room,
          name: cv.name,
          kind: "cover",
          entity: cv.entity,
          curtain: cv.curtain,
          pos: spot(cv.entity, coverSpot(cv.entity)),
        });

    if (layer === "clima" && room.temperature)
      out.push({
        key: room.temperature,
        room,
        name: "Temperatura y humedad",
        kind: "row",
        row: "climate",
        entity: room.temperature,
        second: room.humidity,
        icon: mdiThermometer,
        pos: spot(room.temperature),
      });

    if (layer === "seguridad") {
      if (room.id === "entrada")
        out.push({
          key: ALARM,
          room,
          name: "Alarma",
          kind: "row",
          row: "alarm",
          entity: ALARM,
          icon: mdiShieldHomeOutline,
          pos: spot(ALARM),
        });
      for (const d of room.doors ?? [])
        out.push({
          key: d.entity,
          room,
          name: d.name,
          kind: "row",
          row: "door",
          entity: d.entity,
          icon: mdiDoorClosed,
          pos: spot(d.entity),
        });
      for (const id of room.leaks ?? [])
        out.push({
          key: id,
          room,
          name: "Sensor de agua",
          kind: "row",
          row: "leak",
          entity: id,
          icon: mdiWaterAlertOutline,
          pos: spot(id),
        });
    }

    for (const d of room.devices) {
      // El enchufe con dosificación (ambientador) es un electrodoméstico, no un consumo de energía
      const layers = d.type === "switch" && d.dose ? ["electro"] : DEVICE_LAYER[d.type];
      if (!layers.includes(layer)) continue;
      // Cada cámara, con su propio marcador
      if (d.type === "cameras") {
        for (const cam of d.cameras)
          out.push({
            key: cam.motion,
            room,
            name: `Cámara ${cam.name.toLowerCase()}`,
            kind: "device",
            device: { type: "cameras", name: `Cámara ${cam.name.toLowerCase()}`, cameras: [cam] },
            pos: spot(cam.motion),
          });
        continue;
      }
      const ent = deviceEntity(d);
      const pos =
        d.type === "tv"
          ? ([TV.at[0], TV.lift + TV.height / 2, TV.at[1]] as [number, number, number])
          : spot(ent, deviceSpot(d));
      out.push({ key: `${d.type}:${ent ?? d.name}`, room, name: d.name, kind: "device", device: d, pos });
    }

    if (layer === "multimedia")
      for (const m of MEDIA.filter((x) => x.room === room.id))
        out.push({
          key: m.entity,
          room,
          name: m.name,
          kind: "device",
          device: { type: "tv", entity: m.entity, name: m.name },
          pos: spot(m.entity),
        });
  }
  // Sensores de agua zigbee sin estancia conocida: solo en la lista, sin marcador
  if (layer === "seguridad")
    EXTRA_LEAKS.forEach((id, i) =>
      out.push({
        key: id,
        room: UNPLACED,
        name: `Sensor de agua ${i + 1}`,
        kind: "row",
        row: "leak",
        entity: id,
        icon: mdiWaterAlertOutline,
      }),
    );
  return out;
}

/**
 * Elementos de las capas que la vista de estancia no pinta por sí sola: puertas, fugas y alarma
 * (filas) y las pantallas y altavoces de la capa multimedia.
 */
export function roomExtras(room: RoomDef): LayerItem[] {
  return [...layerItems("seguridad"), ...layerItems("multimedia")].filter(
    (it) =>
      it.room.id === room.id &&
      (it.kind === "row" || (it.kind === "device" && it.key.startsWith("media_player."))),
  );
}

/* ------------------------------------------------------------------ */
/* Estado de cada elemento                                             */
/* ------------------------------------------------------------------ */

// "idle" en las pantallas de pared es su estado normal (sin reproducir nada): no cuenta como encendida
const OFF_MEDIA = ["off", "standby", "unavailable", "unknown", "idle"];

/** ¿Está activo (encendido, abierto, con movimiento…)? Pinta el marcador. */
export function itemActive(h: HomeAssistant | undefined, it: LayerItem): boolean {
  switch (it.kind) {
    case "light":
      return isOn(h, it.entity);
    case "cover":
      return ((st(h, it.entity)?.attributes.current_position as number | undefined) ?? 0) > 0;
    case "row":
      if (it.row === "alarm") return (st(h, it.entity)?.state ?? "disarmed") !== "disarmed";
      return it.row === "climate" ? false : isOn(h, it.entity);
    case "device": {
      const d = it.device;
      switch (d.type) {
        case "hvac":
          return !["off", "unavailable"].includes(st(h, d.entity)?.state ?? "off");
        case "tv":
          return !OFF_MEDIA.includes(st(h, d.entity)?.state ?? "off");
        case "towel":
        case "switch":
        case "pump":
          return isOn(h, d.entity);
        case "washer":
          return isOn(h, d.running);
        case "vacuum":
          return st(h, d.entity)?.state === "cleaning";
        case "dishwasher":
          return (st(h, d.state)?.state ?? "").toLowerCase() === "run";
        case "airfryer":
          return (num(h, d.remaining) ?? 0) > 0;
        case "presence":
          return isOn(h, d.occupancy);
        case "cameras":
          return d.cameras.some((c) => isOn(h, c.motion) || isOn(h, c.person));
        case "gates":
          return d.gates.some((g) => isOn(h, g.entity));
        case "lock":
          return st(h, d.entity)?.state === "unlocked";
        case "energy":
          // Potencia de red negativa = se está consumiendo de la red (positiva = vertiendo)
          return (num(h, ENERGY.sensors.grid) ?? 0) < -0.05;
        default:
          return false;
      }
    }
  }
}

/** ¿Es un aviso (fuga, puerta abierta, persona en cámara)? El marcador se pinta en ámbar. */
export function itemAlert(h: HomeAssistant | undefined, it: LayerItem): boolean {
  if (it.kind === "row") return (it.row === "leak" || it.row === "door") && isOn(h, it.entity);
  if (it.kind === "device") {
    const d = it.device;
    if (d.type === "cameras") return d.cameras.some((c) => isOn(h, c.person));
    if (d.type === "gates") return d.gates.some((g) => isOn(h, g.entity));
  }
  return false;
}

/** Texto corto del estado de una fila. */
export function rowState(h: HomeAssistant | undefined, it: LayerItem & { kind: "row" }): string {
  const e = st(h, it.entity);
  if (!e || e.state === "unavailable") return "Sin conexión";
  switch (it.row) {
    case "climate": {
      const hum = num(h, it.second);
      return `${fmt(num(h, it.entity), 1)}°${hum !== undefined ? ` · ${fmt(hum, 0)} %` : ""}`;
    }
    case "door":
      return e.state === "on" ? "Abierta" : "Cerrada";
    case "leak":
      return e.state === "on" ? "¡Agua!" : "Seco";
    case "alarm":
      return ALARM_ES[e.state] ?? e.state;
  }
}
