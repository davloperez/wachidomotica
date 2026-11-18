/**
 * Las reglas @font-face no funcionan de forma fiable dentro de un Shadow DOM,
 * así que se inyectan una sola vez en el <head> del documento. Los woff2 van embebidos
 * en el bundle (data URI) para que el panel de pared no dependa de internet.
 */
import manrope from "@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2?inline";
import fraunces from "@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2?inline";

const STYLE_ID = "fv2-fonts";

export function ensureFonts(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @font-face {
      font-family: "FV2 Manrope";
      font-style: normal;
      font-display: swap;
      font-weight: 200 800;
      src: url(${manrope}) format("woff2-variations");
    }
    @font-face {
      font-family: "FV2 Fraunces";
      font-style: normal;
      font-display: swap;
      font-weight: 100 900;
      src: url(${fraunces}) format("woff2-variations");
    }
  `;
  document.head.appendChild(style);
}
