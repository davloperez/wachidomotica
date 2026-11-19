import { ROOM_BY_ID } from "../house/rooms";

/** Vista general de la casa (pestaña «Casa»). El resto de vistas son los `id` de `house/rooms.ts`. */
export const HOME = "home";

export interface PanelDef {
  /** Vista con la que arranca y a la que vuelve por inactividad: `HOME` o el `id` de una estancia. */
  view: string;
  /**
   * Sensor de luz (lux) del propio panel. Con el tema en «auto», decide claro u oscuro (ver
   * `LuxTheme` en `lib/theme.ts`). Sin él, «auto» sigue el modo oscuro de Home Assistant.
   */
  lux?: string;
}

/**
 * Dashboards de Home Assistant que cargan esta tarjeta.
 *
 * Todos usan la misma tarjeta (`custom:functional-v2`, mismo bundle y misma configuración, ver
 * `deploy.json`); solo cambia la vista con la que arrancan (y a la que vuelven tras
 * `idle_return_seconds` sin tocar la pantalla) y el sensor de luz del que sale el tema. Así cada panel
 * de pared muestra su estancia, pero desde él se puede ver y controlar el resto de la casa.
 *
 * Clave = `url_path` del dashboard (primer tramo de la URL: `/<url_path>/…`).
 * Un dashboard que no esté en la lista arranca en `HOME` y sin sensor de luz.
 */
export const PANELS: Record<string, PanelDef> = {
  // Casa General (dashboard por defecto de HA; móviles y ordenadores) → Casa
  "functional-v2": { view: HOME },
  // Shelly X2i Oficina 1 → Oficina 1
  "shelly-x2i-oficina-1": {
    view: "oficina_1",
    lux: "sensor.oficina_1_shellywalldisplay_oficina1_iluminancia",
  },
  // Shelly X2i Oficina 2 → Oficina 2
  "shelly-x2i-oficina-2": {
    view: "oficina_2",
    lux: "sensor.oficina_2_shellywalldisplay_oficina2_iluminancia",
  },
  // Shelly Cocina → Cocina
  "shelly-cocina": { view: "cocina", lux: "sensor.shelly_salon_sur_iluminancia" },
  // Shelly Salón Este → Salón
  "shelly-salon-este": { view: "salon", lux: "sensor.shellywalldisplay_0205030bbdd8_iluminancia" },
};

/**
 * Panel según la URL actual. En desarrollo (o para probar) `?panel=<url_path>` simula estar en ese
 * dashboard, p. ej. `/dev/index.html?mock&panel=shelly-x2i-oficina-1`.
 */
export function currentPanel(loc: Location = window.location): PanelDef {
  const key =
    new URLSearchParams(loc.search).get("panel") ?? loc.pathname.split("/").filter(Boolean)[0] ?? "";
  const p = PANELS[key];
  if (!p) return { view: HOME };
  return p.view === HOME || ROOM_BY_ID.has(p.view) ? p : { ...p, view: HOME };
}
