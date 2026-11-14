import type { HomeAssistant } from "../types";

export interface ForecastItem {
  datetime: string;
  condition?: string;
  temperature?: number;
  precipitation_probability?: number;
}

/**
 * Suscripción a la previsión horaria de una entidad weather.
 * Devuelve la función para cancelar la suscripción.
 */
export function subscribeForecast(
  hass: HomeAssistant,
  entityId: string,
  onData: (items: ForecastItem[]) => void,
): Promise<() => Promise<void>> {
  return hass.connection.subscribeMessage<{ forecast: ForecastItem[] | null }>(
    (msg) => onData(msg.forecast ?? []),
    { type: "weather/subscribe_forecast", forecast_type: "hourly", entity_id: entityId },
  );
}
