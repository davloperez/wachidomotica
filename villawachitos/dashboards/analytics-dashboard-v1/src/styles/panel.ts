import { css } from "lit";

/** Estilo compartido de "panel HUD": cristal, borde fino y esquinas marcadas. */
export const panel = css`
  .panel {
    position: relative;
    background: var(--panel);
    border: 1px solid var(--panel-border);
    border-radius: var(--radius);
    box-shadow: var(--panel-shadow);
    padding: var(--space-3) var(--space-4);
    overflow: hidden;
    min-width: 0;
    min-height: 0;
  }

  /* Línea de luz en el borde superior */
  .panel::before {
    content: "";
    position: absolute;
    inset: 0 18% auto 18%;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--panel-highlight), transparent);
    pointer-events: none;
  }

  /* Esquinas tipo HUD */
  .panel::after {
    content: "";
    position: absolute;
    inset: 8px;
    pointer-events: none;
    --c: var(--panel-highlight);
    --l: 14px;
    background:
      linear-gradient(var(--c), var(--c)) top left / var(--l) 1px,
      linear-gradient(var(--c), var(--c)) top left / 1px var(--l),
      linear-gradient(var(--c), var(--c)) bottom right / var(--l) 1px,
      linear-gradient(var(--c), var(--c)) bottom right / 1px var(--l);
    background-repeat: no-repeat;
    opacity: 0.7;
    border-radius: calc(var(--radius) - 8px);
  }

  .label {
    font-family: var(--font-hud);
    font-weight: 500;
    font-size: var(--fs-label);
    letter-spacing: 0.16em;
    white-space: nowrap;
    min-width: 0;
    text-transform: uppercase;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .label .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: var(--accent-glow);
  }

  .num {
    font-family: var(--font-ui);
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum";
  }

  svg.icon {
    width: 1em;
    height: 1em;
    fill: currentColor;
    flex: none;
  }

  @keyframes pop {
    from {
      opacity: 0.3;
      transform: translateY(6px);
      filter: blur(3px);
    }
    to {
      opacity: 1;
      transform: none;
      filter: none;
    }
  }

  .pop {
    display: inline-block;
    animation: pop 600ms var(--ease-out);
  }
`;
