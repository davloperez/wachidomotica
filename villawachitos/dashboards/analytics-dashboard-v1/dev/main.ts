import "../src/index";
import config from "../dashboard.config.json";
import type { DashboardConfig, HomeAssistant } from "../src/types";
import { createMockHass } from "./mock-hass";

const el = document.querySelector("analytics-dashboard-v1")!;
el.setConfig(config as DashboardConfig);

// Simula el "modo oscuro" de Home Assistant (en modo auto el dashboard lo sigue).
let haDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const darkLabel = document.getElementById("ha-dark")!;
const modeLabel = document.getElementById("mode")!;
darkLabel.textContent = haDark ? "on" : "off";
document.getElementById("toggle-ha-dark")!.addEventListener("click", () => {
  haDark = !haDark;
  darkLabel.textContent = haDark ? "on" : "off";
  window.dispatchEvent(new Event("adv1-dev-refresh"));
});

const onUpdate = (hass: HomeAssistant) => (el.hass = hass);

const forceMock = new URLSearchParams(location.search).has("mock");
if (__DEV_HA_URL__ && __DEV_HA_TOKEN__ && !forceMock) {
  modeLabel.textContent = `● LIVE ${__DEV_HA_URL__}`;
  import("./live-hass")
    .then(({ createLiveHass }) => createLiveHass(__DEV_HA_URL__, __DEV_HA_TOKEN__, () => haDark, onUpdate))
    .catch((err) => {
      console.error("No se pudo conectar con Home Assistant, usando datos simulados", err);
      modeLabel.textContent = "● MOCK (fallo de conexión)";
      createMockHass(() => haDark, onUpdate);
    });
} else {
  modeLabel.textContent = "● MOCK";
  createMockHass(() => haDark, onUpdate);
}
