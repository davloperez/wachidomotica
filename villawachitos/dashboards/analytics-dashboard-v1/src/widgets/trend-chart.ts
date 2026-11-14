import { LitElement, css, html, type PropertyValues } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { init, use, graphic, type ECharts } from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { Point } from "../data/statistics";

use([LineChart, GridComponent, TooltipComponent, SVGRenderer]);

export interface TrendSeries {
  name: string;
  unit: string;
  data: Point[];
  /** Variable CSS del color de línea, p. ej. "--accent" */
  colorVar: string;
  /** Variable CSS del color superior del degradado de área */
  areaVar: string;
  /** Eje Y secundario (derecha) */
  secondary?: boolean;
}

/** Gráfica de líneas con área degradada (ECharts, renderizador SVG). Se recolorea al cambiar de tema. */
@customElement("adv1-trend-chart")
export class TrendChart extends LitElement {
  @property({ attribute: false }) series: TrendSeries[] = [];
  @property() theme: "light" | "dark" = "dark";
  @property() lang = "es";

  @query(".chart") private container!: HTMLDivElement;
  private chart?: ECharts;
  private resizeObserver?: ResizeObserver;

  firstUpdated(): void {
    this.chart = init(this.container, undefined, { renderer: "svg" });
    this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
    this.resizeObserver.observe(this.container);
    this.applyOptions();
  }

  updated(changed: PropertyValues<this>): void {
    if (this.chart && (changed.has("series") || changed.has("theme"))) {
      // Esperar a que el host haya aplicado las variables del nuevo tema.
      requestAnimationFrame(() => this.applyOptions());
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
    this.chart = undefined;
  }

  private cssVar(name: string): string {
    return getComputedStyle(this).getPropertyValue(name).trim();
  }

  private applyOptions(): void {
    if (!this.chart) return;
    const text = this.cssVar("--text-muted");
    const grid = this.cssVar("--grid-line");
    const panel = this.cssVar("--panel-strong");
    const border = this.cssVar("--panel-border");
    const fontSize = Math.max(11, Math.min(16, window.innerWidth * 0.0085));
    const hasSecondary = this.series.some((s) => s.secondary);

    const yAxis = (secondary: boolean) => ({
      type: "value" as const,
      scale: true,
      position: secondary ? ("right" as const) : ("left" as const),
      splitNumber: 4,
      axisLabel: {
        color: text,
        fontFamily: "ADV1 Grotesk",
        fontSize,
        formatter: (v: number) =>
          `${v.toLocaleString(this.lang, { maximumFractionDigits: 1 })}${
            this.series.find((s) => !!s.secondary === secondary)?.unit ?? ""
          }`,
      },
      splitLine: { show: !secondary, lineStyle: { color: grid, type: "dashed" as const } },
    });

    this.chart.setOption(
      {
        animationDuration: 900,
        animationEasing: "cubicOut",
        grid: { left: 8, right: 8, top: 16, bottom: 4, containLabel: true },
        tooltip: {
          trigger: "axis",
          backgroundColor: panel,
          borderColor: border,
          textStyle: { color: this.cssVar("--text"), fontFamily: "ADV1 Grotesk" },
          valueFormatter: (v: unknown) =>
            typeof v === "number" ? v.toLocaleString(this.lang, { maximumFractionDigits: 1 }) : String(v),
        },
        xAxis: {
          type: "time",
          axisLine: { lineStyle: { color: grid } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: {
            color: text,
            fontFamily: "ADV1 Grotesk",
            fontSize,
            hideOverlap: true,
            formatter: (v: number) =>
              new Date(v).toLocaleTimeString(this.lang, {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }),
          },
        },
        yAxis: hasSecondary ? [yAxis(false), yAxis(true)] : [yAxis(false)],
        series: this.series.map((s) => {
          const color = this.cssVar(s.colorVar);
          return {
            name: s.name,
            type: "line",
            yAxisIndex: s.secondary && hasSecondary ? 1 : 0,
            data: s.data,
            showSymbol: false,
            smooth: 0.35,
            lineStyle: { width: 2.5, color, shadowBlur: 12, shadowColor: color },
            itemStyle: { color },
            areaStyle: {
              color: new graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: this.cssVar(s.areaVar) },
                { offset: 1, color: "rgba(0,0,0,0)" },
              ]),
            },
          };
        }),
      },
      { notMerge: true },
    );
  }

  render() {
    return html`<div class="chart"></div>`;
  }

  static styles = css`
    :host {
      display: block;
      position: relative;
      min-height: 0;
    }
    .chart {
      position: absolute;
      inset: 0;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "adv1-trend-chart": TrendChart;
  }
}
