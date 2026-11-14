import { html, svg } from "lit";
import type { HassEntity, HomeAssistant } from "../types";

export const icon = (path: string) =>
  html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d=${path}></path></svg>`;
export const svgIcon = (path: string) => svg`<path d=${path}></path>`;

export const OFF_STATES = ["off", "unavailable", "unknown", "closed", "standby", "idle", "docked"];

export function st(hass: HomeAssistant | undefined, id: string | undefined): HassEntity | undefined {
  return id ? hass?.states[id] : undefined;
}

export function isOn(hass: HomeAssistant | undefined, id: string | undefined): boolean {
  return st(hass, id)?.state === "on";
}

export function isUnavailable(e: HassEntity | undefined): boolean {
  return !e || e.state === "unavailable" || e.state === "unknown";
}

/** Valor numérico del estado (undefined si no es un número). */
export function num(hass: HomeAssistant | undefined, id: string | undefined): number | undefined {
  const s = st(hass, id)?.state;
  if (s === undefined || s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function fmt(n: number | undefined, digits = 1, lang = "es"): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Brillo de una luz en % (0 si está apagada). */
export function brightnessPct(e: HassEntity | undefined): number {
  if (!e || e.state !== "on") return 0;
  const b = e.attributes.brightness;
  return typeof b === "number" ? Math.max(1, Math.round((b / 255) * 100)) : 100;
}

export function isDimmable(e: HassEntity | undefined): boolean {
  const modes = (e?.attributes.supported_color_modes as string[] | undefined) ?? [];
  return modes.some((m) => m !== "onoff");
}

/** Color CSS aproximado de una luz encendida (para los brillos y miniaturas). */
export function lightColor(e: HassEntity | undefined): string {
  const rgb = e?.attributes.rgb_color as [number, number, number] | undefined;
  if (e?.state === "on" && rgb) return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  return "var(--amber)";
}

export async function call(
  hass: HomeAssistant | undefined,
  domain: string,
  service: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (!hass) return;
  try {
    await hass.callService(domain, service, data);
  } catch (err) {
    console.error("[functional-v1]", domain, service, data, err);
  }
}

/** Abre el diálogo nativo "más información" de Home Assistant. */
export function moreInfo(el: HTMLElement, entityId: string): void {
  el.dispatchEvent(
    new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }),
  );
}

export function relTime(iso: string | undefined, now = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const m = Math.round((now - t) / 60_000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

export const WEATHER_ES: Record<string, string> = {
  "clear-night": "Despejado",
  cloudy: "Nublado",
  exceptional: "Excepcional",
  fog: "Niebla",
  hail: "Granizo",
  lightning: "Tormenta",
  "lightning-rainy": "Tormenta",
  partlycloudy: "Parcialmente nublado",
  pouring: "Lluvia intensa",
  rainy: "Lluvia",
  snowy: "Nieve",
  "snowy-rainy": "Aguanieve",
  sunny: "Soleado",
  windy: "Viento",
  "windy-variant": "Viento",
};

export const ALARM_ES: Record<string, string> = {
  disarmed: "Desconectada",
  armed_home: "En casa",
  armed_away: "Conectada",
  armed_night: "Noche",
  armed_vacation: "Vacaciones",
  armed_custom_bypass: "Personalizada",
  pending: "Pendiente",
  arming: "Conectando…",
  disarming: "Desconectando…",
  triggered: "¡Disparada!",
  unavailable: "No disponible",
};

export const HVAC_ES: Record<string, string> = {
  off: "Apagado",
  heat: "Calor",
  cool: "Frío",
  heat_cool: "Auto",
  auto: "Auto",
  dry: "Seco",
  fan_only: "Ventilador",
};
