import type { HassEntity, HomeAssistant } from "../src/types";
import { LAMPS, WALLS } from "../src/scene/plan";

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

export function createMockHass(
  getDarkMode: () => boolean,
  getSunElevation: () => number,
  onUpdate: (hass: HomeAssistant) => void,
): void {
  const states: Record<string, HassEntity> = {};
  for (const l of LAMPS) {
    const on = Math.random() < 0.45;
    states[l.entity] = entity(l.entity, on ? "on" : "off", {
      brightness: Math.round(80 + Math.random() * 175),
      rgb_color: l.kind === "strip" ? COLORS[Math.floor(Math.random() * COLORS.length)] : [255, 196, 137],
    });
  }
  const covers = WALLS.flatMap((w) => w.openings ?? [])
    .map((o) => o.cover)
    .filter((c): c is string => !!c);
  for (const c of covers) {
    const pos = [0, 30, 60, 100][Math.floor(Math.random() * 4)];
    states[c] = entity(c, pos === 0 ? "closed" : "open", { current_position: pos });
  }

  const emit = () => {
    states["sun.sun"] = entity("sun.sun", getSunElevation() > 0 ? "above_horizon" : "below_horizon", {
      elevation: getSunElevation(),
      azimuth: 200,
    });
    onUpdate({
      states: { ...states },
      connected: true,
      language: "es",
      themes: { darkMode: getDarkMode() },
      connection: { subscribeMessage: async () => async () => {} },
      callWS: async () => {
        throw new Error("mock");
      },
      callService: async () => undefined,
    });
  };

  // Cada pocos segundos: mover una persiana y alternar una luz.
  window.setInterval(() => {
    const c = covers[Math.floor(Math.random() * covers.length)];
    const pos = [0, 25, 50, 75, 100][Math.floor(Math.random() * 5)];
    states[c] = entity(c, pos === 0 ? "closed" : "open", { current_position: pos });
    const l = LAMPS[Math.floor(Math.random() * LAMPS.length)].entity;
    states[l] = { ...states[l], state: states[l].state === "on" ? "off" : "on" };
    emit();
  }, 5000);

  window.addEventListener("h3d-dev-refresh", emit);
  emit();
}
