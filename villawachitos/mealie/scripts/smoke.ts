// Prueba de humo contra el servidor MCP en marcha: crea y borra datos de prueba "zz-prueba-mcp".
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.argv[2] ?? "http://localhost:8765/mcp";
const client = new Client({ name: "smoke", version: "0" });
await client.connect(new StreamableHTTPClientTransport(new URL(url)));

async function call(name: string, args: Record<string, unknown> = {}) {
  const r: any = await client.callTool({ name, arguments: args });
  const text = r.content?.[0]?.text ?? "";
  if (r.isError) throw new Error(`${name}: ${text}`);
  return text ? JSON.parse(text) : null;
}
const step = (s: string, v?: unknown) => console.log("✔", s, v === undefined ? "" : JSON.stringify(v).slice(0, 200));

step("herramientas", (await client.listTools()).tools.length);
let slug: string | undefined, listId: string | undefined, planId: number | undefined;
try {
  const rec = await call("create_recipe", {
    name: "zz-prueba-mcp", description: "borrar", recipeYield: "2 raciones", totalTime: "20 min",
    ingredients: ["200 g de harina", "2 huevos", "sal"], instructions: ["Mezclar", "Hornear"], tags: ["zz-prueba"], categories: ["zz-prueba"],
  });
  slug = rec.slug; step("create_recipe", rec);
  await call("add_recipe_ingredient", { slug, text: "1 cucharada de aceite" });
  await call("add_recipe_step", { slug, text: "Servir" });
  const full = await call("get_recipe", { slug });
  step("get_recipe", { ing: full.recipeIngredient.map((i: any) => i.display), steps: full.recipeInstructions.length });
  await call("remove_recipe_ingredient", { slug, position: 3 });
  step("search", (await call("search_recipes", { query: "zz-prueba" })).total);

  const day = "2030-01-15";
  const plan = await call("add_mealplan_entry", { date: day, entryType: "dinner", recipeId: full.id });
  planId = plan.id; step("add_mealplan_entry", plan);
  step("get_mealplan", await call("get_mealplan", { startDate: day, endDate: day }));

  const list = await call("create_shopping_list", { name: "zz-prueba-mcp" });
  listId = list.id; step("create_shopping_list");
  await call("add_shopping_items", { listId, items: ["leche", "pan"] });
  await call("add_recipe_to_shopping_list", { listId, recipeId: full.id, scale: 1 });
  const sl = await call("get_shopping_list", { id: listId }); step("get_shopping_list", sl.items.map((i: any) => i.text));
  await call("check_shopping_items", { ids: [sl.items[0].id] });
  await call("delete_shopping_items", { ids: [sl.items[1].id] });
  step("foods", (await call("list_foods", { perPage: 3 })).total);
} finally {
  if (planId) await call("delete_mealplan_entry", { id: planId }).then(() => step("limpieza plan"));
  if (listId) await call("delete_shopping_list", { id: listId }).then(() => step("limpieza lista"));
  if (slug) await call("delete_recipe", { slug }).then(() => step("limpieza receta"));
  for (const k of ["tag", "category"] as const) {
    const items = await call(k === "tag" ? "list_tags" : "list_categories");
    for (const o of items.filter((x: any) => x.name === "zz-prueba")) await call(k === "tag" ? "delete_tag" : "delete_category", { id: o.id });
  }
  await client.close();
}
