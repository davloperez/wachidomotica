/**
 * Menú de comidas: lee el plan de Mealie a través de la integración oficial de Home Assistant
 * (servicios `mealie.get_mealplan` y `mealie.get_recipe`, que devuelven datos). Mealie es donde se
 * crean las recetas y se planifican las comidas; aquí solo se muestran.
 */
import type { HomeAssistant } from "../types";

/** Tipos de comida de Mealie, en el orden del día. */
export const MEAL_TYPES = ["breakfast", "lunch", "snack", "dinner", "side", "dessert", "drink"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const MEAL_ES: Record<string, string> = {
  breakfast: "Desayuno",
  lunch: "Comida",
  snack: "Merienda",
  dinner: "Cena",
  side: "Guarnición",
  dessert: "Postre",
  drink: "Bebida",
};

export interface MealRecipe {
  id: string;
  name: string;
  slug: string;
  description: string;
  /** Segundos (undefined si la receta no los indica). */
  totalSeconds?: number;
  prepSeconds?: number;
  performSeconds?: number;
  servings?: number;
  url?: string;
  /** Id de la imagen en Mealie (aún no se muestra). */
  image?: string;
}

export interface MealEntry {
  id: number;
  /** `YYYY-MM-DD` */
  date: string;
  type: string;
  /** Título de la nota cuando se planifica sin receta. */
  title?: string;
  note?: string;
  recipe?: MealRecipe;
}

export interface RecipeDetail extends MealRecipe {
  ingredients: { text: string; title?: string }[];
  steps: string[];
  notes: { title: string; text: string }[];
  video?: string;
}

interface RawRecipe {
  recipe_id: string;
  name: string;
  slug: string;
  description?: string;
  total_time_seconds?: number | null;
  prep_time_seconds?: number | null;
  perform_time_seconds?: number | null;
  recipe_servings?: number | null;
  original_url?: string | null;
  image?: string | null;
}

interface RawEntry {
  mealplan_id: number;
  mealplan_date: string;
  entry_type: string;
  title?: string | null;
  description?: string | null;
  recipe?: RawRecipe | null;
}

interface RawDetail extends RawRecipe {
  ingredients?: { display?: string | null; note?: string | null; title?: string | null }[];
  instructions?: { text?: string | null }[];
  notes?: { title?: string | null; text?: string | null }[];
  extras?: Record<string, unknown>;
}

/** Fecha local como `YYYY-MM-DD` (sin pasar por UTC, que cambiaría el día cerca de medianoche). */
export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  return r;
}

/** Lunes de la semana de `d`. */
export function weekStart(d: Date): Date {
  return addDays(d, -((d.getDay() + 6) % 7));
}

const sec = (n: number | null | undefined) => (typeof n === "number" && n > 0 ? n : undefined);

function toRecipe(r: RawRecipe): MealRecipe {
  return {
    id: r.recipe_id,
    name: r.name,
    slug: r.slug,
    description: r.description ?? "",
    totalSeconds: sec(r.total_time_seconds),
    prepSeconds: sec(r.prep_time_seconds),
    performSeconds: sec(r.perform_time_seconds),
    servings: sec(r.recipe_servings),
    url: r.original_url || undefined,
    image: r.image || undefined,
  };
}

/** Llama a un servicio de Mealie que devuelve datos y entrega solo la parte `response`. */
async function mealie<T>(
  hass: HomeAssistant,
  entry: string,
  service: string,
  data: Record<string, unknown>,
): Promise<T> {
  const res = await hass.callWS<{ response: T }>({
    type: "call_service",
    domain: "mealie",
    service,
    service_data: { config_entry_id: entry, ...data },
    return_response: true,
  });
  return res.response;
}

/** Comidas planificadas entre dos fechas (ambas incluidas), ordenadas por día y tipo de comida. */
export async function fetchMealplan(
  hass: HomeAssistant,
  entry: string,
  from: Date,
  to: Date,
): Promise<MealEntry[]> {
  const res = await mealie<{ mealplan: RawEntry[] }>(hass, entry, "get_mealplan", {
    start_date: ymd(from),
    end_date: ymd(to),
  });
  const rank = (t: string) => {
    const i = MEAL_TYPES.indexOf(t as MealType);
    return i < 0 ? MEAL_TYPES.length : i;
  };
  return (res.mealplan ?? [])
    .map((e): MealEntry => ({
      id: e.mealplan_id,
      date: e.mealplan_date,
      type: e.entry_type,
      title: e.title || undefined,
      note: e.description || undefined,
      recipe: e.recipe ? toRecipe(e.recipe) : undefined,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || rank(a.type) - rank(b.type));
}

/** Quita el Markdown básico de los pasos (negritas, cursivas y enlaces) para mostrarlos como texto. */
export function plain(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .trim();
}

const VIDEO_RE =
  /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch|shorts|embed)|youtu\.be\/|vimeo\.com\/)[^\s)"'<>]*/i;

/** Vídeo de la receta: el extra `video` de Mealie o, si no, el primer enlace a YouTube/Vimeo del texto. */
export function findVideo(
  extras: Record<string, unknown> | undefined,
  ...texts: (string | undefined)[]
): string | undefined {
  const v = extras?.video;
  if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
  for (const t of texts) {
    const m = t?.match(VIDEO_RE);
    if (m) return m[0];
  }
  return undefined;
}

/** Receta completa (ingredientes, pasos, notas y vídeo). */
export async function fetchRecipe(hass: HomeAssistant, entry: string, slug: string): Promise<RecipeDetail> {
  const res = await mealie<{ recipe: RawDetail }>(hass, entry, "get_recipe", { recipe_id: slug });
  const r = res.recipe;
  const steps = (r.instructions ?? []).map((s) => s.text ?? "").filter(Boolean);
  const notes = (r.notes ?? [])
    .filter((n) => n.text)
    .map((n) => ({ title: n.title ?? "", text: n.text ?? "" }));
  return {
    ...toRecipe(r),
    ingredients: (r.ingredients ?? [])
      .map((i) => ({ text: (i.display || i.note || "").trim(), title: i.title || undefined }))
      .filter((i) => i.text),
    steps: steps.map(plain),
    notes,
    video: findVideo(r.extras, r.description, ...notes.map((n) => n.text), ...steps),
  };
}

/** «1 h 5 min», «45 min»… */
export function duration(seconds: number | undefined): string {
  if (!seconds) return "";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

/** Título que se muestra de una entrada: la receta o, si es una nota, su título. */
export const mealName = (e: MealEntry): string => e.recipe?.name ?? e.title ?? e.note ?? "Sin nombre";
