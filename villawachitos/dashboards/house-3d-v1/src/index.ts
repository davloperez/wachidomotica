/**
 * House 3D v1 — punto de entrada del módulo que carga Home Assistant.
 * Registra <house-3d-v1> como tarjeta Lovelace (`type: custom:house-3d-v1`),
 * pensada para una vista `panel` a pantalla completa.
 */
import { ensureFonts } from "./styles/fonts";
import "./house-dashboard";

ensureFonts();

declare global {
  interface Window {
    customCards?: { type: string; name: string; description: string }[];
  }
}

window.customCards = window.customCards ?? [];
if (!window.customCards.some((c) => c.type === "house-3d-v1")) {
  window.customCards.push({
    type: "house-3d-v1",
    name: "House 3D v1",
    description: "Plano 3D interactivo de la vivienda con luces y persianas en tiempo real.",
  });
}

console.info(
  `%c HOUSE-3D %c v${__APP_VERSION__} `,
  "background:#a77bff;color:#04060c;font-weight:700;padding:2px 6px;border-radius:4px 0 0 4px",
  "background:#04060c;color:#a77bff;padding:2px 6px;border-radius:0 4px 4px 0",
);
