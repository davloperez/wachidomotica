/**
 * Las reglas @font-face no funcionan de forma fiable dentro de un Shadow DOM,
 * así que se inyectan una sola vez en el <head> del documento. Los archivos woff2
 * van embebidos en el bundle (data URI) para que el wallpanel no dependa de internet.
 */
import spaceGrotesk from "@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2?inline";
import orbitron500 from "@fontsource/orbitron/files/orbitron-latin-500-normal.woff2?inline";
import orbitron700 from "@fontsource/orbitron/files/orbitron-latin-700-normal.woff2?inline";

const STYLE_ID = "h3d-fonts";

export function ensureFonts(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @font-face {
      font-family: "ADV1 Grotesk";
      font-style: normal;
      font-display: swap;
      font-weight: 300 700;
      src: url(${spaceGrotesk}) format("woff2-variations");
    }
    @font-face {
      font-family: "ADV1 Orbitron";
      font-style: normal;
      font-display: swap;
      font-weight: 500;
      src: url(${orbitron500}) format("woff2");
    }
    @font-face {
      font-family: "ADV1 Orbitron";
      font-style: normal;
      font-display: swap;
      font-weight: 700;
      src: url(${orbitron700}) format("woff2");
    }
  `;
  document.head.appendChild(style);
}
