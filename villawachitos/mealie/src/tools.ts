import { z } from "zod";
import { api, getRecipe } from "./client.ts";

/** Definición de herramienta: se usa tanto para registrar el MCP como para generar la página de documentación. */
export interface ToolDef {
  name: string;
  group: string;
  description: string;
  shape: z.ZodRawShape;
  readOnly?: boolean;
  destructive?: boolean;
  run: (args: any) => Promise<unknown>;
}

export const tools: ToolDef[] = [];

function def<S extends z.ZodRawShape>(
  group: string,
  name: string,
  description: string,
  shape: S,
  run: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>,
  flags: { readOnly?: boolean; destructive?: boolean } = {},
) {
  tools.push({ name, group, description, shape, run, ...flags });
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato AAAA-MM-DD");
const entryType = z.enum(["breakfast", "lunch", "dinner", "side"]).describe("breakfast=desayuno, lunch=comida, dinner=cena, side=guarnición");

/** Resumen corto de una receta para listados. */
const brief = (r: any) => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  description: r.description || undefined,
  totalTime: r.totalTime || undefined,
  rating: r.rating ?? undefined,
  categories: r.recipeCategory?.map((c: any) => c.name),
  tags: r.tags?.map((t: any) => t.name),
});

// ───────────────────────── Recetas ─────────────────────────
const G_REC = "Recetas";

def(G_REC, "search_recipes", "Busca recetas por texto, categoría o etiqueta. Devuelve un resumen (id, slug, nombre…). Usa get_recipe para el detalle.", {
  query: z.string().optional().describe("Texto a buscar en el nombre/ingredientes"),
  categories: z.array(z.string()).optional().describe("Slugs de categorías"),
  tags: z.array(z.string()).optional().describe("Slugs de etiquetas"),
  page: z.number().int().min(1).default(1),
  perPage: z.number().int().min(1).max(100).default(20),
}, async ({ query, categories, tags, page, perPage }) => {
  const r = await api<any>("GET", "/api/recipes", { query: { search: query, categories, tags, page, perPage, orderBy: "name", orderDirection: "asc" } });
  return { total: r.total, page: r.page, totalPages: r.total_pages, items: r.items.map(brief) };
}, { readOnly: true });

def(G_REC, "get_recipe", "Devuelve la receta completa: ingredientes, pasos, tiempos, categorías, etiquetas, notas y nutrición.", {
  slug: z.string().describe("Slug o id de la receta"),
}, ({ slug }) => getRecipe(slug), { readOnly: true });

def(G_REC, "create_recipe", "Crea una receta nueva. Con solo 'name' crea una receta vacía; el resto de campos se rellenan en la misma llamada. Ingredientes: líneas de texto libre (por ejemplo '200 g de harina'); se analizan automáticamente a cantidad/unidad/alimento si parse=true.", {
  name: z.string().min(1),
  description: z.string().optional(),
  recipeYield: z.string().optional().describe("Raciones, p. ej. '4 raciones'"),
  prepTime: z.string().optional().describe("Texto libre, p. ej. '15 min'"),
  performTime: z.string().optional().describe("Tiempo de cocción, p. ej. '30 min'"),
  totalTime: z.string().optional(),
  ingredients: z.array(z.string()).optional().describe("Una línea por ingrediente"),
  parse: z.boolean().default(false).describe("Analizar a cantidad/unidad/alimento (el analizador de Mealie está pensado para inglés; en español suele dejar restos como 'de' en la nota). Por defecto se guarda el texto tal cual"),
  instructions: z.array(z.string()).optional().describe("Un paso por elemento"),
  categories: z.array(z.string()).optional().describe("Nombres de categorías (se crean si no existen)"),
  tags: z.array(z.string()).optional().describe("Nombres de etiquetas (se crean si no existen)"),
  notes: z.array(z.string()).optional(),
}, async (a) => {
  const slug = await api<string>("POST", "/api/recipes", { body: { name: a.name } });
  try {
    return await patchRecipe(slug, a);
  } catch (e) {
    throw new Error(`La receta '${slug}' se creó vacía pero falló el rellenado: ${(e as Error).message}`);
  }
});

def(G_REC, "update_recipe", "Modifica campos de una receta existente. Solo se cambian los campos indicados. 'ingredients' e 'instructions' REEMPLAZAN la lista completa (usa get_recipe antes si quieres conservar parte). Para añadir un único ingrediente o paso, usa add_recipe_ingredient / add_recipe_step.", {
  slug: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  recipeYield: z.string().optional(),
  prepTime: z.string().optional(),
  performTime: z.string().optional(),
  totalTime: z.string().optional(),
  ingredients: z.array(z.string()).optional(),
  parse: z.boolean().default(false),
  instructions: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.array(z.string()).optional(),
  rating: z.number().min(0).max(5).optional(),
}, ({ slug, ...rest }) => patchRecipe(slug, rest));

def(G_REC, "delete_recipe", "BORRA una receta de forma permanente. Pide confirmación al usuario antes.", {
  slug: z.string(),
}, async ({ slug }) => {
  await api("DELETE", `/api/recipes/${encodeURIComponent(slug)}`);
  return { deleted: slug };
}, { destructive: true });

def(G_REC, "duplicate_recipe", "Duplica una receta (útil para hacer una variante).", {
  slug: z.string(),
  name: z.string().optional().describe("Nombre de la copia"),
}, ({ slug, name }) => api("POST", `/api/recipes/${encodeURIComponent(slug)}/duplicate`, { body: { name } }));

def(G_REC, "import_recipe_from_url", "Importa una receta desde la URL de una página web (Mealie extrae título, ingredientes y pasos).", {
  url: z.string().url(),
  includeTags: z.boolean().default(false),
}, async ({ url, includeTags }) => {
  const slug = await api<string>("POST", "/api/recipes/create/url", { body: { url, includeTags } });
  return brief(await getRecipe(slug));
});

def(G_REC, "set_recipe_image_from_url", "Asigna (o reemplaza) la imagen de una receta descargándola desde la URL de una imagen. Mealie la descarga desde su servidor, así que la URL debe ser pública.", {
  slug: z.string(),
  imageUrl: z.string().url().describe("URL directa de la imagen (jpg, png, webp…)"),
}, async ({ slug, imageUrl }) => {
  await api("POST", `/api/recipes/${encodeURIComponent(slug)}/image`, { body: { url: imageUrl } });
  return { slug, image: "actualizada" };
});

def(G_REC, "set_recipe_image_base64", "Asigna (o reemplaza) la imagen de una receta a partir de un fichero propio, enviado en base64 (útil para fotos del ordenador). Mejor imágenes de menos de ~5 MB.", {
  slug: z.string(),
  data: z.string().describe("Contenido del fichero en base64, sin prefijo data:"),
  extension: z.enum(["jpg", "jpeg", "png", "webp", "gif"]).default("jpg"),
}, async ({ slug, data, extension }) => {
  const bytes = Buffer.from(data.replace(/^data:[^,]*,/, ""), "base64");
  if (bytes.length < 100) throw new Error("La imagen está vacía o el base64 no es válido.");
  const form = new FormData();
  form.set("image", new Blob([bytes]), `imagen.${extension}`);
  form.set("extension", extension);
  await api("PUT", `/api/recipes/${encodeURIComponent(slug)}/image`, { form });
  return { slug, image: "actualizada", bytes: bytes.length };
});

def(G_REC, "delete_recipe_image", "Quita la imagen de una receta.", { slug: z.string() }, async ({ slug }) => {
  await api("DELETE", `/api/recipes/${encodeURIComponent(slug)}/image`);
  return { slug, image: "eliminada" };
}, { destructive: true });

// ───────────────────────── Ingredientes ─────────────────────────
const G_ING = "Ingredientes";

def(G_ING, "add_recipe_ingredient", "Añade un ingrediente (línea de texto) al final de una receta.", {
  slug: z.string(),
  text: z.string().describe("p. ej. '2 cucharadas de aceite de oliva'"),
  parse: z.boolean().default(false),
}, async ({ slug, text, parse }) => {
  const r = await getRecipe(slug);
  const [ing] = await toIngredients([text], parse);
  return brief(await put(slug, { ...r, recipeIngredient: [...(r.recipeIngredient ?? []), ing] }));
});

def(G_ING, "remove_recipe_ingredient", "Quita un ingrediente de una receta por su posición (empezando en 1, según get_recipe).", {
  slug: z.string(),
  position: z.number().int().min(1),
}, async ({ slug, position }) => {
  const r = await getRecipe(slug);
  const list = [...(r.recipeIngredient ?? [])];
  if (position > list.length) throw new Error(`La receta solo tiene ${list.length} ingredientes.`);
  const [removed] = list.splice(position - 1, 1);
  await put(slug, { ...r, recipeIngredient: list });
  return { removed: removed.display ?? removed.note ?? removed.originalText, remaining: list.length };
}, { destructive: true });

def(G_ING, "add_recipe_step", "Añade un paso al final de las instrucciones de una receta.", {
  slug: z.string(),
  text: z.string(),
  title: z.string().optional(),
}, async ({ slug, text, title }) => {
  const r = await getRecipe(slug);
  const steps = [...(r.recipeInstructions ?? []), { title: title ?? "", summary: "", text, ingredientReferences: [] }];
  return brief(await put(slug, { ...r, recipeInstructions: steps }));
});

def(G_ING, "parse_ingredients", "Analiza líneas de texto y devuelve cantidad, unidad y alimento detectados (no guarda nada).", {
  ingredients: z.array(z.string()).min(1),
}, (a) => api("POST", "/api/parser/ingredients", { body: { parser: "nlp", ingredients: a.ingredients } }), { readOnly: true });

def(G_ING, "list_foods", "Lista los alimentos del catálogo de Mealie (la base de datos de ingredientes).", {
  query: z.string().optional(),
  page: z.number().int().min(1).default(1),
  perPage: z.number().int().min(1).max(200).default(50),
}, async ({ query, page, perPage }) => {
  const r = await api<any>("GET", "/api/foods", { query: { search: query, page, perPage, orderBy: "name", orderDirection: "asc" } });
  return { total: r.total, items: r.items.map((f: any) => ({ id: f.id, name: f.name, pluralName: f.pluralName || undefined })) };
}, { readOnly: true });

def(G_ING, "create_food", "Crea un alimento en el catálogo.", {
  name: z.string(),
  pluralName: z.string().optional(),
  description: z.string().optional(),
}, (a) => api("POST", "/api/foods", { body: a }));

def(G_ING, "update_food", "Renombra o modifica un alimento del catálogo.", {
  id: z.string(),
  name: z.string().optional(),
  pluralName: z.string().optional(),
  description: z.string().optional(),
}, async ({ id, ...rest }) => {
  const cur = await api<any>("GET", `/api/foods/${id}`);
  return api("PUT", `/api/foods/${id}`, { body: { ...cur, ...rest } });
});

def(G_ING, "delete_food", "BORRA un alimento del catálogo. Pide confirmación antes.", { id: z.string() }, async ({ id }) => {
  await api("DELETE", `/api/foods/${id}`);
  return { deleted: id };
}, { destructive: true });

def(G_ING, "list_units", "Lista las unidades de medida (g, ml, cucharada…).", {
  query: z.string().optional(),
}, async ({ query }) => {
  const r = await api<any>("GET", "/api/units", { query: { search: query, perPage: 200 } });
  return r.items.map((u: any) => ({ id: u.id, name: u.name, abbreviation: u.abbreviation || undefined }));
}, { readOnly: true });

def(G_ING, "create_unit", "Crea una unidad de medida.", {
  name: z.string(),
  abbreviation: z.string().optional(),
  pluralName: z.string().optional(),
}, (a) => api("POST", "/api/units", { body: a }));

// ───────────────────────── Categorías y etiquetas ─────────────────────────
const G_ORG = "Categorías y etiquetas";

def(G_ORG, "list_categories", "Lista las categorías de recetas.", {}, async () => (await api<any>("GET", "/api/organizers/categories", { query: { perPage: 200 } })).items.map((c: any) => ({ id: c.id, name: c.name, slug: c.slug })), { readOnly: true });
def(G_ORG, "list_tags", "Lista las etiquetas de recetas.", {}, async () => (await api<any>("GET", "/api/organizers/tags", { query: { perPage: 200 } })).items.map((c: any) => ({ id: c.id, name: c.name, slug: c.slug })), { readOnly: true });
def(G_ORG, "delete_category", "BORRA una categoría (las recetas no se borran).", { id: z.string() }, async ({ id }) => { await api("DELETE", `/api/organizers/categories/${id}`); return { deleted: id }; }, { destructive: true });
def(G_ORG, "delete_tag", "BORRA una etiqueta (las recetas no se borran).", { id: z.string() }, async ({ id }) => { await api("DELETE", `/api/organizers/tags/${id}`); return { deleted: id }; }, { destructive: true });

// ───────────────────────── Lista de la compra ─────────────────────────
const G_SHOP = "Lista de la compra";

def(G_SHOP, "list_shopping_lists", "Lista las listas de la compra disponibles.", {}, async () => (await api<any>("GET", "/api/households/shopping/lists", { query: { perPage: 100 } })).items.map((l: any) => ({ id: l.id, name: l.name, items: l.listItems?.length })), { readOnly: true });

def(G_SHOP, "get_shopping_list", "Devuelve una lista de la compra con sus artículos (marcados o no).", {
  id: z.string(),
  onlyPending: z.boolean().default(false).describe("Solo artículos sin marcar"),
}, async ({ id, onlyPending }) => {
  const l = await api<any>("GET", `/api/households/shopping/lists/${id}`);
  const items = (l.listItems ?? []).filter((i: any) => !onlyPending || !i.checked).map((i: any) => ({
    id: i.id, text: i.display || i.note, checked: i.checked, quantity: i.quantity, label: i.label?.name,
  }));
  return { id: l.id, name: l.name, items };
}, { readOnly: true });

def(G_SHOP, "create_shopping_list", "Crea una lista de la compra nueva.", { name: z.string() }, (a) => api("POST", "/api/households/shopping/lists", { body: a }));

def(G_SHOP, "delete_shopping_list", "BORRA una lista de la compra completa. Pide confirmación antes.", { id: z.string() }, async ({ id }) => { await api("DELETE", `/api/households/shopping/lists/${id}`); return { deleted: id }; }, { destructive: true });

def(G_SHOP, "add_shopping_items", "Añade artículos de texto libre a una lista de la compra.", {
  listId: z.string(),
  items: z.array(z.string()).min(1).describe("p. ej. ['leche', '2 kg de patatas']"),
}, async ({ listId, items }) => api("POST", "/api/households/shopping/items/create-bulk", {
  body: items.map((note) => ({ shoppingListId: listId, note, quantity: 1, checked: false })),
}));

def(G_SHOP, "check_shopping_items", "Marca o desmarca artículos de una lista (comprado / pendiente).", {
  ids: z.array(z.string()).min(1),
  checked: z.boolean().default(true),
}, async ({ ids, checked }) => {
  const items = await Promise.all(ids.map((id) => api<any>("GET", `/api/households/shopping/items/${id}`)));
  return api("PUT", "/api/households/shopping/items", { body: items.map((i) => ({ ...i, checked })) });
});

def(G_SHOP, "delete_shopping_items", "BORRA artículos de una lista de la compra.", { ids: z.array(z.string()).min(1) }, async ({ ids }) => {
  await api("DELETE", "/api/households/shopping/items", { query: { ids } });
  return { deleted: ids.length };
}, { destructive: true });

def(G_SHOP, "add_recipe_to_shopping_list", "Añade los ingredientes de una receta a una lista de la compra (escalable por raciones).", {
  listId: z.string(),
  recipeId: z.string().describe("Id (no slug) de la receta; sale en search_recipes / get_recipe"),
  scale: z.number().positive().default(1).describe("Multiplicador de cantidades"),
}, ({ listId, recipeId, scale }) => api("POST", `/api/households/shopping/lists/${listId}/recipe/${recipeId}`, { body: { recipeIncrementQuantity: scale } }));

// ───────────────────────── Menú semanal ─────────────────────────
const G_PLAN = "Menú semanal";

def(G_PLAN, "get_mealplan", "Devuelve lo planificado entre dos fechas (ambas incluidas), ordenado por día y tipo de comida.", {
  startDate: date,
  endDate: date,
}, async ({ startDate, endDate }) => {
  const r = await api<any>("GET", "/api/households/mealplans", { query: { start_date: startDate, end_date: endDate, perPage: 200, orderBy: "date", orderDirection: "asc" } });
  return r.items.map(entry);
}, { readOnly: true });

def(G_PLAN, "add_mealplan_entry", "Planifica una comida: con 'recipeId' (receta) o con 'title' (nota libre, p. ej. 'Comemos fuera').", {
  date,
  entryType: entryType.default("dinner"),
  recipeId: z.string().optional(),
  title: z.string().optional(),
  text: z.string().optional(),
}, ({ date, entryType, recipeId, title, text }) => {
  if (!recipeId && !title) throw new Error("Indica recipeId o title.");
  return api("POST", "/api/households/mealplans", { body: { date, entryType, recipeId, title: title ?? "", text: text ?? "" } }).then(entry);
});

def(G_PLAN, "update_mealplan_entry", "Cambia la fecha, tipo, receta o texto de una entrada del menú.", {
  id: z.number().int(),
  date: date.optional(),
  entryType: entryType.optional(),
  recipeId: z.string().optional(),
  title: z.string().optional(),
  text: z.string().optional(),
}, async ({ id, ...rest }) => {
  const cur = await api<any>("GET", `/api/households/mealplans/${id}`);
  return entry(await api("PUT", `/api/households/mealplans/${id}`, { body: { ...cur, ...rest } }));
});

def(G_PLAN, "delete_mealplan_entry", "Quita una entrada del menú semanal.", { id: z.number().int() }, async ({ id }) => {
  await api("DELETE", `/api/households/mealplans/${id}`);
  return { deleted: id };
}, { destructive: true });

def(G_PLAN, "random_mealplan_entry", "Planifica una receta aleatoria (según las reglas del menú de Mealie) para un día y comida.", {
  date,
  entryType: entryType.default("dinner"),
}, ({ date, entryType }) => api("POST", "/api/households/mealplans/random", { body: { date, entryType } }).then(entry));

// ───────────────────────── Auxiliares ─────────────────────────

const entry = (e: any) => ({
  id: e.id,
  date: e.date,
  entryType: e.entryType,
  title: e.title || undefined,
  text: e.text || undefined,
  recipe: e.recipe ? { id: e.recipe.id, slug: e.recipe.slug, name: e.recipe.name } : undefined,
});

const put = (slug: string, body: unknown) => api<any>("PUT", `/api/recipes/${encodeURIComponent(slug)}`, { body });

/** Convierte líneas de texto en objetos de ingrediente de Mealie (analizados o solo como nota). */
async function toIngredients(lines: string[], parse: boolean): Promise<any[]> {
  if (parse) {
    try {
      const parsed = await api<any[]>("POST", "/api/parser/ingredients", { body: { parser: "nlp", ingredients: lines } });
      const out = [];
      for (let i = 0; i < parsed.length; i++) {
        const ing = parsed[i].ingredient;
        out.push({
          ...ing,
          unit: await resolveRef("units", ing.unit),
          food: await resolveRef("foods", ing.food),
          originalText: lines[i],
          referenceId: crypto.randomUUID(),
        });
      }
      return out;
    } catch {
      // si el analizador falla, se guardan como texto libre
    }
  }
  return lines.map((note) => ({ quantity: 0, unit: null, food: null, note, originalText: note, referenceId: crypto.randomUUID() }));
}

/** Mealie exige que unidad/alimento tengan id: busca por nombre y, si no existe, lo crea. */
async function resolveRef(kind: "units" | "foods", ref: any) {
  if (!ref?.name || ref.id) return ref ?? null;
  const found = (await api<any>("GET", `/api/${kind}`, { query: { search: ref.name, perPage: 50 } })).items.find(
    (x: any) => x.name.toLowerCase() === ref.name.toLowerCase(),
  );
  return found ?? (await api<any>("POST", `/api/${kind}`, { body: { name: ref.name } }));
}

/** Aplica sobre una receta existente los campos indicados (categorías y etiquetas por nombre). */
async function patchRecipe(slug: string, a: Record<string, any>) {
  const r = await getRecipe(slug);
  const next: Record<string, any> = { ...r };
  for (const k of ["name", "description", "recipeYield", "prepTime", "performTime", "totalTime", "rating"]) {
    if (a[k] !== undefined) next[k] = a[k];
  }
  if (a.ingredients) next.recipeIngredient = await toIngredients(a.ingredients, a.parse ?? true);
  if (a.instructions) next.recipeInstructions = a.instructions.map((text: string) => ({ title: "", summary: "", text, ingredientReferences: [] }));
  if (a.notes) next.notes = a.notes.map((text: string) => ({ title: "", text }));
  if (a.categories) next.recipeCategory = await ensureOrganizers("categories", a.categories);
  if (a.tags) next.tags = await ensureOrganizers("tags", a.tags);
  return brief(await put(r.slug, next));
}

async function ensureOrganizers(kind: "categories" | "tags", names: string[]) {
  const existing = (await api<any>("GET", `/api/organizers/${kind}`, { query: { perPage: 500 } })).items as any[];
  const out = [];
  for (const name of names) {
    const found = existing.find((o) => o.name.toLowerCase() === name.toLowerCase());
    out.push(found ?? (await api<any>("POST", `/api/organizers/${kind}`, { body: { name } })));
  }
  return out.map((o) => ({ id: o.id, name: o.name, slug: o.slug }));
}
