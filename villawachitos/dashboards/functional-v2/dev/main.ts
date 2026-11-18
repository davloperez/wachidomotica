import "../src/index";
import config from "../dashboard.config.json";
import type { DashboardConfig, HomeAssistant } from "../src/types";
import { createMockHass } from "./mock-hass";

const el = document.querySelector("functional-v2")!;
el.setConfig(config as DashboardConfig);

let haDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const params = new URLSearchParams(location.search);
if (params.has("dark")) haDark = true;
if (params.has("light")) haDark = false;
const darkLabel = document.getElementById("ha-dark")!;
const modeLabel = document.getElementById("mode")!;
darkLabel.textContent = haDark ? "on" : "off";
document.getElementById("toggle-ha-dark")!.addEventListener("click", () => {
  haDark = !haDark;
  darkLabel.textContent = haDark ? "on" : "off";
  window.dispatchEvent(new Event("fv2-dev-refresh"));
});

const onUpdate = (hass: HomeAssistant) => (el.hass = hass);
const startMock = () => createMockHass(() => haDark, onUpdate);

if (__DEV_HA_URL__ && __DEV_HA_TOKEN__ && !params.has("mock")) {
  modeLabel.textContent = `● LIVE ${__DEV_HA_URL__}`;
  import("./live-hass")
    .then(({ createLiveHass }) => createLiveHass(__DEV_HA_URL__, __DEV_HA_TOKEN__, () => haDark, onUpdate))
    .catch((err) => {
      console.error("No se pudo conectar con Home Assistant, usando datos simulados", err);
      modeLabel.textContent = "● MOCK (fallo de conexión)";
      startMock();
    });
} else {
  modeLabel.textContent = "● MOCK";
  startMock();
}

document
  .getElementById("ring")!
  .addEventListener("click", () => window.dispatchEvent(new Event("fv2-dev-ring")));
document
  .getElementById("leak")!
  .addEventListener("click", () => window.dispatchEvent(new Event("fv2-dev-leak")));
