/**
 * Avisos de la vista general, calculados en el panel a partir del estado actual:
 * alarma, fugas de agua, puertas abiertas, frigorífico, electrodomésticos, batería,
 * averías (`binary_sensor` de clase `problem`) y dispositivos del panel sin conexión.
 */
import type { HomeAssistant } from "../types";
import { EXTRA_LEAKS, FRIDGE, ROOMS_DEF, ENERGY, ROOM_BY_ID } from "../house/rooms";
import { isOn, isUnavailable, num, st } from "./ha";

export type Level = "bad" | "warn" | "info";

export interface Alert {
  level: Level;
  title: string;
  detail?: string;
  room?: string;
  since?: string;
}

/** `binary_sensor` de avería que no son relevantes en el panel. */
const IGNORE = [/connectif/, /cpu_vulnerabilities/];

export function computeAlerts(hass: HomeAssistant | undefined, alarm?: string): Alert[] {
  if (!hass) return [];
  const out: Alert[] = [];
  const a = st(hass, alarm);
  if (a?.state === "triggered") out.push({ level: "bad", title: "Alarma disparada", since: a.last_changed });
  else if (a?.state === "pending")
    out.push({ level: "bad", title: "Prealarma: desconecta si es una falsa alarma", since: a.last_changed });

  // Fugas de agua
  const leaks = [
    ...ROOMS_DEF.flatMap((r) => (r.leaks ?? []).map((l) => [l, r.id] as const)),
    ...EXTRA_LEAKS.map((l) => [l, undefined] as const),
  ];
  for (const [id, room] of leaks)
    if (isOn(hass, id))
      out.push({
        level: "bad",
        title: "Fuga de agua",
        detail: friendly(hass, id),
        room,
        since: st(hass, id)?.last_changed,
      });

  // Puertas
  for (const r of ROOMS_DEF)
    for (const d of r.doors ?? [])
      if (isOn(hass, d.entity))
        out.push({
          level: "warn",
          title: `${d.name} abierta`,
          room: r.id,
          since: st(hass, d.entity)?.last_changed,
        });
  for (const r of ROOMS_DEF)
    for (const dev of r.devices)
      if (dev.type === "gates")
        for (const g of dev.gates)
          if (isOn(hass, g.entity))
            out.push({
              level: "info",
              title: `Puerta ${g.name.toLowerCase()} abierta`,
              room: r.id,
              since: st(hass, g.entity)?.last_changed,
            });

  // Frigorífico
  if (isOn(hass, FRIDGE.sensors.door))
    out.push({
      level: "warn",
      title: "Puerta del frigorífico abierta",
      room: "cocina",
      since: st(hass, FRIDGE.sensors.door)?.last_changed,
    });
  const fridgeT = num(hass, FRIDGE.sensors.fridge);
  if (fridgeT !== undefined && fridgeT > 9)
    out.push({ level: "warn", title: `Frigorífico a ${fridgeT}°`, room: "cocina" });

  // Electrodomésticos
  for (const r of ROOMS_DEF)
    for (const dev of r.devices) {
      if (dev.type === "dishwasher") {
        for (const [id, what] of [
          [dev.salt, "sal"],
          [dev.rinse, "abrillantador"],
        ] as const)
          if (["on", "present", "true"].includes(st(hass, id)?.state ?? ""))
            out.push({ level: "info", title: `Lavavajillas: falta ${what}`, room: r.id });
        if (st(hass, dev.state)?.state?.toLowerCase() === "finished")
          out.push({
            level: "info",
            title: "Lavavajillas terminado",
            room: r.id,
            since: st(hass, dev.state)?.last_changed,
          });
      }
      if (dev.type === "washer" && st(hass, dev.status)?.state === "Terminada")
        out.push({
          level: "info",
          title: "Lavadora terminada: tender la ropa",
          room: r.id,
          since: st(hass, dev.running)?.last_changed,
        });
      if (dev.type === "litter") {
        if (isOn(hass, dev.full)) out.push({ level: "warn", title: "Arenero: cubo lleno", room: r.id });
        else if (isOn(hass, dev.clean))
          out.push({ level: "info", title: "Arenero: necesita limpieza", room: r.id });
      }
    }

  // Batería de la casa
  const soc = num(hass, ENERGY.sensors.soc);
  if (soc !== undefined && soc < 15)
    out.push({ level: "warn", title: `Batería solar al ${Math.round(soc)} %`, room: "lavadero" });

  // Averías y mantenimiento
  for (const e of Object.values(hass.states)) {
    if (
      !e.entity_id.startsWith("binary_sensor.") ||
      e.attributes.device_class !== "problem" ||
      e.state !== "on"
    )
      continue;
    if (IGNORE.some((re) => re.test(e.entity_id))) continue;
    const id = e.entity_id;
    if (id.includes("arenero")) continue; // ya tratado arriba
    out.push({
      level: id.includes("frigo") || id.includes("aidoo") ? "warn" : "info",
      title: friendly(hass, id),
      room: id.includes("frigo")
        ? "cocina"
        : id.includes("limpiasuelos")
          ? "salon"
          : id.includes("aidoo")
            ? "salon"
            : undefined,
      since: e.last_changed,
    });
  }

  // Dispositivos del panel sin conexión
  const offline = new Set<string>();
  for (const r of ROOMS_DEF) {
    for (const l of r.lights) if (isUnavailable(st(hass, l.entity))) offline.add(l.entity);
    for (const c of r.covers) if (isUnavailable(st(hass, c.entity))) offline.add(c.entity);
  }
  if (offline.size)
    out.push({
      level: "info",
      title: `${offline.size} dispositivo${offline.size > 1 ? "s" : ""} sin conexión`,
      detail:
        [...offline]
          .map((id) => friendly(hass, id))
          .slice(0, 3)
          .join(", ") + (offline.size > 3 ? "…" : ""),
    });

  const order: Record<Level, number> = { bad: 0, warn: 1, info: 2 };
  return out.sort((x, y) => order[x.level] - order[y.level]);
}

function friendly(hass: HomeAssistant, id: string): string {
  const name = hass.states[id]?.attributes.friendly_name;
  return typeof name === "string" ? name : id;
}

export function roomName(id?: string): string | undefined {
  return id ? ROOM_BY_ID.get(id)?.name : undefined;
}
