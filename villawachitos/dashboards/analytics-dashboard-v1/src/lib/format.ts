import type { HassEntity, HomeAssistant } from "../types";

export const locale = (hass?: HomeAssistant): string => hass?.locale?.language ?? hass?.language ?? "es";

export function num(entity: HassEntity | undefined): number | undefined {
  if (!entity) return undefined;
  const v = Number.parseFloat(entity.state);
  return Number.isFinite(v) ? v : undefined;
}

export function fmt(value: number | undefined, digits = 1, lang = "es"): string {
  if (value === undefined) return "—";
  return value.toLocaleString(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function time(date: Date, lang = "es"): string {
  return date.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit", hour12: false });
}

export const isUnavailable = (e?: HassEntity): boolean =>
  !e || e.state === "unavailable" || e.state === "unknown";

/** Las entidades de grupo (con atributo entity_id) se excluyen de los recuentos para no contar dos veces. */
export const isGroup = (e: HassEntity): boolean => Array.isArray(e.attributes.entity_id);

export function countDomain(
  hass: HomeAssistant,
  domain: string,
  isActive: (e: HassEntity) => boolean,
): { active: number; total: number } {
  let active = 0;
  let total = 0;
  for (const [id, e] of Object.entries(hass.states)) {
    if (!id.startsWith(`${domain}.`) || isUnavailable(e) || isGroup(e)) continue;
    total++;
    if (isActive(e)) active++;
  }
  return { active, total };
}

export const WEATHER_ES: Record<string, string> = {
  "clear-night": "Despejado",
  cloudy: "Nublado",
  exceptional: "Excepcional",
  fog: "Niebla",
  hail: "Granizo",
  lightning: "Tormenta",
  "lightning-rainy": "Tormenta y lluvia",
  partlycloudy: "Parcialmente nublado",
  pouring: "Lluvia intensa",
  rainy: "Lluvia",
  snowy: "Nieve",
  "snowy-rainy": "Aguanieve",
  sunny: "Soleado",
  windy: "Viento",
  "windy-variant": "Viento y nubes",
};

export const ALARM_ES: Record<string, string> = {
  disarmed: "Desarmada",
  armed_home: "Armada (casa)",
  armed_away: "Armada (fuera)",
  armed_night: "Armada (noche)",
  armed_vacation: "Armada (vacaciones)",
  armed_custom_bypass: "Armada (personalizada)",
  pending: "Pendiente",
  arming: "Armando…",
  disarming: "Desarmando…",
  triggered: "¡DISPARADA!",
};

export const HVAC_ES: Record<string, string> = {
  off: "Apagado",
  heat: "Calor",
  cool: "Frío",
  heat_cool: "Auto",
  auto: "Auto",
  dry: "Deshumidificar",
  fan_only: "Ventilador",
};
