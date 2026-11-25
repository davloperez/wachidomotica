/** Cliente mínimo de la API REST de Mealie (v3). */

const BASE = (process.env.MEALIE_URL ?? "http://192.168.0.10:9000").replace(/\/+$/, "");
const TOKEN = process.env.MEALIE_API_TOKEN;

export class MealieError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Query = Record<string, string | number | boolean | string[] | undefined>;

export async function api<T = unknown>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  opts: { query?: Query; body?: unknown; form?: FormData } = {},
): Promise<T> {
  if (!TOKEN) throw new Error("Falta MEALIE_API_TOKEN en el entorno (.env).");
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v === undefined || v === "") continue;
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
    else url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/json",
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new MealieError(res.status, `Mealie ${res.status} en ${method} ${path}: ${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : null) as T;
}

/** Resuelve una receta por slug o id y devuelve el objeto completo. */
export const getRecipe = (slug: string) => api<Record<string, any>>("GET", `/api/recipes/${encodeURIComponent(slug)}`);
