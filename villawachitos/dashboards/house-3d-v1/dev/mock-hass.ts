import type { HassEntity, HomeAssistant } from "../src/types";
import { ENERGY, GATES, LAMPS, PUMP, TV, WALLS } from "../src/scene/plan";

/**
 * `hass` simulado: usa las entidades del plano, enciende algunas luces al azar
 * y va moviendo persianas para ver la animación.
 */
const now = () => new Date().toISOString();
const entity = (entity_id: string, state: string, attributes: HassEntity["attributes"] = {}): HassEntity => ({
  entity_id,
  state,
  attributes,
  last_changed: now(),
  last_updated: now(),
});

const COLORS: [number, number, number][] = [
  [255, 180, 110],
  [255, 214, 170],
  [120, 170, 255],
  [255, 90, 200],
  [255, 200, 140],
];

export function createMockHass(getDarkMode: () => boolean, onUpdate: (hass: HomeAssistant) => void): void {
  const states: Record<string, HassEntity> = {};
  for (const l of LAMPS) {
    const on = Math.random() < 0.45;
    // Capacidades parecidas a las reales: tiras WLED en RGBW con efectos, lámparas regulables, resto on/off.
    const modes = l.kind === "strip" ? ["rgbw"] : l.kind === "lamp" ? ["color_temp", "hs"] : ["onoff"];
    states[l.entity] = entity(l.entity, on ? "on" : "off", {
      friendly_name: l.entity.replace("light.", "").replaceAll("_", " "),
      supported_color_modes: modes,
      color_mode: on ? modes[modes.length - 1] : null,
      ...(l.kind === "strip"
        ? { effect_list: ["Solid", "Rainbow", "Breathe", "Fire 2012"], effect: "Solid" }
        : {}),
      ...(l.kind === "lamp"
        ? { min_color_temp_kelvin: 2700, max_color_temp_kelvin: 6500, color_temp_kelvin: 3000 }
        : {}),
      brightness: modes[0] === "onoff" ? null : Math.round(80 + Math.random() * 175),
      rgb_color: l.kind === "strip" ? COLORS[Math.floor(Math.random() * COLORS.length)] : [255, 196, 137],
    });
  }
  const covers = WALLS.flatMap((w) => w.openings ?? [])
    .map((o) => o.cover)
    .filter((c): c is string => !!c);
  for (const c of covers) {
    const pos = [0, 30, 60, 100][Math.floor(Math.random() * 4)];
    states[c] = entity(c, pos === 0 ? "closed" : "open", coverAttrs(c, pos));
  }

  states[PUMP.entity] = entity(PUMP.entity, "on", { friendly_name: "Interruptor depuradora" });
  const solar: Record<string, string> = {
    [ENERGY.sensors.pv]: "4.9",
    [ENERGY.sensors.soc]: "82",
    [ENERGY.sensors.battery]: "4.3",
    [ENERGY.sensors.load]: "0.6",
    [ENERGY.sensors.grid]: "0.0",
  };
  for (const [id, v] of Object.entries(solar)) states[id] = entity(id, v);
  states[PUMP.power] = entity(PUMP.power, "742", { unit_of_measurement: "W" });

  states[TV.entity] = entity(TV.entity, "off", {
    friendly_name: "TV Samsung Salón 85",
    device_class: "tv",
    supported_features: 24381,
    source_list: ["TV", "HDMI"],
  });
  states["remote.salon_tv_samsung_salon_85"] = entity("remote.salon_tv_samsung_salon_85", "off");

  for (const g of GATES) states[g.entity] = entity(g.entity, Math.random() < 0.5 ? "on" : "off");
  states["light.luz_piscina"] = entity("light.luz_piscina", "on", {
    friendly_name: "Luz piscina",
    supported_color_modes: ["hs", "white"],
    color_mode: "hs",
    brightness: 230,
    hs_color: [218, 84],
    rgb_color: [40, 120, 255],
  });

  const emit = () => {
    states["weather.forecast_casa"] = entity("weather.forecast_casa", "partlycloudy", { cloud_coverage: 20 });
    onUpdate({
      states: { ...states },
      connected: true,
      language: "es",
      themes: { darkMode: getDarkMode() },
      connection: { subscribeMessage: async () => async () => {} },
      callWS: async () => {
        throw new Error("mock");
      },
      callService: async (domain, service, data) => {
        mockService(states, domain, service, data ?? {});
        emit();
      },
    });
  };

  // Cada pocos segundos: abrir o cerrar una puerta de vehículos (las luces y persianas se tocan a mano).
  window.setInterval(() => {
    const g = GATES[Math.floor(Math.random() * GATES.length)].entity;
    states[g] = entity(g, states[g].state === "on" ? "off" : "on");
    emit();
  }, 25_000);

  window.addEventListener("h3d-dev-refresh", emit);
  emit();
}

function coverAttrs(id: string, pos: number): HassEntity["attributes"] {
  return {
    friendly_name: id.replace("cover.", "").replaceAll("_", " "),
    current_position: pos,
    supported_features: 15,
    device_class: "blind",
  };
}

/** Aplica en el estado simulado lo que haría Home Assistant con cada servicio. */
function mockService(
  states: Record<string, HassEntity>,
  domain: string,
  service: string,
  data: Record<string, unknown>,
): void {
  const id = data.entity_id as string;
  const st = states[id];
  if (!st) return;
  const a = { ...st.attributes };
  let state = st.state;
  if (domain === "light") {
    if (service === "toggle") state = state === "on" ? "off" : "on";
    if (service === "turn_off") state = "off";
    if (service === "turn_on") {
      state = "on";
      if (typeof data.brightness_pct === "number")
        a.brightness = Math.round((data.brightness_pct / 100) * 255);
      if (Array.isArray(data.hs_color)) {
        const [h, s] = data.hs_color as [number, number];
        a.hs_color = [h, s];
        a.rgb_color = hsToRgb(h, s);
        a.color_mode = "hs";
      }
      if (typeof data.color_temp_kelvin === "number") {
        a.color_temp_kelvin = data.color_temp_kelvin;
        a.color_mode = "color_temp";
        a.rgb_color = [
          255,
          196 + Math.round((data.color_temp_kelvin - 2700) / 60),
          137 + Math.round((data.color_temp_kelvin - 2700) / 32),
        ].map((v) => Math.min(255, v)) as [number, number, number];
      }
      if (data.white) {
        a.color_mode = "white";
        a.rgb_color = [255, 255, 255];
      }
      if (typeof data.effect === "string") a.effect = data.effect;
    }
  }
  if (domain === "remote" && service === "turn_on" && states[TV.entity]) {
    states[TV.entity] = entity(TV.entity, "on", {
      ...states[TV.entity].attributes,
      source: "TV",
      volume_level: 0.18,
    });
  }
  if (domain === "media_player") {
    if (service === "turn_off") state = "off";
    if (service === "turn_on") state = "on";
    if (service === "volume_set") a.volume_level = data.volume_level;
    if (service === "volume_mute") a.is_volume_muted = data.is_volume_muted;
    if (service === "select_source") a.source = data.source;
    if (service === "volume_up" || service === "volume_down") {
      const v = typeof a.volume_level === "number" ? a.volume_level : 0.2;
      a.volume_level = Math.min(1, Math.max(0, v + (service === "volume_up" ? 0.02 : -0.02)));
    }
  }
  if (domain === "switch") {
    state = service === "toggle" ? (state === "on" ? "off" : "on") : service === "turn_on" ? "on" : "off";
    const power = id === PUMP.entity ? PUMP.power : undefined;
    if (power) states[power] = entity(power, state === "on" ? "742" : "0", { unit_of_measurement: "W" });
  }
  if (domain === "cover") {
    const pos =
      service === "open_cover"
        ? 100
        : service === "close_cover"
          ? 0
          : service === "set_cover_position"
            ? (data.position as number)
            : undefined;
    if (pos !== undefined) {
      a.current_position = pos;
      state = pos === 0 ? "closed" : "open";
    }
  }
  states[id] = entity(id, state, a);
}

function hsToRgb(h: number, s: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (1 - (s / 100) * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return [f(5), f(3), f(1)];
}
