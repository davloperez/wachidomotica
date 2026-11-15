import { css } from "lit";

/**
 * Sistema de diseño: colores cálidos y tranquilos (lino, salvia, terracota, ámbar suave),
 * paneles de cristal esmerilado y tipografía Manrope + Fraunces. El tema se aplica con
 * `data-theme` en el host de la tarjeta; los componentes hijos heredan las variables.
 */
export const tokens = css`
  :host {
    --font-ui: "FV1 Manrope", "Manrope", system-ui, sans-serif;
    --font-display: "FV1 Fraunces", "Fraunces", Georgia, serif;

    --space-1: clamp(4px, 0.35vw, 8px);
    --space-2: clamp(8px, 0.7vw, 14px);
    --space-3: clamp(12px, 1.05vw, 20px);
    --space-4: clamp(16px, 1.5vw, 28px);
    --radius: clamp(16px, 1.4vw, 26px);
    --radius-sm: clamp(10px, 0.9vw, 16px);

    --fs-label: clamp(10px, 0.72vw, 13px);
    --fs-small: clamp(12px, 0.85vw, 15px);
    --fs-body: clamp(13px, 1vw, 17px);
    --fs-title: clamp(17px, 1.35vw, 24px);
    --fs-kpi: clamp(26px, 2.5vw, 44px);
    --fs-hero: clamp(30px, 3.1vw, 56px);

    --col-w: clamp(290px, 23vw, 400px);
    --ease: cubic-bezier(0.22, 1, 0.36, 1);
    --ease-soft: cubic-bezier(0.45, 0, 0.2, 1);
    --zoom-ms: 1100ms;
  }

  /* ---------- CLARO (por defecto): lino cálido ---------- */
  :host,
  :host([data-theme="light"]) {
    color-scheme: light;
    --bg: #ebe4da;
    --bg-2: #f4efe8;
    --sky-top: #dfe7ea;
    --sky-bottom: #efe8de;

    --glass: rgba(255, 252, 247, 0.66);
    --glass-strong: rgba(255, 252, 247, 0.88);
    --glass-border: rgba(255, 255, 255, 0.7);
    --glass-edge: rgba(90, 70, 50, 0.1);
    --glass-shadow: 0 18px 50px -22px rgba(80, 60, 40, 0.35);
    --chip: rgba(90, 70, 50, 0.07);
    --chip-strong: rgba(90, 70, 50, 0.12);

    --text: #2e2823;
    --text-muted: rgba(46, 40, 35, 0.62);
    --text-faint: rgba(46, 40, 35, 0.38);

    --sage: #74937b;
    --sage-soft: rgba(116, 147, 123, 0.18);
    --terracotta: #c9825a;
    --terracotta-soft: rgba(201, 130, 90, 0.18);
    --amber: #e0a24a;
    --amber-soft: rgba(224, 162, 74, 0.2);
    --sky: #6f97b3;
    --sky-soft: rgba(111, 151, 179, 0.18);
    --lilac: #9b8bb8;
    --danger: #c4544a;
    --danger-soft: rgba(196, 84, 74, 0.16);

    --track: rgba(90, 70, 50, 0.12);
    --grid-line: rgba(90, 70, 50, 0.08);

    /* Maqueta isométrica */
    --iso-grass: #c5cfb0;
    --iso-grass-2: #b7c3a0;
    --iso-paving: #d9d2c6;
    --iso-porch: #e6dccd;
    --iso-wood: #e1cfb6;
    --iso-tile: #e7e2da;
    --iso-stone: #ddd6ca;
    --iso-wall: #fbf8f3;
    --iso-wall-cap: #8f8172;
    --iso-glass: rgba(150, 190, 210, 0.55);
    --iso-water: #8cc3d1;
    --iso-water-2: #5fa5ba;
    --iso-tree: #93a885;
    --iso-tree-2: #7f9672;
    --iso-shadow: rgba(70, 55, 40, 0.18);
    --iso-light: #ffc96b;
    --iso-fence: rgba(60, 50, 40, 0.55);
    --iso-cast: #4a3624;
    --iso-cast-op: 0.22;
    --iso-glow-blend: soft-light;
    --iso-grain-op: 0.14;
    --iso-noise-op: 0.3;
    --iso-caustic-op: 0.5;
    --t-dark: #6f655c;
    --t-light: #efe8de;
    --t-accent: #c9825a;
    --t-white: #faf8f4;
    --t-wood: #c9a77e;
    --t-darkwood: #8a6a4c;
    --t-beige: #e9dcc6;
    --t-sofa: #d8cbb8;
    --t-screen: #3b3836;
    --t-steel: #b9bcbd;
    --t-glass: rgba(170, 205, 220, 0.5);
    --t-bed: #f4efe7;
  }

  /* ---------- OSCURO: espresso con brillo ámbar ---------- */
  :host([data-theme="dark"]) {
    color-scheme: dark;
    --bg: #1b1815;
    --bg-2: #24201c;
    --sky-top: #191b20;
    --sky-bottom: #231f1b;

    --glass: rgba(44, 38, 33, 0.6);
    --glass-strong: rgba(48, 42, 36, 0.9);
    --glass-border: rgba(255, 240, 220, 0.1);
    --glass-edge: rgba(0, 0, 0, 0.25);
    --glass-shadow: 0 22px 60px -24px rgba(0, 0, 0, 0.75);
    --chip: rgba(255, 240, 220, 0.07);
    --chip-strong: rgba(255, 240, 220, 0.13);

    --text: #f3ece3;
    --text-muted: rgba(243, 236, 227, 0.62);
    --text-faint: rgba(243, 236, 227, 0.36);

    --sage: #9dbca4;
    --sage-soft: rgba(157, 188, 164, 0.16);
    --terracotta: #e09a70;
    --terracotta-soft: rgba(224, 154, 112, 0.16);
    --amber: #f1b65c;
    --amber-soft: rgba(241, 182, 92, 0.18);
    --sky: #8db3cd;
    --sky-soft: rgba(141, 179, 205, 0.16);
    --lilac: #b6a7d4;
    --danger: #e0786c;
    --danger-soft: rgba(224, 120, 108, 0.18);

    --track: rgba(255, 240, 220, 0.12);
    --grid-line: rgba(255, 240, 220, 0.07);

    --iso-grass: #3a3f33;
    --iso-grass-2: #33382d;
    --iso-paving: #3d3934;
    --iso-porch: #4a433b;
    --iso-wood: #5a4b3c;
    --iso-tile: #514b45;
    --iso-stone: #4b4540;
    --iso-wall: #6e655b;
    --iso-wall-cap: #2b2622;
    --iso-glass: rgba(120, 160, 180, 0.4);
    --iso-water: #2f6574;
    --iso-water-2: #23505d;
    --iso-tree: #4b5a43;
    --iso-tree-2: #3f4c38;
    --iso-shadow: rgba(0, 0, 0, 0.3);
    --iso-light: #ffbe5c;
    --iso-fence: rgba(0, 0, 0, 0.6);
    --iso-cast: #000;
    --iso-cast-op: 0.42;
    --iso-glow-blend: screen;
    --iso-grain-op: 0.08;
    --iso-noise-op: 0.12;
    --iso-caustic-op: 0.22;
    --t-dark: #2f2a26;
    --t-light: #6a6158;
    --t-accent: #a56a4a;
    --t-white: #7a7168;
    --t-wood: #7d6247;
    --t-darkwood: #4a3828;
    --t-beige: #6d6150;
    --t-sofa: #675b4d;
    --t-screen: #1a1817;
    --t-steel: #77797a;
    --t-glass: rgba(120, 160, 180, 0.35);
    --t-bed: #7b7268;
  }
`;

/** Estilos comunes: paneles de cristal, botones, chips, deslizadores e iconos. */
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
    box-shadow:
      var(--glass-shadow),
      inset 0 0 0 1px var(--glass-edge);
    backdrop-filter: blur(18px) saturate(1.2);
    -webkit-backdrop-filter: blur(18px) saturate(1.2);
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
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
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
    width: 44px;
    height: 44px;
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
    padding: 10px 14px;
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
    box-shadow: 0 2px 10px -4px rgba(0, 0, 0, 0.25);
  }

  /* Deslizador grueso con relleno (usa --pct y --fill) */
  input[type="range"].slider {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 34px;
    margin: 0;
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      var(--fill, var(--amber)) 0 var(--pct, 0%),
      var(--track) var(--pct, 0%) 100%
    );
    outline: none;
    cursor: pointer;
    touch-action: pan-y;
  }
  input[type="range"].slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: #fff;
    border: 6px solid var(--fill, var(--amber));
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }
  input[type="range"].slider::-moz-range-thumb {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #fff;
    border: 6px solid var(--fill, var(--amber));
  }
  input[type="range"].slider.thin {
    height: 12px;
  }
  input[type="range"].slider.thin::-webkit-slider-thumb {
    width: 24px;
    height: 24px;
    border-width: 5px;
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
  @keyframes ripple {
    0% {
      box-shadow: 0 0 0 0 var(--ripple, rgba(224, 162, 74, 0.55));
    }
    100% {
      box-shadow: 0 0 0 14px transparent;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    * {
      animation-duration: 1ms !important;
      transition-duration: 1ms !important;
    }
  }
`;
