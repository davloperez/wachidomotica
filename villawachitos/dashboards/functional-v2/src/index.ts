/**
 * Functional v2 — punto de entrada del módulo que carga Home Assistant.
 * Registra <functional-v2> como tarjeta Lovelace (`type: custom:functional-v2`),
 * pensada para una vista `panel` a pantalla completa en el panel de pared.
 */
import { ensureFonts } from "./styles/fonts";
import "./functional-dashboard";

ensureFonts();

declare global {
  interface Window {
    customCards?: { type: string; name: string; description: string }[];
  }
}

window.customCards = window.customCards ?? [];
if (!window.customCards.some((c) => c.type === "functional-v2")) {
  window.customCards.push({
    type: "functional-v2",
    name: "Functional v2",
    description: "Vista general de la casa con acceso a cada estancia, sus controles y gráficas.",
  });
}

console.info(
  `%c FUNCTIONAL %c v${__APP_VERSION__} `,
  "background:#74937b;color:#fff;font-weight:700;padding:2px 6px;border-radius:4px 0 0 4px",
  "background:#ebe4da;color:#2e2823;padding:2px 6px;border-radius:0 4px 4px 0",
);
