import { css } from "lit";

/**
 * Sistema de diseño: todas las decisiones de color, tipografía y espaciado viven aquí
 * como variables CSS. El tema se aplica con el atributo `data-theme` en el host.
 */
export const tokens = css`
  :host {
    /* Tipografía */
    --font-ui: "ADV1 Grotesk", "Space Grotesk", system-ui, sans-serif;
    --font-hud: "ADV1 Orbitron", "Orbitron", var(--font-ui);

    /* Escala fluida pensada para 1280–2960 px de ancho en horizontal */
    --space-1: clamp(4px, 0.35vw, 8px);
    --space-2: clamp(8px, 0.7vw, 14px);
    --space-3: clamp(12px, 1.1vw, 22px);
    --space-4: clamp(16px, 1.6vw, 32px);
    --radius: clamp(14px, 1.3vw, 24px);

    --fs-label: clamp(10px, 0.78vw, 14px);
    --fs-small: clamp(12px, 0.95vw, 17px);
    --fs-body: clamp(14px, 1.15vw, 20px);
    --fs-kpi: clamp(32px, 3.6vw, 64px);
    --fs-clock: clamp(72px, 9.4vw, 176px);

    --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* ---------- DARK (por defecto) ---------- */
  :host,
  :host([data-theme="dark"]) {
    color-scheme: dark;
    --bg: #04060c;
    --bg-glow-1: rgba(0, 200, 255, 0.16);
    --bg-glow-2: rgba(140, 80, 255, 0.14);
    --bg-glow-3: rgba(0, 255, 170, 0.06);
    --grid-line: rgba(120, 180, 255, 0.055);

    --panel: rgba(14, 20, 36, 0.62);
    --panel-strong: rgba(18, 26, 46, 0.85);
    --panel-border: rgba(120, 190, 255, 0.14);
    --panel-highlight: rgba(140, 220, 255, 0.35);
    --panel-shadow: 0 20px 60px -20px rgba(0, 0, 0, 0.8);

    --text: #e8f1ff;
    --text-muted: rgba(200, 220, 255, 0.58);
    --text-faint: rgba(200, 220, 255, 0.32);

    --accent: #35e8ff;
    --accent-2: #a77bff;
    --accent-3: #4dffb5;
    --warn: #ffb547;
    --danger: #ff5c7a;
    --accent-glow: 0 0 18px rgba(53, 232, 255, 0.55);
    --chart-area-top: rgba(53, 232, 255, 0.35);
    --chart-area-2-top: rgba(167, 123, 255, 0.28);
  }

  /* ---------- LIGHT ---------- */
  :host([data-theme="light"]) {
    color-scheme: light;
    --bg: #eef2f9;
    --bg-glow-1: rgba(0, 150, 255, 0.16);
    --bg-glow-2: rgba(140, 80, 255, 0.12);
    --bg-glow-3: rgba(0, 200, 140, 0.08);
    --grid-line: rgba(20, 60, 140, 0.06);

    --panel: rgba(255, 255, 255, 0.66);
    --panel-strong: rgba(255, 255, 255, 0.9);
    --panel-border: rgba(30, 80, 160, 0.12);
    --panel-highlight: rgba(0, 120, 255, 0.35);
    --panel-shadow: 0 18px 50px -24px rgba(30, 60, 120, 0.35);

    --text: #0b1430;
    --text-muted: rgba(20, 35, 75, 0.62);
    --text-faint: rgba(20, 35, 75, 0.36);

    --accent: #0a84ff;
    --accent-2: #7a3cff;
    --accent-3: #00b37a;
    --warn: #e08a00;
    --danger: #e5294f;
    --accent-glow: 0 0 14px rgba(10, 132, 255, 0.35);
    --chart-area-top: rgba(10, 132, 255, 0.28);
    --chart-area-2-top: rgba(122, 60, 255, 0.2);
  }
`;
