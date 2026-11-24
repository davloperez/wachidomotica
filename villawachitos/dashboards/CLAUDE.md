# Dashboards

Custom Lovelace cards for Home Assistant. Each dashboard is an independent npm package
(Vite 8 + TypeScript 6 + Lit 3, Node ≥ 22) built into **one self-contained ES module** (`dist/<name>.js`,
fonts and images inlined) that HA loads from `/local/<name>/`.

## Commands (run inside the dashboard folder)

```bash
npm run typecheck        # tsc --noEmit — fastest check, run after every change
npm run lint             # eslint (typescript-eslint + eslint-plugin-lit)
npm run build            # typecheck + vite build + shared/scripts/check-bundle.mjs
npm run format           # prettier (printWidth 110, double quotes, trailing commas)
```

`npm run deploy` exists but is outward-facing: only run it when the user asks.
Verification = `typecheck` + `lint` (+ `build` when touching bundling/config). There are no tests.

## Dev preview

`preview_start` with name `functional-v2`, then open
`/dev/index.html`. Query params: `?mock` (simulated data), `?dark` / `?light`, `?time=HH:MM` (fixes the sun).
Without `?mock` it uses live HA if `dashboards/.env` has `HA_URL` + `HA_TOKEN` — **live mode calls real services**,
so prefer `?mock` when clicking controls to test.

- `dev/mock-hass.ts` builds the fake `hass` from `src/house/rooms.ts`; new entities/attributes that the UI
  depends on must also be added there or the mock preview won't show them.
- `dev/live-hass.ts` adapts `home-assistant-js-websocket` to the `hass` shape.
- If Vite fails with `ENOSPC` file watchers, `VITE_USE_POLLING=1` is already set in `launch.json`.

## Shared plumbing

- `shared/scripts/deploy.mjs` reads each dashboard's `deploy.json` (bundle, wwwDir, `dashboard` or a `dashboards`
  list, kiosk, `assets` folders) and pushes `dashboard.config.json` as the card config to **every** listed HA
  dashboard (creating it, or syncing title/icon/show_in_sidebar if they differ). The repo is the source of truth for
  those HA dashboard configs: a deploy overwrites whatever was edited in the HA UI.
- `shared/scripts/check-bundle.mjs` fails the build if the bundle contains `process.env`, dev credential
  markers or a JWT. Credentials are only injected via `__DEV_HA_URL__` / `__DEV_HA_TOKEN__` in `vite serve`.
- `.env` lives in `villawachitos/dashboards/.env` (see `.env.example`); a per-dashboard `.env` overrides it.

## functional-v2: one card, several HA dashboards

The same `custom:functional-v2` card (same bundle, same `dashboard.config.json`) is published to all the
dashboards in `functional-v2/deploy.json` → `dashboards`. Only the per-panel settings differ, chosen at runtime from
the URL's first path segment (the dashboard `url_path`) via `PANELS` in `src/lib/panels.ts`: the **default view**
and the panel's own **lux sensor** (drives the "auto" theme):

| HA dashboard (title → `url_path`) | Default view | Lux sensor (auto theme) |
| --- | --- | --- |
| Casa General → `functional-v2` (HA's default dashboard; renamed from "Functional v2", url_path kept) | `home` (Casa) | none → HA dark mode |
| Shelly X2i Oficina 1 → `shelly-x2i-oficina-1` | `oficina_1` | `sensor.oficina_1_shellywalldisplay_oficina1_iluminancia` |
| Shelly X2i Oficina 2 → `shelly-x2i-oficina-2` | `oficina_2` | `sensor.oficina_2_shellywalldisplay_oficina2_iluminancia` |
| Shelly Cocina → `shelly-cocina` (now an X2i; replaced the old "Shelly Salón Sur" / `shelly-salon-sur`) | `cocina` | `sensor.cocina_shelly_cocina_iluminancia` |
| Shelly Salón Este → `shelly-salon-este` | `salon` | `sensor.shellywalldisplay_0205030bbdd8_iluminancia` |
| Shelly Baño 1 → `shelly-bano-1` | `bano_1` | `sensor.bano_1_shelly_bano_1_iluminancia` |
| Shelly Baño 2 → `shelly-bano-2` | `bano_2` | `sensor.bano_2_shelly_bano_2_iluminancia` |
| Shelly Dormitorio 1 → `shelly-dormitorio-1` | `dormitorio_1` | `sensor.dormitorio_1_shelly_dormitorio_1_iluminancia` |
| Shelly Dormitorio 2 → `shelly-dormitorio-2` | `dormitorio_2` | `sensor.dormitorio_2_shelly_dormitorio_2_iluminancia` |
| Shelly Dormitorio 3 → `shelly-dormitorio-3` | `dormitorio_3` | `sensor.dormitorio_3_shelly_dormitorio_3_iluminancia` |

- The panel starts in that view and, after `idle_return_seconds` without touches, returns to it (closing sheets
  and layers, and re-framing the plan if it was panned/zoomed). Every panel can still navigate the whole house.
- Auto theme with a lux sensor = `LuxTheme` in `src/lib/theme.ts`: dark < 50 lx, light > 70 lx (hysteresis), a
  change must hold 90 s; first reading applies at once; unavailable sensor keeps the last decision, or falls back
  to HA dark mode if there never was one. The manual "Tema" button (light/dark, saved per browser) overrides it.
  The Shelly sensors mostly read daylight (≈0–5 lx at night even with lights on). Dev: `?mock` dev-bar **Luz**.
- All wall panels are Shelly Wall Display X2i: occupancy + lux only, **no temperature/humidity** sensor (the home
  "Clima" card shows the A/C and outdoor weather instead). Rooms with their own T&H Zigbee sensor (Oficina 1/2, Baño 2)
  set `temperature`/`humidity` in `rooms.ts` plus `climateFirst: true`: the room view then puts the big "Ambiente"
  card first. The panels themselves are **not shown in the UI** (no
  device in `house/rooms.ts`, no plan marker): their lux sensor is only used, via `PANELS`, for that panel's theme.
- **Adding/removing a wall panel** = add/remove it in **both** `deploy.json` `dashboards` and `PANELS` (with its
  lux sensor, if the device has one), and
  update the table in the dashboard `README.md` and here. Values are `HOME` or a room `id` from `house/rooms.ts`;
  unknown dashboards fall back to `HOME`.
- Never hand-edit those dashboards in HA (the next deploy overwrites them). Dashboard-specific behaviour goes in
  `panels.ts`, not in per-dashboard card configs.
- The Shelly Oficina 1/2 and Salón Este entries in `deploy.json` keep their old HA view paths (`view.path`:
  `oficina-1`, `oficina-2`, `salon`) so the URLs saved on the devices still work; Casa General, Shelly Cocina and
  the Baño/Dormitorio panels use `main`. HA can't change a dashboard's `url_path`: renaming one means a new entry here, deleting the old
  dashboard in HA (the deploy never deletes) and updating the URL on the device. The view path does
  not matter to the card (it only reads the `url_path`).
- Dev: `?panel=<url_path>` simulates a dashboard, e.g. `/dev/index.html?mock&panel=shelly-cocina`.

## functional-v2 map

Element `functional-v2`, sub-elements `fv2-`, for low-power portrait wall panels (Lit, **no three.js**). `house/rooms.ts` is where devices live (add new devices there), `house/layers.ts` defines the layers. Hard rules for performance: opaque colors only (no `rgba`/`color-mix` with transparency,
no `backdrop-filter`/`filter`), animate only `transform`/`opacity` (never `box-shadow`), fonts ≥ 13 px.

| File | Role |
| --- | --- |
| `src/functional-dashboard.ts` | Root: layout (plan on top / left, cards below / right, room dock), plan markers, routing, idle return, priority alerts |
| `src/lib/panels.ts` | `PANELS`: HA dashboard `url_path` → default view + lux sensor (see section above) |
| `src/plan/house-plan.ts` | Floor-plan geometry: rooms, walls, lamps, furniture, gates, pool |
| `src/plan/geometry.ts` | 2D geometry from the plan (world px, `PX` per metre), static SVG strings, framing boxes |
| `src/plan/floor-plan.ts` | `fv2-plan`: pan/pinch/wheel/double-tap zoom on a single transformed layer; markers are slotted and keep size via `--inv` |
| `src/lib/alerts.ts` | **Catálogo de avisos** (`ALERT_RULES`): cada aviso posible es una regla (grupo, niveles, «cuándo salta», entidades que vigila, `check`). `computeAlerts` (panel _Avisos_) y `alertCatalog` (hoja «Todos los avisos») salen de ahí |
| `src/widgets/alerts-sheet.ts` | `fv2-alerts-sheet`: hoja con todo el catálogo, activos arriba y el resto agrupado. Se abre con `open-alerts` desde el botón del panel _Avisos_ (`home-view.ts`) |
| `src/lib/meals.ts`, `src/widgets/meals-sheet.ts` | Menú de comidas de Mealie: `fetchMealplan` / `fetchRecipe` (servicios `mealie.*` con `call_service` + `return_response` por `callWS`), tarjeta _Menú_ en `home-view.ts` (`menu()`) y hoja `fv2-meals-sheet` (calendario semanal + receta), que abre el evento `open-meals`. Necesita `mealie` (entry_id) en la config de la tarjeta; las imágenes (`mealImage`) salen de Mealie en el puerto 9000 del add-on (`mealie_url` opcional, solo con HA por http); el mock devuelve un menú de ejemplo |
| `src/lib/priority.ts`, `src/widgets/priority-alert.ts` | Full-screen priority alerts (Fermax doorbell, kitchen smoke detector, Dreame leak) |
| `src/styles/tokens.ts` | Opaque tokens, plan colors (`--p-*`) and the `.anim-*` keyframes for active devices |
| `marker_positions` (card config) | Per-marker `[x, z]` metre overrides (key = `LayerItem.key`, `gates`, `room:<id>`). Authored with the desktop-only "Editar" mode in `functional-dashboard.ts` (drag, then "Exportar JSON" → paste into `dashboard.config.json`); wall panels only read the config |

Mock preview (`?mock`) has dev-bar buttons to fire the doorbell, the smoke detector and the leak.

## Avisos: mantener el catálogo al día

La hoja «Todos los avisos» muestra **todos** los avisos posibles aunque no estén activos, así que el
catálogo (`ALERT_RULES` en `src/lib/alerts.ts`) debe reflejar siempre lo que hay en Home Assistant:

- **Aviso nuevo** (o cambia un umbral, un nivel o un texto): añadir o editar su `AlertRule` — `group`, `levels`,
  `title`, `when` (frase «Salta si…», en español), `entities` y `check`. Nunca crear avisos fuera de `ALERT_RULES`
  (no sumarlos a mano en `home-view.ts`), o no aparecerían en la hoja.
- **Aviso eliminado**: borrar la regla; si era una alerta a pantalla completa, también `priority.ts` y
  `priority-alert.ts`.
- **Dispositivo nuevo o quitado en `house/rooms.ts`**: las reglas por tipo (`leaks`, `doors`, `gates`, `dishwasher`,
  `washer`, `litter`) lo recogen solas. Si es un tipo de dispositivo **nuevo** que debe avisar (p. ej. una batería baja de otro aparato; el detector de humo ya tiene la suya, `smoke` en `RoomDef` + `SMOKE` en `priority.ts`), hace falta una regla nueva. Si cambia un `entity_id`, comprobar que la
  regla que lo usa (`FRIDGE`, `ENERGY`, `DOORBELL`, `VACUUM_LEAK`…) sigue apuntando a él.
- Las reglas `fullscreen: true` reflejan las alertas de `priority.ts` (timbre y fuga del limpiasuelos): mantenerlas
  sincronizadas con ese archivo.
- El orden de `ALERT_RULES` fija el orden de los avisos del mismo nivel en el panel _Avisos_.
- Tras cualquier cambio de avisos: `npm run typecheck && npm run lint`, probar la hoja con `?mock` y actualizar el
  `README.md` del dashboard si cambia algo visible para el usuario.
