import "../src/index";
import config from "../dashboard.config.json";
import type { DashboardConfig, HomeAssistant } from "../src/types";
import { createMockHass } from "./mock-hass";

const el = document.querySelector("house-3d-v1")!;
el.setConfig(config as DashboardConfig);

let haDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const darkLabel = document.getElementById("ha-dark")!;
const modeLabel = document.getElementById("mode")!;
const timeInput = document.getElementById("time") as HTMLInputElement;
const timeLabel = document.getElementById("time-label")!;
darkLabel.textContent = haDark ? "on" : "off";
document.getElementById("toggle-ha-dark")!.addEventListener("click", () => {
  haDark = !haDark;
  darkLabel.textContent = haDark ? "on" : "off";
  window.dispatchEvent(new Event("adv1-dev-refresh"));
  window.dispatchEvent(new Event("h3d-dev-refresh"));
});

// Hora simulada para ver el recorrido del sol a lo largo de hoy (sin tocar Home Assistant).
const showNow = () => {
  const now = new Date();
  timeInput.value = String(now.getHours() * 60 + now.getMinutes());
  timeLabel.textContent = "ahora";
  el.simulatedTime = undefined;
};
timeInput.addEventListener("input", () => {
  const minutes = Number(timeInput.value);
  const d = new Date();
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  timeLabel.textContent = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  el.simulatedTime = d;
});
document.getElementById("now")!.addEventListener("click", showNow);
showNow();

const onUpdate = (hass: HomeAssistant) => (el.hass = hass);
const startMock = () => {
  createMockHass(() => haDark, onUpdate);
};

const forceMock = new URLSearchParams(location.search).has("mock");
if (__DEV_HA_URL__ && __DEV_HA_TOKEN__ && !forceMock) {
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
