/**
 * Analytics Dashboard v1 — punto de entrada del módulo que carga Home Assistant.
 * Registra el elemento <analytics-dashboard-v1> como tarjeta Lovelace
 * (`type: custom:analytics-dashboard-v1`), pensada para una vista `panel` a pantalla completa.
 */
import { ensureFonts } from "./styles/fonts";
import "./analytics-dashboard";

ensureFonts();

declare global {
  interface Window {
    customCards?: { type: string; name: string; description: string; preview?: boolean }[];
  }
}

window.customCards = window.customCards ?? [];
if (!window.customCards.some((c) => c.type === "analytics-dashboard-v1")) {
  window.customCards.push({
    type: "analytics-dashboard-v1",
    name: "Analytics Dashboard v1",
    description: "Dashboard HUD a pantalla completa para wallpanel (tema claro/oscuro).",
  });
}

console.info(
  `%c ANALYTICS-DASHBOARD %c v${__APP_VERSION__} `,
  "background:#35e8ff;color:#04060c;font-weight:700;padding:2px 6px;border-radius:4px 0 0 4px",
  "background:#04060c;color:#35e8ff;padding:2px 6px;border-radius:0 4px 4px 0",
);
