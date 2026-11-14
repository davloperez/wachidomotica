import { html, svg } from "lit";
import type { HassEntity } from "../types";
import { fmt, time } from "../lib/format";
import { icon, mdiMoonWaningCrescent, mdiWeatherSunsetDown, mdiWeatherSunsetUp } from "../lib/icons";

const DAY = 24 * 3600_000;

/** Arco solar: posición del sol (o de la noche) entre amanecer y atardecer. */
export function sunArc(sun: HassEntity | undefined, lang: string) {
  if (!sun) return html`<div class="empty">Sin datos de sun.sun</div>`;

  const now = Date.now();
  const nextRise = Date.parse(String(sun.attributes.next_rising));
  const nextSet = Date.parse(String(sun.attributes.next_setting));
  const isDay = sun.state === "above_horizon";

  // Aproximación a los eventos de "hoy" a partir de los próximos.
  const rise = isDay ? nextRise - DAY : nextRise;
  const set = isDay ? nextSet : nextSet - DAY;
  const from = isDay ? rise : set;
  const to = isDay ? set : rise;
  const p = Math.min(1, Math.max(0, (now - from) / (to - from)));

  const r = 90;
  const cx = 100;
  const cy = 100;
  const x = cx - r * Math.cos(Math.PI * p);
  const y = cy - r * Math.sin(Math.PI * p);
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const color = isDay ? "var(--warn)" : "var(--accent-2)";
  const elevation = Number(sun.attributes.elevation);
  const remaining = Math.max(0, to - now);
  const hh = Math.floor(remaining / 3600_000);
  const mm = Math.floor((remaining % 3600_000) / 60_000);

  return html`
    <div class="sun-wrap">
      <svg class="sun-svg" viewBox="0 -6 200 118" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="sunGrad" x1="0" x2="1">
            <stop offset="0" style="stop-color: var(--accent-2)" />
            <stop offset="1" style="stop-color: ${color}" />
          </linearGradient>
        </defs>
        <line x1="0" x2="200" y1=${cy} y2=${cy} style="stroke: var(--grid-line)" stroke-width="1" />
        <path
          d=${arc}
          fill="none"
          style="stroke: var(--panel-border)"
          stroke-width="2"
          stroke-dasharray="2 5"
        />
        <path
          d=${arc}
          fill="none"
          stroke="url(#sunGrad)"
          stroke-width="3"
          stroke-linecap="round"
          pathLength="100"
          stroke-dasharray="${p * 100} 100"
        />
        ${svg`<circle cx=${x} cy=${y} r="14" style="fill: ${color}" opacity="0.18" />`}
        ${svg`<circle cx=${x} cy=${y} r="6.5" style="fill: ${color}; filter: drop-shadow(0 0 6px ${color})" />`}
      </svg>
      <div class="sun-center">
        <span class="label"
          >${isDay ? "Luz restante" : html`${icon(mdiMoonWaningCrescent)} Hasta el alba`}</span
        >
        <span class="num v accent">${hh}h ${String(mm).padStart(2, "0")}m</span>
      </div>
      <div class="sun-meta">
        <div>
          <span class="label">${icon(mdiWeatherSunsetUp)} Alba</span>
          <span class="num v">${time(new Date(rise), lang)}</span>
        </div>
        <div class="center">
          <span class="label">Elevación</span>
          <span class="num v">${fmt(elevation, 1, lang)}°</span>
        </div>
        <div class="right">
          <span class="label">Ocaso ${icon(mdiWeatherSunsetDown)}</span>
          <span class="num v">${time(new Date(set), lang)}</span>
        </div>
      </div>
    </div>
  `;
}
