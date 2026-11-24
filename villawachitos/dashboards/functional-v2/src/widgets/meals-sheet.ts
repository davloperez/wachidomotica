import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  mdiArrowLeft,
  mdiChevronLeft,
  mdiChevronRight,
  mdiClockOutline,
  mdiClose,
  mdiAccountGroupOutline,
  mdiOpenInNew,
  mdiPlayCircleOutline,
  mdiSilverwareForkKnife,
} from "@mdi/js";

import type { DashboardConfig, HomeAssistant } from "../types";
import { shared } from "../styles/tokens";
import { icon } from "../lib/ha";
import {
  MEAL_ES,
  addDays,
  duration,
  fetchMealplan,
  fetchRecipe,
  mealName,
  weekStart,
  ymd,
  type MealEntry,
  type RecipeDetail,
} from "../lib/meals";
import { sheetStyles } from "./solar-sheet";

const servings = (n: number) => `${n} ${n === 1 ? "ración" : "raciones"}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Menú de comidas: calendario por semanas con lo planificado en Mealie y, al tocar una comida, la receta
 * (tiempos, ingredientes, pasos, enlace y vídeo). Solo lectura: las recetas se crean y planifican en Mealie.
 * Con `slug` se abre directamente en esa receta. Evento: `close`.
 */
@customElement("fv2-meals-sheet")
export class MealsSheet extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ attribute: false }) config?: DashboardConfig;
  /** Receta que se abre al entrar (slug); sin él, se ve el calendario. */
  @property() slug?: string;
  @state() private week = weekStart(new Date());
  @state() private entries: MealEntry[] = [];
  @state() private loading = true;
  @state() private failed = false;
  @state() private detail?: RecipeDetail;
  @state() private detailLoading = false;
  @state() private detailFailed = false;
  /** Si se entró directo a una receta, «volver» cierra la hoja en vez de ir al calendario. */
  private direct = false;
  private seq = 0;

  private close = () => this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("hass") && !changed.get("hass") && this.hass) {
      void this.loadWeek();
      if (this.slug) {
        this.direct = true;
        void this.open(this.slug);
      }
    }
  }

  private get entry(): string | undefined {
    return this.config?.mealie;
  }

  private async loadWeek(): Promise<void> {
    if (!this.hass || !this.entry) return;
    const seq = ++this.seq;
    this.loading = true;
    this.failed = false;
    try {
      const list = await fetchMealplan(this.hass, this.entry, this.week, addDays(this.week, 6));
      if (seq === this.seq) this.entries = list;
    } catch (err) {
      console.warn("[functional-v2] menú de la semana", err);
      if (seq === this.seq) this.failed = true;
    } finally {
      if (seq === this.seq) this.loading = false;
    }
  }

  private shift(weeks: number) {
    this.week = addDays(this.week, weeks * 7);
    void this.loadWeek();
  }

  private today() {
    this.week = weekStart(new Date());
    void this.loadWeek();
  }

  private async open(slug: string): Promise<void> {
    if (!this.hass || !this.entry) return;
    this.detailLoading = true;
    this.detailFailed = false;
    this.detail = undefined;
    try {
      this.detail = await fetchRecipe(this.hass, this.entry, slug);
    } catch (err) {
      console.warn("[functional-v2] receta", err);
      this.detailFailed = true;
    } finally {
      this.detailLoading = false;
    }
  }

  private back() {
    if (this.direct) return this.close();
    this.detail = undefined;
    this.detailFailed = false;
    this.detailLoading = false;
  }

  private inDetail(): boolean {
    return !!(this.detail || this.detailLoading || this.detailFailed);
  }

  private weekLabel(): string {
    const end = addDays(this.week, 6);
    const d = (x: Date, month: boolean) =>
      x.toLocaleDateString("es-ES", month ? { day: "numeric", month: "short" } : { day: "numeric" });
    const sameMonth = this.week.getMonth() === end.getMonth();
    return `${d(this.week, !sameMonth)} – ${d(end, true)}`;
  }

  private mealRow(e: MealEntry) {
    const sub = e.recipe
      ? [duration(e.recipe.totalSeconds), e.recipe.servings ? servings(e.recipe.servings) : ""]
          .filter(Boolean)
          .join(" · ")
      : e.note;
    const body = html`
      <span class="type">${MEAL_ES[e.type] ?? e.type}</span>
      <span class="r-txt">
        <b>${mealName(e)}</b>
        ${sub ? html`<span class="muted">${sub}</span>` : nothing}
      </span>
      ${e.recipe ? icon(mdiChevronRight) : nothing}
    `;
    return e.recipe
      ? html`<button class="meal" @click=${() => this.open(e.recipe!.slug)}>${body}</button>`
      : html`<div class="meal">${body}</div>`;
  }

  private calendar() {
    const todayKey = ymd(new Date());
    const days = Array.from({ length: 7 }, (_, i) => addDays(this.week, i));
    const empty = !this.loading && !this.failed && this.entries.length === 0;
    return html`
      <div class="nav">
        <button class="round" title="Semana anterior" @click=${() => this.shift(-1)}>
          ${icon(mdiChevronLeft)}
        </button>
        <b class="wk">${this.weekLabel()}</b>
        <button class="round" title="Semana siguiente" @click=${() => this.shift(1)}>
          ${icon(mdiChevronRight)}
        </button>
        <button class="btn" @click=${this.today}>Hoy</button>
      </div>
      ${this.failed ? html`<p class="calm">No se pudo leer el menú de Mealie.</p>` : nothing}
      ${empty ? html`<p class="calm">No hay nada planificado esta semana.</p>` : nothing}
      ${days.map((d) => {
        const key = ymd(d);
        const list = this.entries.filter((e) => e.date === key);
        return html`<div class="day ${key === todayKey ? "today" : ""}">
          <div class="dh">
            <b>${cap(d.toLocaleDateString("es-ES", { weekday: "long" }))}</b>
            <span class="muted">${d.toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</span>
          </div>
          ${
            list.length
              ? list.map((e) => this.mealRow(e))
              : html`<span class="muted none">${this.loading ? "…" : "Sin planificar"}</span>`
          }
        </div>`;
      })}
    `;
  }

  private recipe() {
    if (this.detailLoading) return html`<p class="calm">Cargando receta…</p>`;
    const r = this.detail;
    if (this.detailFailed || !r) return html`<p class="calm">No se pudo leer la receta de Mealie.</p>`;
    return html`
      <div class="chips">
        ${
          r.totalSeconds
            ? html`<span class="pill">${icon(mdiClockOutline)} ${duration(r.totalSeconds)}</span>`
            : nothing
        }
        ${
          r.prepSeconds && r.performSeconds
            ? html`<span class="pill"
                >Preparación ${duration(r.prepSeconds)} · cocción ${duration(r.performSeconds)}</span
              >`
            : nothing
        }
        ${
          r.servings
            ? html`<span class="pill">${icon(mdiAccountGroupOutline)} ${servings(r.servings)}</span>`
            : nothing
        }
      </div>
      ${r.description ? html`<p class="desc">${r.description}</p>` : nothing}
      <div class="links">
        ${
          r.video
            ? html`<a class="btn" href=${r.video} target="_blank" rel="noopener"
                >${icon(mdiPlayCircleOutline)} Ver vídeo</a
              >`
            : nothing
        }
        ${
          r.url
            ? html`<a class="btn" href=${r.url} target="_blank" rel="noopener"
                >${icon(mdiOpenInNew)} Receta original</a
              >`
            : nothing
        }
      </div>
      <div class="panel">
        <span class="sub">Ingredientes</span>
        ${
          r.ingredients.length
            ? html`<ul class="ing">
                ${r.ingredients.map(
                  (i) =>
                    html`${i.title ? html`<li class="ing-t">${i.title}</li>` : nothing}
                      <li>${i.text}</li>`,
                )}
              </ul>`
            : html`<span class="muted">Sin ingredientes en la receta.</span>`
        }
      </div>
      ${
        r.steps.length
          ? html`<div class="panel">
              <span class="sub">Preparación</span>
              <ol class="steps">
                ${r.steps.map((s) => html`<li>${s}</li>`)}
              </ol>
            </div>`
          : nothing
      }
      ${
        r.notes.length
          ? html`<div class="panel">
              <span class="sub">Notas</span>
              ${r.notes.map((n) => html`<p class="note"><b>${n.title}</b> ${n.text}</p>`)}
            </div>`
          : nothing
      }
    `;
  }

  render() {
    if (!this.hass) return nothing;
    const detail = this.inDetail();
    return html`
      <div class="scrim" @click=${this.close}></div>
      <section class="sheet glass">
        <header>
          ${
            detail
              ? html`<button class="round" title="Volver" @click=${this.back}>${icon(mdiArrowLeft)}</button>`
              : html`<span class="halo on">${icon(mdiSilverwareForkKnife)}</span>`
          }
          <div class="ttl">
            <h3>${detail ? (this.detail?.name ?? "Receta") : "Menú de la semana"}</h3>
            ${detail ? nothing : html`<span class="muted">Recetas y comidas planificadas en Mealie</span>`}
          </div>
          <button class="round" title="Cerrar" @click=${this.close}>${icon(mdiClose)}</button>
        </header>
        ${detail ? this.recipe() : this.calendar()}
      </section>
    `;
  }

  static styles = [
    shared,
    sheetStyles,
    css`
      .sheet {
        width: min(760px, calc(100% - 32px));
      }
      @media (max-width: 720px) {
        .sheet {
          width: calc(100% - 16px);
        }
      }
      .nav {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .wk {
        flex: 1;
        text-align: center;
        font-size: var(--fs-small);
      }
      .calm {
        margin: 0;
        font-size: var(--fs-small);
        color: var(--text-muted);
        font-family: var(--font-display);
        font-style: italic;
      }
      .day {
        display: grid;
        gap: 6px;
        padding: 8px;
        border-radius: 14px;
        background: var(--chip);
      }
      .day.today {
        box-shadow: inset 0 0 0 2px var(--amber);
      }
      .dh {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        padding: 0 4px;
        font-size: var(--fs-small);
      }
      .dh .muted,
      .none {
        font-size: var(--fs-label);
      }
      .none {
        padding: 2px 4px;
      }
      .meal {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        min-height: 44px;
        padding: 8px 10px;
        border-radius: 10px;
        background: var(--bg);
        color: var(--text);
        text-align: left;
        font-size: var(--fs-small);
      }
      .type {
        flex: none;
        width: 5.2em;
        font-size: var(--fs-label);
        font-weight: 600;
        color: var(--text-muted);
      }
      .r-txt {
        flex: 1;
        display: grid;
        min-width: 0;
      }
      .r-txt .muted {
        font-size: var(--fs-label);
      }
      .chips,
      .links {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .links .btn {
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .desc {
        margin: 0;
        font-size: var(--fs-small);
        color: var(--text-muted);
        line-height: 1.45;
      }
      .sub {
        font-size: var(--fs-label);
        font-weight: 600;
        color: var(--text-muted);
      }
      .ing,
      .steps {
        margin: 0;
        padding: 0;
        display: grid;
        gap: 6px;
        font-size: var(--fs-small);
      }
      .ing {
        list-style: none;
      }
      .ing li::before {
        content: "• ";
        color: var(--amber);
      }
      .ing .ing-t {
        font-weight: 600;
        color: var(--text-muted);
      }
      .ing .ing-t::before {
        content: "";
      }
      .steps {
        padding-left: 1.4em;
        line-height: 1.45;
      }
      .note {
        margin: 0;
        font-size: var(--fs-small);
        line-height: 1.45;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "fv2-meals-sheet": MealsSheet;
  }
}
