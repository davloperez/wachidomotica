import { ROOM_BY_ID } from "../house/rooms";

/** Vista general de la casa (pestaña «Casa»). El resto de vistas son los `id` de `house/rooms.ts`. */
export const HOME = "home";

/**
 * Vista por defecto de cada dashboard de Home Assistant.
 *
 * Todos estos dashboards cargan la misma tarjeta (`custom:functional-v2`, mismo bundle y misma
 * configuración, ver `deploy.json`); solo cambia aquello con lo que arrancan y a lo que vuelven tras
 * `idle_return_seconds` sin tocar la pantalla. Así cada panel de pared muestra su estancia, pero desde
 * él se puede ver y controlar el resto de la casa.
 *
 * Clave = `url_path` del dashboard (primer tramo de la URL: `/<url_path>/main`).
 * Valor = `HOME` o el `id` de una estancia de `house/rooms.ts`.
 * Un dashboard que no esté en la lista arranca en `HOME`.
 */
export const DEFAULT_VIEWS: Record<string, string> = {
  "functional-v2": HOME, //               Casa General (dashboard por defecto de HA) → Casa
  "shelly-x2i-oficina-1": "oficina_1", // Shelly X2i Oficina 1 → Oficina 1
  "shelly-x2i-oficina-2": "oficina_2", // Shelly X2i Oficina 2 → Oficina 2
  "shelly-salon-sur": "salon", //         Shelly Salón Sur     → Salón
  "shelly-salon-este": "salon", //        Shelly Salón Este    → Salón
};

/**
 * Vista por defecto según la URL actual. En desarrollo (o para probar) `?panel=<url_path>` simula
 * estar en ese dashboard, p. ej. `/dev/index.html?mock&panel=shelly-x2i-oficina-1`.
 */
export function defaultView(loc: Location = window.location): string {
  const panel =
    new URLSearchParams(loc.search).get("panel") ?? loc.pathname.split("/").filter(Boolean)[0] ?? "";
  const view = DEFAULT_VIEWS[panel] ?? HOME;
  return view === HOME || ROOM_BY_ID.has(view) ? view : HOME;
}
