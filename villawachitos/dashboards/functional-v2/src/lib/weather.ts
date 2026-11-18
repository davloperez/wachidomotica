/**
 * Previsión meteorológica de una entidad `weather.*` (se suscribe a `weather/subscribe_forecast`) y
 * avisos meteorológicos (AEMET / Meteoalarm) leídos de sensores del propio Home Assistant.
 */
import type { HomeAssistant } from "../types";
import { st } from "./ha";

export interface Forecast {
  datetime: string;
  condition?: string;
  temperature?: number;
  templow?: number;
  precipitation?: number;
  precipitation_probability?: number;
  wind_speed?: number;
}

export type ForecastType = "daily" | "hourly";

/** Se suscribe a la previsión; devuelve la función para cancelar (o undefined si no hay soporte). */
export async function subscribeForecast(
  hass: HomeAssistant,
  entity: string,
  type: ForecastType,
  cb: (list: Forecast[]) => void,
): Promise<(() => void) | undefined> {
  try {
    const off = await hass.connection.subscribeMessage<{ forecast: Forecast[] | null }>(
      (msg) => cb(msg.forecast ?? []),
      { type: "weather/subscribe_forecast", forecast_type: type, entity_id: entity },
    );
    return () => void off().catch(() => {});
  } catch (err) {
    console.warn(`[functional-v2] previsión ${type}`, err);
    return undefined;
  }
}

export interface WeatherAlert {
  level: "bad" | "warn" | "info";
  title: string;
  detail?: string;
  since?: string;
}

const NAMES: Record<string, string> = {
  wind: "Viento",
  "snow-ice": "Nieve o hielo",
  thunderstorm: "Tormentas",
  fog: "Niebla",
  "extreme-high-temperature": "Temperaturas altas",
  "extreme-low-temperature": "Temperaturas bajas",
  "coastal-event": "Fenómenos costeros",
  "forest-fire": "Riesgo de incendio",
  avalanches: "Aludes",
  rain: "Lluvia",
  flooding: "Inundaciones",
  "rain-flood": "Lluvia e inundaciones",
};

/**
 * Avisos activos de las entidades indicadas (por defecto, cualquier `binary_sensor` con «meteoalarm» o «aemet» en
 * el id). Se entiende el formato de Meteoalarm (`awareness_level` = «2; yellow; Moderate», `awareness_type`,
 * `headline`, `description`), que publica los avisos de la AEMET para España.
 */
export function weatherAlerts(hass: HomeAssistant | undefined, entities?: string[]): WeatherAlert[] {
  if (!hass) return [];
  const ids = entities?.length
    ? entities
    : Object.keys(hass.states).filter((id) => id.startsWith("binary_sensor.") && /meteoalarm|aemet/.test(id));
  const out: WeatherAlert[] = [];
  for (const id of ids) {
    const e = st(hass, id);
    if (!e || e.state !== "on") continue;
    const a = e.attributes as Record<string, unknown>;
    const lvl = String(a.awareness_level ?? a.severity ?? "").toLowerCase();
    const level = /red|rojo|extreme/.test(lvl) ? "bad" : /orange|naranja|severe/.test(lvl) ? "warn" : "info";
    const color = /red|rojo/.test(lvl) ? "rojo" : /orange|naranja/.test(lvl) ? "naranja" : /yellow|amarillo/.test(lvl) ? "amarillo" : "";
    const type = String(a.awareness_type ?? "").split(";").pop()?.trim().toLowerCase() ?? "";
    const what = NAMES[type] ?? String(a.event ?? a.headline ?? e.attributes.friendly_name ?? "Aviso meteorológico");
    out.push({
      level,
      title: `Aviso ${color ? color + " " : ""}por ${what.charAt(0).toLowerCase() + what.slice(1)}`,
      detail: typeof a.description === "string" ? a.description.slice(0, 120) : undefined,
      since: e.last_changed,
    });
  }
  return out;
}
