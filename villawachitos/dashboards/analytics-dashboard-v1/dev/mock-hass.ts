import type { HassEntity, HomeAssistant } from "../src/types";

/**
 * `hass` simulado para poder diseñar sin conexión a Home Assistant.
 * Genera estados verosímiles y los va cambiando para ver las animaciones.
 */
const now = () => new Date().toISOString();

function entity(entity_id: string, state: string, attributes: Record<string, unknown> = {}): HassEntity {
  return { entity_id, state, attributes, last_changed: now(), last_updated: now() };
}

function buildStates(): Record<string, HassEntity> {
  const s: Record<string, HassEntity> = {};
  const add = (e: HassEntity) => (s[e.entity_id] = e);
  const day = 86_400_000;
  const t = Date.now();
  const hour = new Date().getHours();
  const isDay = hour >= 8 && hour < 18;

  add(
    entity("weather.forecast_casa", isDay ? "partlycloudy" : "clear-night", {
      friendly_name: "Casa",
      temperature: 17.4,
      temperature_unit: "°C",
      humidity: 62,
      wind_speed: 11,
      wind_speed_unit: "km/h",
    }),
  );
  const rise = new Date();
  rise.setHours(7, 52, 0, 0);
  const set = new Date();
  set.setHours(18, 2, 0, 0);
  add(
    entity("sun.sun", isDay ? "above_horizon" : "below_horizon", {
      next_rising: new Date(rise.getTime() + (t > rise.getTime() ? day : 0)).toISOString(),
      next_setting: new Date(set.getTime() + (t > set.getTime() ? day : 0)).toISOString(),
      elevation: isDay ? 24.6 : -31.2,
    }),
  );
  add(entity("alarm_control_panel.alarma_vivienda", "disarmed", { friendly_name: "Alarma vivienda" }));
  add(
    entity("climate.aidoo_28_cc_ff_82_82_6f", "heat", {
      friendly_name: "Climatizador Aire",
      current_temperature: 21.8,
      temperature: 22.5,
    }),
  );
  add(entity("sensor.shelly_salon_sur_temperatura", "21.6", { unit_of_measurement: "°C" }));
  add(entity("sensor.shelly_salon_sur_humedad", "48", { unit_of_measurement: "%" }));
  for (let i = 0; i < 54; i++) add(entity(`light.mock_${i}`, Math.random() < 0.15 ? "on" : "off"));
  for (let i = 0; i < 9; i++) add(entity(`cover.mock_${i}`, i < 6 ? "open" : "closed"));
  add(entity("person.david", "home"));
  add(entity("person.inma", "not_home"));
  for (let i = 0; i < 1600; i++)
    add(entity(`sensor.filler_${i}`, Math.random() < 0.05 ? "unavailable" : "1"));
  return s;
}

function series(hours: number, base: number, amp: number, noise: number) {
  const out: { start: number; mean: number }[] = [];
  const end = Date.now();
  for (let t = end - hours * 3600_000; t <= end; t += 300_000) {
    const h = new Date(t).getHours() + new Date(t).getMinutes() / 60;
    out.push({
      start: t,
      mean: base + amp * Math.sin(((h - 9) / 24) * 2 * Math.PI) + (Math.random() - 0.5) * noise,
    });
  }
  return out;
}

export function createMockHass(getDarkMode: () => boolean, onUpdate: (hass: HomeAssistant) => void): void {
  let states = buildStates();

  const emit = () =>
    onUpdate({
      states,
      connected: true,
      language: "es",
      locale: { language: "es" },
      themes: { darkMode: getDarkMode() },
      connection: {
        async subscribeMessage(cb, msg) {
          if (msg.type === "weather/subscribe_forecast") {
            const conds = ["partlycloudy", "cloudy", "rainy", "sunny", "partlycloudy", "clear-night"];
            const start = new Date();
            start.setMinutes(0, 0, 0);
            cb({
              forecast: Array.from({ length: 12 }, (_, i) => ({
                datetime: new Date(start.getTime() + (i + 1) * 3600_000).toISOString(),
                condition: conds[i % conds.length],
                temperature: 17 - i * 0.4 + Math.random(),
                precipitation_probability: i % 3 === 2 ? 30 + i * 3 : 0,
              })),
            } as never);
          }
          return async () => {};
        },
      },
      async callWS<T>(msg: Record<string, unknown>): Promise<T> {
        if (msg.type === "recorder/statistics_during_period") {
          return {
            "sensor.shelly_salon_sur_temperatura": series(24, 21, 1.6, 0.25),
            "sensor.shelly_salon_sur_humedad": series(24, 50, -6, 1.5),
          } as T;
        }
        throw new Error(`mock: ${String(msg.type)} no implementado`);
      },
      async callService() {
        return undefined;
      },
    });

  // Cambios aleatorios para ver las animaciones de los valores.
  window.setInterval(() => {
    const id = `light.mock_${Math.floor(Math.random() * 54)}`;
    states = { ...states, [id]: { ...states[id], state: states[id].state === "on" ? "off" : "on" } };
    emit();
  }, 4000);

  window.addEventListener("adv1-dev-refresh", emit);
  emit();
}
