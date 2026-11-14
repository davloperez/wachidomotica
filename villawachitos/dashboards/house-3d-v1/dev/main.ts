import "../src/index";
import config from "../dashboard.config.json";
import type { DashboardConfig, HomeAssistant } from "../src/types";
import { createMockHass } from "./mock-hass";

const el = document.querySelector("house-3d-v1")!;
el.setConfig(config as DashboardConfig);

let haDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const darkLabel = document.getElementById("ha-dark")!;
const modeLabel = document.getElementById("mode")!;
const sunInput = document.getElementById("sun") as HTMLInputElement;
darkLabel.textContent = haDark ? "on" : "off";
document.getElementById("toggle-ha-dark")!.addEventListener("click", () => {
  haDark = !haDark;
  darkLabel.textContent = haDark ? "on" : "off";
  window.dispatchEvent(new Event("adv1-dev-refresh"));
  window.dispatchEvent(new Event("h3d-dev-refresh"));
});
sunInput.addEventListener("input", () => window.dispatchEvent(new Event("h3d-dev-refresh")));

const onUpdate = (hass: HomeAssistant) => (el.hass = hass);
const startMock = () => {
  createMockHass(
    () => haDark,
    () => Number(sunInput.value),
    onUpdate,
  );
};

const forceMock = new URLSearchParams(location.search).has("mock");
if (__DEV_HA_URL__ && __DEV_HA_TOKEN__ && !forceMock) {
  modeLabel.textContent = `● LIVE ${__DEV_HA_URL__}`;
  sunInput.parentElement!.remove();
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
