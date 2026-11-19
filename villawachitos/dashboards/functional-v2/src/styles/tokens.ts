import { css } from "lit";

/**
 * Sistema de diseño: colores cálidos y tranquilos (lino, salvia, terracota, ámbar suave),
 * tarjetas opacas y tipografía Manrope + Fraunces. El tema se aplica con
 * `data-theme` en el host de la tarjeta; los componentes hijos heredan las variables.
 */
export const tokens = css`
  :host {
    --font-ui: "FV2 Manrope", "Manrope", system-ui, sans-serif;
    --font-display: "FV2 Fraunces", "Fraunces", Georgia, serif;

    --space-1: 6px;
    --space-2: 10px;
    --space-3: 14px;
    --space-4: 18px;
    --radius: 20px;
    --radius-sm: 14px;

    /* Letra grande también en pantallas pequeñas: nada por debajo de 13 px */
    --fs-label: clamp(13px, 0.35vw + 11px, 15px);
    --fs-small: clamp(14px, 0.4vw + 12px, 16px);
    --fs-body: clamp(16px, 0.4vw + 14px, 18px);
    --fs-title: clamp(19px, 0.6vw + 16px, 24px);
    --fs-kpi: clamp(30px, 1.2vw + 24px, 42px);
    --fs-hero: clamp(30px, 1.6vw + 24px, 46px);

    --col-w: 100%;
    --ease: cubic-bezier(0.22, 1, 0.36, 1);
    --ease-soft: cubic-bezier(0.45, 0, 0.2, 1);
    --zoom-ms: 450ms;
  }

  /*
   * Todos los colores son opacos: nada de transparencias ni desenfoques, que en las pantallas
   * de pared (Shelly Wall Display) obligan a recomponer capas y hacen que la interfaz vaya a saltos.
   * Los tonos "-soft" están ya mezclados sobre el color de las tarjetas.
   */

  /* ---------- CLARO (por defecto): lino cálido ---------- */
  :host,
  :host([data-theme="light"]) {
    color-scheme: light;
    --bg: #ebe4da;
    --bg-2: #f4efe8;
    --sky-top: #e4e7e3;
    --sky-bottom: #ebe4da;

    --glass: #faf6f0;
    --glass-strong: #fffcf7;
    --glass-border: #e2d9cc;
    --glass-edge: #e2d9cc;
    --glass-shadow: none;
    --chip: #efe8de;
    --chip-strong: #e4dbcf;

    --text: #2e2823;
    --text-muted: #6b6259;
    --text-faint: #9c9389;

    --sage: #6d8d74;
    --sage-soft: #e1e8dd;
    --terracotta: #b8714a;
    --terracotta-soft: #f0e0d3;
    --amber: #d9963a;
    --amber-soft: #f6e6cc;
    --sky: #5f8aa8;
    --sky-soft: #dfe8ee;
    --lilac: #8f7fae;
    --danger: #bf4f45;
    --danger-soft: #f3d9d3;

    --track: #e2d9cc;
    --grid-line: #ece5db;

    /* Plano 2D */
    --p-ground: #dfe3d2;
    --p-grass: #cdd7bb;
    --p-paving: #dcd5c9;
    --p-floor: #f6f1e9;
    --p-tile: #eeeae4;
    --p-stone: #ebe4d8;
    --p-lit: #f8e3b5;
    --p-wall: #85786b;
    --p-furniture: #e3d9cb;
    --p-furniture-line: #d4c8b8;
    --p-window: #8fb8cc;
    --p-water: #a7d1dc;
    --p-water-lit: #7fd0e6;
    --p-deck: #e8e1d5;
    --p-fence: #6f655c;
    --p-selected: #6d8d74;
  }

  /* ---------- OSCURO: espresso con brillo ámbar ---------- */
  :host([data-theme="dark"]) {
    color-scheme: dark;
    --bg: #1b1815;
    --bg-2: #24201c;
    --sky-top: #1d1b19;
    --sky-bottom: #1b1815;

    --glass: #26221e;
    --glass-strong: #302a25;
    --glass-border: #3a342e;
    --glass-edge: #3a342e;
    --glass-shadow: none;
    --chip: #322c27;
    --chip-strong: #3e3731;

    --text: #f3ece3;
    --text-muted: #b3aaa0;
    --text-faint: #7f776f;

    --sage: #9dbca4;
    --sage-soft: #2f3730;
    --terracotta: #e09a70;
    --terracotta-soft: #3e3027;
    --amber: #f1b65c;
    --amber-soft: #413424;
    --sky: #8db3cd;
    --sky-soft: #2a3339;
    --lilac: #b6a7d4;
    --danger: #e0786c;
    --danger-soft: #462a28;

    --track: #3e3731;
    --grid-line: #302a25;

    --p-ground: #23241f;
    --p-grass: #2c3227;
    --p-paving: #34302b;
    --p-floor: #3a342d;
    --p-tile: #39352f;
    --p-stone: #37322c;
    --p-lit: #5d4a2a;
    --p-wall: #b1a597;
    --p-furniture: #4a423a;
    --p-furniture-line: #564d44;
    --p-window: #6f9cb2;
    --p-water: #2c5f6d;
    --p-water-lit: #3f8ea3;
    --p-deck: #3a352f;
    --p-fence: #8a8076;
    --p-selected: #9dbca4;
  }
`;

/** Estilos comunes: tarjetas, botones, chips, deslizadores e iconos. */
export const shared = css`
  * {
    box-sizing: border-box;
  }
  button {
    all: unset;
    cursor: pointer;
    box-sizing: border-box;
  }
  button:focus-visible {
    outline: 2px solid var(--sage);
    outline-offset: 2px;
  }
  svg.icon {
    width: 1.2em;
    height: 1.2em;
    fill: currentColor;
    flex: none;
  }
  .num {
    font-variant-numeric: tabular-nums;
  }
  .glass {
    background: var(--glass);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius);
  }
  .card {
    padding: var(--space-3);
    display: grid;
    gap: var(--space-2);
    align-content: start;
  }
  .card-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--fs-small);
    font-weight: 600;
    color: var(--text-muted);
  }
  .card-head .grow {
    flex: 1;
  }
  .card-head .ico {
    display: grid;
    place-items: center;
    width: 2.1em;
    height: 2.1em;
    border-radius: 50%;
    background: var(--chip);
    color: var(--text);
  }
  .muted {
    color: var(--text-muted);
  }
  .faint {
    color: var(--text-faint);
  }
  .kpi {
    font-size: var(--fs-kpi);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .kpi small {
    font-size: 0.42em;
    font-weight: 500;
    color: var(--text-muted);
    margin-left: 0.15em;
    letter-spacing: 0;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 11px;
    border-radius: 999px;
    font-size: var(--fs-label);
    font-weight: 600;
    background: var(--chip);
    color: var(--text-muted);
    white-space: nowrap;
  }
  .pill.ok {
    background: var(--sage-soft);
    color: var(--sage);
  }
  .pill.warn {
    background: var(--amber-soft);
    color: var(--terracotta);
  }
  .pill.bad {
    background: var(--danger-soft);
    color: var(--danger);
  }
  .pill.info {
    background: var(--sky-soft);
    color: var(--sky);
  }

  /* Interruptor tipo iOS */
  .toggle {
    position: relative;
    width: 46px;
    height: 27px;
    border-radius: 999px;
    background: var(--track);
    transition: background 300ms var(--ease);
    flex: none;
  }
  .toggle::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: 21px;
    height: 21px;
    border-radius: 50%;
    background: #fff;
    transition: transform 300ms var(--ease);
  }
  .toggle.on {
    background: var(--sage);
  }
  .toggle.on.amber {
    background: var(--amber);
  }
  .toggle.on::after {
    transform: translateX(19px);
  }

  /* Botones redondos y segmentados */
  .round {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--chip);
    color: var(--text);
    transition:
      background 200ms,
      transform 200ms var(--ease);
  }
  .round:active,
  .seg button:active,
  .btn:active {
    transform: scale(0.94);
  }
  .round.on {
    background: var(--sage);
    color: #fff;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 12px 16px;
    min-height: 44px;
    border-radius: 999px;
    background: var(--chip);
    color: var(--text);
    font-size: var(--fs-small);
    font-weight: 600;
    transition:
      background 200ms,
      transform 200ms var(--ease);
  }
  .btn.primary {
    background: var(--sage);
    color: #fff;
  }
  .btn.danger {
    background: var(--danger-soft);
    color: var(--danger);
  }
  .btn.armed {
    background: var(--terracotta);
    color: #fff;
  }
  .seg {
    display: flex;
    padding: 4px;
    gap: 2px;
    border-radius: 999px;
    background: var(--chip);
  }
  .seg button {
    flex: 1;
    text-align: center;
    padding: 8px 10px;
    border-radius: 999px;
    font-size: var(--fs-label);
    font-weight: 600;
    color: var(--text-muted);
    transition:
      background 250ms var(--ease),
      color 250ms;
  }
  .seg button.on {
    background: var(--glass-strong);
    color: var(--text);
    box-shadow: inset 0 0 0 1px var(--glass-border);
  }

  .scroll {
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
  }
  .scroll::-webkit-scrollbar {
    display: none;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(14px) scale(0.985);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes breathe {
    0%,
    100% {
      opacity: 0.55;
      transform: scale(1);
    }
    50% {
      opacity: 1;
      transform: scale(1.12);
    }
  }
  /* Anillo que se expande: solo transform y opacity (lo anima la GPU, sin repintar) */
  @keyframes ring {
    from {
      transform: scale(1);
      opacity: 0.7;
    }
    to {
      transform: scale(1.9);
      opacity: 0;
    }
  }
  /*
   * Animaciones de "en marcha" para iconos de dispositivos: todas usan solo transform/opacity.
   * Se aplican con la clase .anim-<tipo> sobre el elemento que contiene el icono.
   */
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes wobble {
    0%,
    100% {
      transform: rotate(0);
    }
    25% {
      transform: rotate(-9deg);
    }
    75% {
      transform: rotate(9deg);
    }
  }
  @keyframes bob {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-3px);
    }
  }
  @keyframes glow {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.55;
    }
  }
  @keyframes slide-up {
    from {
      transform: translateY(5px);
      opacity: 0.2;
    }
    to {
      transform: translateY(-5px);
      opacity: 1;
    }
  }
  @keyframes slide-down {
    from {
      transform: translateY(-5px);
      opacity: 0.2;
    }
    to {
      transform: translateY(5px);
      opacity: 1;
    }
  }
  @keyframes shake {
    0%,
    60%,
    100% {
      transform: rotate(0);
    }
    10%,
    30%,
    50% {
      transform: rotate(-14deg);
    }
    20%,
    40% {
      transform: rotate(14deg);
    }
  }
  .anim-spin svg {
    animation: spin 2.4s linear infinite;
  }
  .anim-wobble svg {
    animation: wobble 1.6s ease-in-out infinite;
  }
  .anim-bob svg {
    animation: bob 1.4s ease-in-out infinite;
  }
  .anim-glow svg {
    animation: glow 2.2s ease-in-out infinite;
  }
  .anim-up svg {
    animation: slide-up 1.1s ease-in-out infinite alternate;
  }
  .anim-down svg {
    animation: slide-down 1.1s ease-in-out infinite alternate;
  }
  .anim-shake svg {
    animation: shake 1.2s ease-in-out infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    * {
      animation-duration: 1ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 1ms !important;
    }
  }
`;
